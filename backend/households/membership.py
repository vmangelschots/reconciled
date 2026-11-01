"""Which household a signed-in user is working in."""

from django.db.models import F

from .models import Household, Membership

SESSION_KEY = "household_id"


def memberships_of(user):
    return Membership.objects.filter(user=user).select_related("household")


def last_used(user):
    return (
        memberships_of(user)
        .order_by(F("last_used_at").desc(nulls_last=True), "id")
        .first()
    )


def active_household(request, user):
    """The session's household if the user still belongs to it, or else the
    one they last used. None when they belong to none. Checked on every
    request, so a removed member can't keep their household."""
    session = getattr(request, "session", None)
    wanted = session.get(SESSION_KEY) if session is not None else None
    if wanted is not None:
        membership = memberships_of(user).filter(household_id=wanted).first()
        if membership:
            return membership.household
    membership = last_used(user)
    return membership.household if membership else None


def households_of(user):
    return Household.objects.filter(memberships__user=user)
