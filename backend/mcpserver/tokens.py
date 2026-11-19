"""Which token a request carries, and whether it still works."""

from datetime import timedelta

from django.utils import timezone

from households.models import Membership

from .models import TOKEN_PREFIX, AccessToken, token_hash

# last_used_at is a hint, not an audit log: one write a minute is plenty.
LAST_USED_EVERY = timedelta(minutes=1)


def usable_token(secret):
    """The token for `secret` if it works right now, else None. Every kind of
    bad token looks the same from outside. Checked on every request, so
    leaving the household or a deactivated login ends access at once, and
    rejoining brings it back - see openspec/specs/access-tokens."""
    if not secret or not secret.startswith(TOKEN_PREFIX):
        return None
    token = (
        AccessToken.objects.select_related("user", "household")
        .filter(token_hash=token_hash(secret), revoked_at=None)
        .first()
    )
    if token is None or not token.user.is_active:
        return None
    if not Membership.objects.filter(user=token.user, household=token.household).exists():
        return None
    return token


def mark_used(token, now=None):
    now = now or timezone.now()
    if token.last_used_at is not None and now - token.last_used_at < LAST_USED_EVERY:
        return
    AccessToken.objects.filter(pk=token.pk).update(last_used_at=now)
    token.last_used_at = now
