"""Managing personal access tokens from Settings. See openspec/specs/access-tokens."""

from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.response import Response
from rest_framework.views import APIView

from households.context import current_household

from .models import AccessToken


def _token_row(token):
    return {
        "id": token.id,
        "name": token.name,
        "shown": token.shown,
        "created_at": token.created_at,
        "last_used_at": token.last_used_at,
    }


def _my_tokens(request):
    """The caller's own working tokens for the active household only."""
    return AccessToken.objects.filter(user=request.user, household=current_household(), revoked_at=None)


class TokensView(APIView):
    def get(self, request):
        return Response([_token_row(t) for t in _my_tokens(request)])

    def post(self, request):
        name = str(request.data.get("name") or "").strip()
        if not name:
            return Response({"name": ["Give the token a name."]}, status=400)
        if len(name) > AccessToken._meta.get_field("name").max_length:
            return Response({"name": ["Keep the name under 100 characters."]}, status=400)
        token, secret = AccessToken.issue(request.user, current_household(), name)
        return Response({**_token_row(token), "token": secret}, status=201)


class TokenView(APIView):
    def delete(self, request, pk):
        token = get_object_or_404(_my_tokens(request), pk=pk)
        token.revoked_at = timezone.now()
        token.save(update_fields=["revoked_at"])
        return Response(status=204)
