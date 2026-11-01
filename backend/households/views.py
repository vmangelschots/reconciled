"""Household membership, switching and invites. See openspec/specs/households."""

from django.contrib.auth import authenticate, get_user_model, login, update_session_auth_hash
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from transactions.ai import ai_available

from .context import current_household
from .membership import SESSION_KEY, households_of, last_used, memberships_of
from .models import Invite, Membership, invite_token_hash

NO_HOUSEHOLD = "This login isn't part of a household yet. Ask the person who runs Reconciled to add you."
INVITE_GONE = "This invite link no longer works. Ask for a new one."
USERNAME_TAKEN = "That username is already taken."
WRONG_LOGIN = "Invalid username or password."


def describe_user(request, household=None):
    household = household or current_household()
    return {
        "username": request.user.username,
        "household": {"id": household.pk, "name": household.name},
        "households": [{"id": h.pk, "name": h.name} for h in households_of(request.user)],
    }


def _can_leave(user, household):
    return memberships_of(user).count() > 1 and household.memberships.count() > 1


def _invite_row(invite):
    return {
        "id": invite.id,
        "created_by": invite.created_by.username if invite.created_by else None,
        "expires_at": invite.expires_at,
    }


def _pending_invites(household):
    return [
        invite
        for invite in household.invites.select_related("created_by").filter(used_at=None, revoked_at=None)
        if invite.usable
    ]


class HouseholdView(APIView):
    def get(self, request):
        household = current_household()
        members = household.memberships.select_related("user").order_by("user__username")
        return Response(
            {
                "id": household.pk,
                "name": household.name,
                "members": [{"username": m.user.username, "you": m.user_id == request.user.pk} for m in members],
                "invites": [_invite_row(i) for i in _pending_invites(household)],
                "can_leave": _can_leave(request.user, household),
                "ai_available": ai_available(),
                "ai_enabled": household.ai_enabled,
            }
        )


class AiView(APIView):
    def put(self, request):
        household = current_household()
        household.ai_enabled = bool(request.data.get("enabled"))
        household.ai_enabled_by = request.user if household.ai_enabled else None
        household.ai_enabled_at = timezone.now() if household.ai_enabled else None
        household.save(update_fields=["ai_enabled", "ai_enabled_by", "ai_enabled_at"])
        return Response({"ai_enabled": household.ai_enabled})


class SwitchView(APIView):
    checks_household_header = False

    def post(self, request):
        membership = get_object_or_404(memberships_of(request.user), household_id=request.data.get("household"))
        membership.last_used_at = timezone.now()
        membership.save(update_fields=["last_used_at"])
        request.session[SESSION_KEY] = membership.household_id
        return Response(describe_user(request, membership.household))


class LeaveView(APIView):
    def post(self, request):
        household = current_household()
        if not _can_leave(request.user, household):
            return Response({"detail": "You can't leave this household."}, status=400)
        memberships_of(request.user).filter(household=household).delete()
        request.session[SESSION_KEY] = last_used(request.user).household_id
        return Response(status=204)


class PasswordView(APIView):
    def post(self, request):
        current = request.data.get("current_password") or ""
        new = request.data.get("new_password") or ""
        if not request.user.check_password(current):
            return Response({"detail": "Your current password isn't right."}, status=400)
        try:
            validate_password(new, request.user)
        except ValidationError as e:
            return Response({"detail": " ".join(e.messages)}, status=400)
        request.user.set_password(new)
        request.user.save(update_fields=["password"])
        update_session_auth_hash(request, request.user)
        return Response(status=204)


class InvitesView(APIView):
    def post(self, request):
        invite, token = Invite.issue(current_household(), request.user)
        return Response({**_invite_row(invite), "token": token}, status=201)


class InviteView(APIView):
    def delete(self, request, pk):
        invite = get_object_or_404(Invite, pk=pk, household=current_household(), used_at=None)
        invite.revoked_at = timezone.now()
        invite.save(update_fields=["revoked_at"])
        return Response(status=204)


def _usable_invite(token, *, lock=False):
    """Every kind of bad token looks the same from outside."""
    invites = Invite.objects.select_related("household")
    if lock:
        invites = invites.select_for_update(of=("self",))
    invite = invites.filter(token_hash=invite_token_hash(str(token))).first()
    return invite if invite is not None and invite.usable else None


def _is_member(user, household):
    return user.is_authenticated and memberships_of(user).filter(household=household).exists()


def _new_user(username, password):
    """A login, or (None, the reason)."""
    User = get_user_model()
    if not username or not password:
        return None, "Choose a username and a password."
    if User.objects.filter(username=username).exists():
        return None, USERNAME_TAKEN
    user = User(username=username)
    try:
        user.clean_fields(exclude=["password"])
        validate_password(password, user)
    except ValidationError as e:
        return None, " ".join(e.messages)
    user.set_password(password)
    user.save()
    return user, None


class PublicInviteView(APIView):
    """Open to anyone holding the link; shows nothing without a good one."""

    permission_classes = [AllowAny]

    def get(self, request, token):
        invite = _usable_invite(token)
        if invite is None:
            return Response({"detail": INVITE_GONE}, status=404)
        user = request.user
        return Response(
            {
                "household": invite.household.name,
                "signed_in_as": user.username if user.is_authenticated else None,
                "already_member": _is_member(user, invite.household),
            }
        )


class AcceptInviteView(APIView):
    """Joins as the signed-in user, as an existing login given here, or as a
    new login. `existing` tells the last two apart."""

    permission_classes = [AllowAny]

    @transaction.atomic
    def post(self, request, token):
        invite = _usable_invite(token, lock=True)
        if invite is None:
            return Response({"detail": INVITE_GONE}, status=404)
        if _is_member(request.user, invite.household):
            return Response({"detail": "You're already a member of this household."}, status=400)

        username = request.data.get("username")
        password = request.data.get("password")
        user = request.user
        if not user.is_authenticated:
            if request.data.get("existing"):
                user = authenticate(request, username=username, password=password)
                if user is None:
                    return Response({"detail": WRONG_LOGIN}, status=400)
                if _is_member(user, invite.household):
                    return Response({"detail": "You're already a member of this household."}, status=400)
            else:
                user, problem = _new_user(username, password)
                if problem:
                    return Response({"detail": problem}, status=400)

        now = timezone.now()
        Membership.objects.create(user=user, household=invite.household, last_used_at=now)
        invite.used_at = now
        invite.used_by = user
        invite.save(update_fields=["used_at", "used_by"])
        if not request.user.is_authenticated:
            login(request, user, backend="django.contrib.auth.backends.ModelBackend")
        request.session[SESSION_KEY] = invite.household_id
        return Response(describe_user(request, invite.household))
