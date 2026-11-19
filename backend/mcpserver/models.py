"""Personal access tokens for the MCP endpoint. See openspec/specs/access-tokens.

Not HouseholdScoped: a token is looked up before any household is bound, and
the token is what decides the household."""

import hashlib
import secrets

from django.conf import settings
from django.db import models

TOKEN_PREFIX = "rcn_"
# What the list shows of a token: the prefix and a few characters after it.
SHOWN_CHARS = len(TOKEN_PREFIX) + 6


def token_hash(secret):
    # The secret is 32 random bytes, so a plain digest is enough, as for
    # invite links: a database dump holds no working token.
    return hashlib.sha256(secret.encode()).hexdigest()


class AccessToken(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="access_tokens")
    household = models.ForeignKey("households.Household", on_delete=models.CASCADE, related_name="access_tokens")
    name = models.CharField(max_length=100)
    token_hash = models.CharField(max_length=64, unique=True)
    shown = models.CharField(max_length=SHOWN_CHARS)
    created_at = models.DateTimeField(auto_now_add=True)
    last_used_at = models.DateTimeField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at", "-id"]

    @classmethod
    def issue(cls, user, household, name):
        """A new token and its secret, which exists only here."""
        secret = TOKEN_PREFIX + secrets.token_urlsafe(32)
        token = cls.objects.create(
            user=user, household=household, name=name, token_hash=token_hash(secret), shown=secret[:SHOWN_CHARS]
        )
        return token, secret

    def __str__(self):
        return f"{self.name} ({self.user} in {self.household})"
