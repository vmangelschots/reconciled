from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
from io import StringIO
from unittest import mock

from django.contrib import admin
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.db import connection
from django.test import TestCase, TransactionTestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import Account
from transactions.ai import get_guesser
from transactions.models import Transaction

from .context import household_context
from .models import Household, Invite, Membership, invite_token_hash

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
        self.api = signed_in(self.ann)


class LoginTests(Base):
    def login(self, username="ann"):
        return APIClient().post(
            "/api/auth/login/", {"username": username, "password": "correct horse battery"}, format="json"
        )

    def test_a_login_without_a_household_is_told_why(self):
        member("bob")
        response = self.login("bob")
        self.assertEqual(response.status_code, 403)
        self.assertIn("isn't part of a household yet", response.json()["detail"])

    def test_signing_in_opens_the_last_used_household(self):
        Membership.objects.create(user=self.ann, household=self.janssens, last_used_at=timezone.now())
        client = APIClient()
        client.post("/api/auth/login/", {"username": "ann", "password": "correct horse battery"}, format="json")
        self.assertEqual(client.get("/api/auth/me/").json()["household"]["name"], "The Janssens household")


class HouseholdSectionTests(Base):
    def test_names_and_members(self):
        member("bob", self.peeters)
        member("carl", self.janssens)
        body = self.api.get("/api/household/").json()
        self.assertEqual(body["name"], "The Peeters household")
        self.assertEqual(body["members"], [{"username": "ann", "you": True}, {"username": "bob", "you": False}])

    def test_me_lists_every_household(self):
        Membership.objects.create(user=self.ann, household=self.janssens)
        self.assertEqual(
            {h["name"] for h in self.api.get("/api/auth/me/").json()["households"]},
            {"The Peeters household", "The Janssens household"},
        )


class PasswordTests(Base):
    def test_change_stays_signed_in(self):
        response = self.api.post(
            "/api/auth/password/",
            {"current_password": "correct horse battery", "new_password": "a whole new sentence"},
            format="json",
        )
        self.assertEqual(response.status_code, 204)
        self.assertEqual(self.api.get("/api/auth/me/").status_code, 200)
        self.ann.refresh_from_db()
        self.assertTrue(self.ann.check_password("a whole new sentence"))

    def test_wrong_current_password(self):
        response = self.api.post(
            "/api/auth/password/", {"current_password": "nope", "new_password": "a whole new sentence"}, format="json"
        )
        self.assertEqual(response.status_code, 400)
        self.ann.refresh_from_db()
        self.assertTrue(self.ann.check_password("correct horse battery"))


class SwitchTests(Base):
    def setUp(self):
        super().setUp()
        Membership.objects.create(user=self.ann, household=self.janssens)

    def switch(self, household):
        return self.api.post("/api/household/switch/", {"household": household.pk}, format="json")

    def test_switching_changes_what_is_seen(self):
        with household_context(self.janssens):
            Account.objects.create(name="Theirs", account_type="checking", starting_balance_cents=0)
        self.assertEqual(self.api.get("/api/accounts/").json(), [])
        self.assertEqual(self.switch(self.janssens).json()["household"]["id"], self.janssens.pk)
        self.assertEqual([a["name"] for a in self.api.get("/api/accounts/").json()], ["Theirs"])

    def test_a_household_they_dont_belong_to_answers_like_none_at_all(self):
        stranger = Household.objects.create(name="Strangers")
        refused = self.switch(stranger)
        missing = self.api.post("/api/household/switch/", {"household": 999999}, format="json")
        self.assertEqual(refused.status_code, 404)
        self.assertEqual(refused.content, missing.content)

    def test_a_stale_tab_changes_nothing(self):
        stale = str(self.api.get("/api/auth/me/").json()["household"]["id"])
        self.switch(self.janssens)
        response = self.api.post(
            "/api/accounts/",
            {"name": "Oops", "account_type": "checking", "starting_balance_cents": 0},
            format="json",
            HTTP_X_HOUSEHOLD=stale,
        )
        self.assertEqual(response.status_code, 409)
        self.assertFalse(Account.objects.all_households().filter(name="Oops").exists())

    def test_a_stale_tab_cant_restore(self):
        stale = str(self.peeters.pk)
        self.switch(self.janssens)
        with mock.patch("backup.views.restore_backup") as restore:
            response = self.api.post("/api/backup/restore/", {}, format="multipart", HTTP_X_HOUSEHOLD=stale)
        self.assertEqual(response.status_code, 409)
        restore.assert_not_called()

    def test_the_matching_household_passes(self):
        response = self.api.get("/api/accounts/", HTTP_X_HOUSEHOLD=str(self.peeters.pk))
        self.assertEqual(response.status_code, 200)

    def test_removed_from_one_of_two_moves_to_the_other(self):
        Membership.objects.filter(user=self.ann, household=self.peeters).delete()
        response = self.api.get("/api/accounts/", HTTP_X_HOUSEHOLD=str(self.peeters.pk))
        self.assertEqual(response.status_code, 409)
        self.assertEqual(self.api.get("/api/auth/me/").json()["household"]["id"], self.janssens.pk)


