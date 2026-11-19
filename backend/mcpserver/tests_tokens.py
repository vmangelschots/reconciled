"""Tokens: issuing, the checks that make one work, and the Settings API.
See openspec/specs/access-tokens."""

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from households.models import Household, Membership

from .models import TOKEN_PREFIX, AccessToken, token_hash
from .tokens import mark_used, usable_token

User = get_user_model()


def member(username, *households):
    user = User.objects.create_user(username, password="correct horse battery")
    for household in households:
        Membership.objects.create(user=user, household=household)
    return user


def signed_in(user):
    api = APIClient()
    api.force_login(user)
    return api


class Base(TestCase):
    def setUp(self):
        self.peeters = Household.objects.create(name="The Peeters household")
        self.janssens = Household.objects.create(name="The Janssens household")
        self.ann = member("ann", self.peeters)


class IssueTests(Base):
    def test_the_secret_is_stored_only_as_a_hash(self):
        token, secret = AccessToken.issue(self.ann, self.peeters, "Laptop")
        self.assertTrue(secret.startswith(TOKEN_PREFIX))
        self.assertGreater(len(secret), 40)
        self.assertEqual(token.token_hash, token_hash(secret))
        self.assertTrue(secret.startswith(token.shown))
        self.assertLess(len(token.shown), len(secret))
        stored = AccessToken.objects.filter(pk=token.pk).values().get()
        self.assertNotIn(secret, [str(v) for v in stored.values()])

    def test_each_token_is_different(self):
        _, one = AccessToken.issue(self.ann, self.peeters, "One")
        _, two = AccessToken.issue(self.ann, self.peeters, "Two")
        self.assertNotEqual(one, two)


class UsableTests(Base):
    def setUp(self):
        super().setUp()
        self.token, self.secret = AccessToken.issue(self.ann, self.peeters, "Laptop")

    def test_a_working_token(self):
        self.assertEqual(usable_token(self.secret), self.token)

    def test_unknown_or_missing(self):
        self.assertIsNone(usable_token(TOKEN_PREFIX + "nope"))
        self.assertIsNone(usable_token("not-even-a-token"))
        self.assertIsNone(usable_token(""))
        self.assertIsNone(usable_token(None))

    def test_revoked(self):
        self.token.revoked_at = timezone.now()
        self.token.save()
        self.assertIsNone(usable_token(self.secret))

    def test_deactivated_login(self):
        self.ann.is_active = False
        self.ann.save()
        self.assertIsNone(usable_token(self.secret))

    def test_left_the_household_and_came_back(self):
        Membership.objects.filter(user=self.ann, household=self.peeters).delete()
        self.assertIsNone(usable_token(self.secret))
        Membership.objects.create(user=self.ann, household=self.peeters)
        self.assertEqual(usable_token(self.secret), self.token)

    def test_membership_elsewhere_doesnt_count(self):
        Membership.objects.create(user=self.ann, household=self.janssens)
        Membership.objects.filter(user=self.ann, household=self.peeters).delete()
        self.assertIsNone(usable_token(self.secret))


class MarkUsedTests(Base):
    def test_at_most_once_a_minute(self):
        token, _ = AccessToken.issue(self.ann, self.peeters, "Laptop")
        first = timezone.now()
        mark_used(token, first)
        mark_used(token, first + timedelta(seconds=30))
        token.refresh_from_db()
        self.assertEqual(token.last_used_at, first)
        later = first + timedelta(minutes=2)
        mark_used(token, later)
        token.refresh_from_db()
        self.assertEqual(token.last_used_at, later)


class TokenApiTests(Base):
    def setUp(self):
        super().setUp()
        self.api = signed_in(self.ann)

    def test_create_shows_the_token_once(self):
        response = self.api.post("/api/mcp-tokens/", {"name": "Laptop Claude Code"}, format="json")
        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertTrue(body["token"].startswith(TOKEN_PREFIX))
        self.assertEqual(body["name"], "Laptop Claude Code")
        token = AccessToken.objects.get()
        self.assertEqual((token.user, token.household), (self.ann, self.peeters))

        listed = self.api.get("/api/mcp-tokens/").json()
        self.assertEqual([t["name"] for t in listed], ["Laptop Claude Code"])
        self.assertNotIn("token", listed[0])
        self.assertTrue(body["token"].startswith(listed[0]["shown"]))
        self.assertIsNone(listed[0]["last_used_at"])

    def test_a_name_is_required(self):
        for name in ["", "   ", None]:
            response = self.api.post("/api/mcp-tokens/", {"name": name}, format="json")
            self.assertEqual(response.status_code, 400)
            self.assertIn("name", response.json())
        self.assertFalse(AccessToken.objects.exists())

    def test_only_my_tokens_for_the_active_household(self):
        bob = member("bob", self.peeters)
        AccessToken.issue(bob, self.peeters, "Bob's")
        Membership.objects.create(user=self.ann, household=self.janssens)
        AccessToken.issue(self.ann, self.janssens, "Ann at the Janssens")
        AccessToken.issue(self.ann, self.peeters, "Ann at home")
        self.assertEqual([t["name"] for t in self.api.get("/api/mcp-tokens/").json()], ["Ann at home"])

        self.api.post("/api/household/switch/", {"household": self.janssens.pk}, format="json")
        self.assertEqual([t["name"] for t in self.api.get("/api/mcp-tokens/").json()], ["Ann at the Janssens"])

    def test_revoke(self):
        token, secret = AccessToken.issue(self.ann, self.peeters, "Laptop")
        self.assertEqual(self.api.delete(f"/api/mcp-tokens/{token.pk}/").status_code, 204)
        self.assertEqual(self.api.get("/api/mcp-tokens/").json(), [])
        self.assertIsNone(usable_token(secret))
        self.assertEqual(self.api.delete(f"/api/mcp-tokens/{token.pk}/").status_code, 404)

    def test_cant_revoke_someone_elses(self):
        bob = member("bob", self.peeters)
        theirs, secret = AccessToken.issue(bob, self.peeters, "Bob's")
        self.assertEqual(self.api.delete(f"/api/mcp-tokens/{theirs.pk}/").status_code, 404)
        self.assertEqual(usable_token(secret), theirs)

    def test_needs_a_session(self):
        self.assertEqual(APIClient().get("/api/mcp-tokens/").status_code, 401)


class RegularApiTests(Base):
    """access-tokens, "A token can't use the app's regular API"."""

    def test_a_token_isnt_a_session(self):
        _, secret = AccessToken.issue(self.ann, self.peeters, "Laptop")
        api = APIClient()
        api.credentials(HTTP_AUTHORIZATION=f"Bearer {secret}")
        for path in ["/api/transactions/", "/api/auth/me/", "/api/mcp-tokens/"]:
            with self.subTest(path=path):
                self.assertEqual(api.get(path).status_code, 401)
        response = api.post("/api/accounts/", {"name": "X", "account_type": "cash", "starting_balance_cents": 0})
        self.assertIn(response.status_code, (401, 403))


class BackupTests(Base):
    """access-tokens, "Tokens aren't in backups"."""

    def test_backups_leave_tokens_out_and_alone(self):
        token, secret = AccessToken.issue(self.ann, self.peeters, "Laptop")
        api = signed_in(self.ann)
        content = api.get("/api/backup/").content
        self.assertNotIn(token.token_hash.encode(), content)
        self.assertNotIn(token.shown.encode(), content)
        self.assertNotIn(b"Laptop", content)

        upload = SimpleUploadedFile("backup.json", content, content_type="application/json")
        response = api.post("/api/backup/restore/", {"file": upload}, format="multipart")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(usable_token(secret), token)
