import hashlib
import secrets
from datetime import timedelta

from django.conf import settings
from django.db import models
from django.utils import timezone

INVITE_DAYS = 7


class Household(models.Model):
    name = models.CharField(max_length=100)
    # AI categorization is the household's choice: who agreed, and when.
    ai_enabled = models.BooleanField(default=False)
    ai_enabled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    ai_enabled_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name", "id"]

    def __str__(self):
        return self.name


class Membership(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="memberships")
    household = models.ForeignKey(Household, on_delete=models.PROTECT, related_name="memberships")
    last_used_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["user", "household"], name="one_membership_per_household")]

    def __str__(self):
        return f"{self.user} in {self.household}"


def invite_token_hash(token):
    # The token is 32 random bytes, so a plain digest is enough, and a
    # database dump holds no working link.
    return hashlib.sha256(token.encode()).hexdigest()


def invite_expiry():
    return timezone.now() + timedelta(days=INVITE_DAYS)


class Invite(models.Model):
    """One link that lets one person join a household."""

    household = models.ForeignKey(Household, on_delete=models.PROTECT, related_name="invites")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    token_hash = models.CharField(max_length=64, unique=True)
    expires_at = models.DateTimeField(default=invite_expiry)
    used_at = models.DateTimeField(null=True, blank=True)
    used_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    revoked_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at", "id"]

    @classmethod
    def issue(cls, household, created_by=None):
        """A new invite and its token, which exists only here."""
        token = secrets.token_urlsafe(32)
        invite = cls.objects.create(household=household, created_by=created_by, token_hash=invite_token_hash(token))
        return invite, token

    @property
    def usable(self):
        return self.used_at is None and self.revoked_at is None and self.expires_at > timezone.now()

    def __str__(self):
        return f"Invite to {self.household}"