class LeaveTests(Base):
    def test_leaving_keeps_the_data_and_opens_the_other_household(self):
        Membership.objects.create(user=self.ann, household=self.janssens)
        member("bob", self.peeters)
        with household_context(self.peeters):
            Account.objects.create(name="Kept", account_type="checking", starting_balance_cents=0)
        self.assertTrue(self.api.get("/api/household/").json()["can_leave"])
        self.assertEqual(self.api.post("/api/household/leave/").status_code, 204)
        self.assertEqual(self.api.get("/api/auth/me/").json()["household"]["id"], self.janssens.pk)
        self.assertTrue(Account.objects.all_households().filter(name="Kept").exists())

    def test_their_only_household(self):
        member("bob", self.peeters)
        self.assertFalse(self.api.get("/api/household/").json()["can_leave"])
        self.assertEqual(self.api.post("/api/household/leave/").status_code, 400)

    def test_the_last_member(self):
        Membership.objects.create(user=self.ann, household=self.janssens)
        self.assertFalse(self.api.get("/api/household/").json()["can_leave"])
        self.assertEqual(self.api.post("/api/household/leave/").status_code, 400)


class InviteTests(Base):
    def invite(self):
        return self.api.post("/api/household/invites/").json()

    def test_the_token_is_not_stored(self):
        created = self.invite()
        invite = Invite.objects.get()
        self.assertNotEqual(invite.token_hash, created["token"])
        self.assertEqual(invite.token_hash, invite_token_hash(created["token"]))

    def test_expires_after_seven_days(self):
        self.invite()
        left = Invite.objects.get().expires_at - timezone.now()
        self.assertAlmostEqual(left.total_seconds(), timedelta(days=7).total_seconds(), delta=60)

    def test_pending_invites_are_listed_without_their_link(self):
        created = self.invite()
        pending = self.api.get("/api/household/").json()["invites"]
        self.assertEqual([p["created_by"] for p in pending], ["ann"])
        self.assertNotIn("token", pending[0])
        self.assertNotIn(created["token"], str(pending))

    def test_revoking_ends_the_link(self):
        created = self.invite()
        self.assertEqual(self.api.delete(f"/api/household/invites/{created['id']}/").status_code, 204)
        self.assertEqual(APIClient().get(f"/api/invites/{created['token']}/").status_code, 404)
        self.assertEqual(self.api.get("/api/household/").json()["invites"], [])

    def test_another_households_invite_cant_be_revoked(self):
        invite, token = Invite.issue(self.janssens)
        self.assertEqual(self.api.delete(f"/api/household/invites/{invite.pk}/").status_code, 404)
        self.assertEqual(APIClient().get(f"/api/invites/{token}/").status_code, 200)


class AcceptTests(Base):
    def setUp(self):
        super().setUp()
        self.invite, self.token = Invite.issue(self.janssens)
        self.url = f"/api/invites/{self.token}/"

    def accept(self, client=None, **body):
        return (client or APIClient()).post(f"{self.url}accept/", body, format="json")

    def test_the_page_names_the_household(self):
        body = APIClient().get(self.url).json()
        self.assertEqual(body, {"household": "The Janssens household", "signed_in_as": None, "already_member": False})

    def test_a_new_person_accepts(self):
        client = APIClient()
        response = self.accept(client, username="newbie", password="correct horse battery")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(client.get("/api/auth/me/").json()["household"]["id"], self.janssens.pk)
        self.invite.refresh_from_db()
        self.assertIsNotNone(self.invite.used_at)

    def test_an_existing_user_accepts_and_keeps_their_households(self):
        response = self.accept(self.api)
        self.assertEqual(response.status_code, 200, response.content)
        me = self.api.get("/api/auth/me/").json()
        self.assertEqual(me["household"]["id"], self.janssens.pk)
        self.assertEqual(len(me["households"]), 2)

    def test_an_existing_login_given_on_the_page(self):
        client = APIClient()
        response = self.accept(client, username="ann", password="correct horse battery", existing=True)
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(client.get("/api/auth/me/").json()["username"], "ann")

    def test_a_wrong_existing_password_leaves_the_invite(self):
        response = self.accept(username="ann", password="nope", existing=True)
        self.assertEqual(response.status_code, 400)
        self.invite.refresh_from_db()
        self.assertIsNone(self.invite.used_at)

    def test_already_a_member_keeps_the_link_working(self):
        Membership.objects.create(user=self.ann, household=self.janssens)
        self.assertTrue(self.api.get(self.url).json()["already_member"])
        self.assertEqual(self.accept(self.api).status_code, 400)
        self.assertEqual(APIClient().get(self.url).status_code, 200)

    def test_a_username_thats_taken(self):
        response = self.accept(username="ann", password="correct horse battery")
        self.assertEqual(response.status_code, 400)
        self.assertIn("taken", response.json()["detail"])
        self.assertEqual(APIClient().get(self.url).status_code, 200)

    def test_a_weak_password(self):
        response = self.accept(username="newbie", password="123")
        self.assertEqual(response.status_code, 400)
        self.assertFalse(User.objects.filter(username="newbie").exists())

    def test_bad_links_all_answer_the_same(self):
        used, used_token = Invite.issue(self.janssens)
        used.used_at = timezone.now()
        used.save()
        expired, expired_token = Invite.issue(self.janssens)
        expired.expires_at = timezone.now() - timedelta(days=1)
        expired.save()
        revoked, revoked_token = Invite.issue(self.janssens)
        revoked.revoked_at = timezone.now()
        revoked.save()
        answers = {
            (r.status_code, r.content)
            for r in (
                APIClient().get(f"/api/invites/{t}/") for t in (used_token, expired_token, revoked_token, "made-up")
            )
        }
        self.assertEqual(len(answers), 1)
        status, content = answers.pop()
        self.assertEqual(status, 404)
        self.assertIn(b"no longer works", content)
        self.assertNotIn(b"Janssens", content)
        self.assertEqual(self.accept_token("made-up").status_code, 404)

    def accept_token(self, token):
        return APIClient().post(f"/api/invites/{token}/accept/", {"username": "x", "password": "y"}, format="json")

    def test_a_link_works_once(self):
        self.accept(username="first", password="correct horse battery")
        self.assertEqual(self.accept(username="second", password="correct horse battery").status_code, 404)


class SimultaneousAcceptTests(TransactionTestCase):
    def test_two_people_cant_share_a_link(self):
        household = Household.objects.create(name="One")
        _invite, token = Invite.issue(household)

        def accept(name):
            try:
                return APIClient().post(
                    f"/api/invites/{token}/accept/",
                    {"username": name, "password": "correct horse battery"},
                    format="json",
                ).status_code
            finally:
                connection.close()

        with ThreadPoolExecutor(2) as pool:
            codes = sorted(pool.map(accept, ["first", "second"]))
        self.assertEqual(codes, [200, 404])
        self.assertEqual(Membership.objects.count(), 1)


class OperatorTests(TestCase):
    def test_create_household_prints_a_working_link(self):
        out = StringIO()
        call_command("create_household", "The Peeters household", url="https://budget.example/", stdout=out)
        token = out.getvalue().strip().rsplit("/", 1)[-1]
        self.assertIn("https://budget.example/invite/", out.getvalue())
        response = APIClient().post(
            f"/api/invites/{token}/accept/", {"username": "new", "password": "correct horse battery"}, format="json"
        )
        self.assertEqual(response.status_code, 200)

    def test_delete_household_leaves_others_alone(self):
        doomed = Household.objects.create(name="Doomed")
        kept = Household.objects.create(name="Kept")
        member("ann", doomed)
        Invite.issue(doomed)
        for household in (doomed, kept):
            with household_context(household):
                account = Account.objects.create(name="A", account_type="checking", starting_balance_cents=0)
                Transaction.objects.create(account=account, date=date(2026, 1, 1), amount_cents=1, payee="p")
        call_command("delete_household", doomed.pk, yes=True, stdout=StringIO())
        self.assertEqual(list(Household.objects.all()), [kept])
        self.assertEqual(Account.objects.all_households().get().household, kept)
        self.assertEqual(Transaction.objects.all_households().count(), 1)

    def test_only_household_models_are_in_the_admin(self):
        data_apps = {"accounts", "budgets", "transactions", "forecasting", "imports", "banksync", "reports", "backup"}
        self.assertFalse({m._meta.app_label for m in admin.site._registry} & data_apps)


@override_settings(AI_CATEGORIZATION_ENABLED=True, OPENAI_API_KEY="key")
class AiChoiceTests(Base):
    def test_off_for_a_new_household(self):
        with household_context(self.peeters):
            self.assertIsNone(get_guesser())

    def test_turning_on_records_who_and_when(self):
        self.assertEqual(self.api.put("/api/household/ai/", {"enabled": True}, format="json").status_code, 200)
        self.peeters.refresh_from_db()
        self.assertTrue(self.peeters.ai_enabled)
        self.assertEqual(self.peeters.ai_enabled_by, self.ann)
        self.assertIsNotNone(self.peeters.ai_enabled_at)

    def test_one_households_choice_doesnt_reach_another(self):
        self.api.put("/api/household/ai/", {"enabled": True}, format="json")
        self.janssens.refresh_from_db()
        self.assertFalse(self.janssens.ai_enabled)

    def test_the_section_needs_a_server_key(self):
        self.assertTrue(self.api.get("/api/household/").json()["ai_available"])
        with override_settings(OPENAI_API_KEY=""):
            self.assertFalse(self.api.get("/api/household/").json()["ai_available"])
