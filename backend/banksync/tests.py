import json
from datetime import date, datetime, timedelta, timezone as dt_timezone
from io import BytesIO, StringIO
from unittest import mock
from urllib.error import HTTPError

import jwt
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.serialization import Encoding, NoEncryption, PrivateFormat
from django.contrib.auth import get_user_model
from django.core.exceptions import ImproperlyConfigured
from django.core.management import call_command
from django.test import override_settings
from households.testing import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import Account
from config.settings import _sync_times
from backup.format import build_backup, dump_backup, read_backup, restore_backup
from budgets.models import Category
from households.context import current_household, household_context
from households.models import Household, Membership
from imports.models import ImportSession
from transactions.models import Transaction
from transactions.splits import SplitLine, save_split
from transactions.transfers import link_transfer

from . import client
from .lines import to_candidate, with_references
from .models import BankAccountLink, BankConnection, BankCredentials, SeenBankLine
from .sync import household_lock, next_sync_at, sync_all, sync_every_household, sync_running
from .views import _store_session


def own_credentials(**extra):
    """The test household's Enable Banking application."""
    return BankCredentials.objects.create(app_id="app", private_key="key", **extra)


TEST_KEY = Fernet.generate_key().decode()


def line(reference="r1", amount="21.85", day="2026-10-25", debit=True, payee="Ethias", text=("Verzekeringstaks",), **extra):
    side = "creditor" if debit else "debtor"
    return {
        "entry_reference": reference,
        "status": "BOOK",
        "booking_date": day,
        "value_date": day,
        "transaction_date": None,
        "credit_debit_indicator": "DBIT" if debit else "CRDT",
        "transaction_amount": {"amount": amount, "currency": "EUR"},
        side: {"name": payee} if payee else None,
        "remittance_information": list(text),
        **extra,
    }


class SyncCase(TestCase):
    def setUp(self):
        self.crelan = Account.objects.create(name="Crelan", account_type="checking", starting_balance_cents=0)
        self.revolut = Account.objects.create(name="Revolut", account_type="checking", starting_balance_cents=0)
        self.connection = self.connect("Crelan")
        self.link = self.make_link(self.crelan, "crelan-hash")
        self.feeds = {}
        patcher = mock.patch("banksync.sync.client.fetch_transactions", side_effect=self.fetch)
        self.fetched = patcher.start()
        self.addCleanup(patcher.stop)

    def connect(self, name, days=100):
        return BankConnection.objects.create(
            bank_name=name,
            bank_country="BE",
            session_id=f"{name}-session",
            valid_until=timezone.now() + timedelta(days=days),
        )

    def make_link(self, account, account_hash, connection=None, start=date(2026, 10, 21)):
        return BankAccountLink.objects.create(
            connection=connection or self.connection,
            bank_name="Crelan",
            account_hash=account_hash,
            account_uid=f"{account_hash}-uid",
            account=account,
            start_date=start,
        )

    def fetch(self, uid, date_from, psu_headers=None):
        feed = self.feeds.get(uid, [])
        if isinstance(feed, Exception):
            raise feed
        return feed

    def feed(self, *lines, link=None):
        self.feeds[(link or self.link).account_uid] = list(lines)

    def txns(self, account=None):
        return Transaction.objects.filter(account=account or self.crelan)


@override_settings(HOUSEHOLD_ENCRYPTION_KEYS=[TEST_KEY])
class ClientTests(TestCase):
    def test_off_without_credentials(self):
        self.assertFalse(client.enabled())

    def error(self, status, body):
        return HTTPError("u", status, "", {}, BytesIO(json.dumps(body).encode()))

    def call_with(self, error):
        with mock.patch("banksync.client._token", return_value="t"), mock.patch(
            "banksync.client.urlopen", side_effect=error
        ):
            client.fetch_transactions("uid", date(2026, 10, 1))

    def test_expired_session(self):
        with self.assertRaises(client.SessionEnded):
            self.call_with(self.error(401, {"error": "EXPIRED_SESSION"}))

    def test_a_bad_token_is_not_an_ended_session(self):
        with self.assertRaises(client.BankError) as caught:
            self.call_with(self.error(401, {"error": "WRONG_JWT"}))
        self.assertNotIsInstance(caught.exception, client.SessionEnded)

    def test_rate_limit(self):
        with self.assertRaises(client.RateLimited):
            self.call_with(self.error(429, {"error": "ASPSP_RATE_LIMIT_EXCEEDED"}))

    def test_follows_continuation_key(self):
        pages = [{"transactions": [{"a": 1}], "continuation_key": "k"}, {"transactions": [{"a": 2}]}]
        with mock.patch("banksync.client._call", side_effect=pages) as call:
            lines = client.fetch_transactions("uid", date(2026, 10, 1))
        self.assertEqual(lines, [{"a": 1}, {"a": 2}])
        self.assertEqual(call.call_args_list[1].kwargs["query"]["continuation_key"], "k")


class LineTests(TestCase):
    def test_an_outgoing_payment_with_a_counterparty(self):
        candidate = to_candidate(line(), "Crelan")
        self.assertEqual(candidate["amount_cents"], -2185)
        self.assertEqual(candidate["payee"], "Ethias")
        self.assertEqual(candidate["description"], "Verzekeringstaks")

    def test_no_counterparty(self):
        candidate = to_candidate(line(payee=None, text=("Beheerskosten", "Other")), "Crelan")
        self.assertEqual(candidate["payee"], "Beheerskosten")

    def test_a_credit_is_paid_by_the_debtor_when_both_sides_are_filled(self):
        candidate = to_candidate(line(debit=False, payee="Employer", creditor={"name": "Me"}), "Revolut")
        self.assertEqual(candidate["amount_cents"], 2185)
        self.assertEqual(candidate["payee"], "Employer")

    def test_value_date_is_not_the_date(self):
        candidate = to_candidate(line(value_date="2026-10-24"), "Crelan")
        self.assertEqual(candidate["date"], "2026-10-25")

    def test_the_day_of_payment_wins_when_the_bank_reports_it(self):
        candidate = to_candidate(line(transaction_date="2026-10-23"), "Crelan")
        self.assertEqual(candidate["date"], "2026-10-23")

    def references(self, *lines):
        return [c["reference"] for c in with_references([(l, to_candidate(l, "Crelan")) for l in lines])]

    def test_missing_references_fall_back_and_stay_the_same(self):
        lines = (line(reference=None), line(reference=""))
        first = self.references(*lines)
        self.assertEqual(len(set(first)), 2)
        self.assertEqual(first, self.references(*lines))

    def test_a_repeated_reference_is_not_trusted(self):
        first, second = self.references(line(reference="same", payee="A"), line(reference="same", payee="B"))
        self.assertNotEqual(first, second)
        self.assertNotEqual(first, "same")


class NewLineTests(SyncCase):
    def test_a_booked_line_arrives(self):
        self.feed(line())
        self.assertEqual(sync_all(), 1)
        txn = self.txns().get()
        self.assertEqual((txn.date, txn.amount_cents, txn.payee, txn.notes), (date(2026, 10, 25), -2185, "Ethias", "Verzekeringstaks"))
        self.link.refresh_from_db()
        self.assertIsNotNone(self.link.last_synced_at)
        self.assertEqual(self.link.last_added_count, 1)

    def test_a_pending_line_waits(self):
        self.feed(line(status="PDNG"))
        sync_all()
        self.assertFalse(self.txns().exists())
        self.assertFalse(SeenBankLine.objects.exists())
        self.feed(line())
        sync_all()
        self.assertEqual(self.txns().count(), 1)

    def test_a_line_before_the_start_date(self):
        self.feed(line(day="2026-10-18"))
        sync_all()
        self.assertFalse(self.txns().exists())

    def test_a_zero_amount(self):
        self.feed(line(amount="0.00"))
        sync_all()
        self.assertFalse(self.txns().exists())

    def test_an_unlinked_account_is_left_alone(self):
        self.feeds["other"] = [line()]
        sync_all()
        self.fetched.assert_called_once()
        self.assertEqual(self.fetched.call_args.args[0], self.link.account_uid)

    def test_fetch_window(self):
        self.feed(line())
        sync_all()
        self.assertEqual(self.fetched.call_args.args[1], self.link.start_date)
        self.link.last_synced_at = timezone.now()
        self.link.start_date = date(2020, 1, 1)
        self.link.save()
        sync_all()
        self.assertEqual(self.fetched.call_args.args[1], timezone.localdate() - timedelta(days=10))


class OnceTests(SyncCase):
    def test_a_line_in_two_syncs(self):
        self.feed(line())
        sync_all()
        self.assertEqual(sync_all(), 0)
        self.assertEqual(self.txns().count(), 1)

    def test_two_identical_payments(self):
        self.feed(line("a", "7.80", "2026-10-22", payee="LAGO Mons"), line("b", "7.80", "2026-10-22", payee="LAGO Mons"))
        sync_all()
        self.assertEqual(self.txns().count(), 2)

    def test_a_deleted_line_stays_deleted(self):
        self.feed(line())
        sync_all()
        self.txns().get().delete()
        sync_all()
        self.assertFalse(self.txns().exists())
        self.assertEqual(SeenBankLine.objects.get().transaction, None)

    def test_a_split_line(self):
        self.feed(line("s", "60.00", payee="Pizzeria"))
        sync_all()
        txn = self.txns().get()
        save_split(txn, [SplitLine(-3000), SplitLine(-3000)])
        sync_all()
        self.assertEqual(self.txns().count(), 3)

    def test_after_reconnecting(self):
        self.feed(line())
        sync_all()
        fresh = self.connect("Crelan")
        self.link.connection = fresh
        self.link.account_uid = "new-uid"
        self.link.save()
        self.feeds["new-uid"] = [line()]
        sync_all()
        self.assertEqual(self.txns().count(), 1)


class AdoptionTests(SyncCase):
    def test_a_hand_entered_payment(self):
        mine = Transaction.objects.create(account=self.crelan, date=date(2026, 10, 25), amount_cents=-1200, payee="Bakker", notes="mine")
        self.feed(line("b", "12.00", payee="Bakker", text=("Bread",)))
        self.assertEqual(sync_all(), 0)
        mine.refresh_from_db()
        self.assertEqual((self.txns().count(), mine.notes), (1, "mine"))
        self.assertEqual(SeenBankLine.objects.get().transaction, mine)

    def test_an_existing_line_is_only_used_once(self):
        Transaction.objects.create(account=self.crelan, date=date(2026, 10, 25), amount_cents=-780, payee="LAGO Mons")
        self.feed(line("a", "7.80", payee="LAGO Mons"), line("b", "7.80", payee="LAGO Mons"))
        self.assertEqual(sync_all(), 1)
        self.assertEqual(self.txns().count(), 2)

    def test_a_synced_line_is_never_adopted(self):
        self.feed(line("a", "7.80", payee="LAGO Mons"))
        sync_all()
        self.feed(line("a", "7.80", payee="LAGO Mons"), line("b", "7.80", payee="LAGO Mons"))
        self.assertEqual(sync_all(), 1)
        self.assertEqual(self.txns().count(), 2)


class CounterpartTests(SyncCase):
    def test_bank_line_replaces_a_created_counterpart(self):
        source = Transaction.objects.create(account=self.revolut, date=date(2026, 10, 23), amount_cents=-50000, payee="Out")
        _, counterpart = link_transfer(source, self.crelan)
        self.feed(line("t", "500.00", "2026-10-24", debit=False, payee="Bank"))
        self.assertEqual(sync_all(), 0)
        counterpart.refresh_from_db()
        self.assertEqual((counterpart.date, counterpart.payee, counterpart.created_by_transfer), (date(2026, 10, 24), "Bank", False))
        self.assertEqual(counterpart.transfer_counterpart, source)
        self.assertEqual(self.txns().count(), 1)
        self.assertEqual(SeenBankLine.objects.get().transaction, counterpart)


class AutoLinkTests(SyncCase):
    def setUp(self):
        super().setUp()
        self.other = self.make_link(self.revolut, "revolut-hash")

    def test_a_top_up_between_two_banks(self):
        self.feed(line("o", "200.00", "2026-10-23", payee="Revolut"))
        self.feed(line("i", "200.00", "2026-10-24", debit=False, payee="Me"), link=self.other)
        sync_all()
        out, into = self.txns().get(), self.txns(self.revolut).get()
        self.assertEqual(out.transfer_counterpart, into)
        self.assertIsNone(out.category)

    def test_the_other_side_arrived_in_an_earlier_sync(self):
        guess = Category.objects.create(name="Income")
        into = Transaction.objects.create(account=self.revolut, date=date(2026, 10, 24), amount_cents=20000, payee="Me", category=guess, category_confirmed=False, category_source="ai", category_reason="why")
        self.feed(line("o", "200.00", "2026-10-23"))
        sync_all()
        into.refresh_from_db()
        self.assertEqual(into.transfer_counterpart, self.txns().get())
        self.assertEqual((into.category, into.category_confirmed, into.category_reason), (None, True, ""))

    def test_more_than_one_possible_match(self):
        self.feed(line("o", "50.00", "2026-10-23"))
        self.feed(line("a", "50.00", "2026-10-24", debit=False), line("b", "50.00", "2026-10-25", debit=False), link=self.other)
        sync_all()
        self.assertFalse(Transaction.objects.filter(transfer_counterpart__isnull=False).exists())

    def test_two_lines_for_one_match(self):
        self.feed(line("a", "50.00", "2026-10-23"), line("b", "50.00", "2026-10-24"))
        self.feed(line("i", "50.00", "2026-10-24", debit=False), link=self.other)
        sync_all()
        self.assertFalse(Transaction.objects.filter(transfer_counterpart__isnull=False).exists())

    def test_a_confirmed_category_is_kept(self):
        chosen = Category.objects.create(name="Gift")
        into = Transaction.objects.create(account=self.revolut, date=date(2026, 10, 24), amount_cents=20000, payee="Me", category=chosen)
        self.feed(line("o", "200.00", "2026-10-23"))
        sync_all()
        into.refresh_from_db()
        self.assertEqual((into.transfer_counterpart, into.category), (None, chosen))

    def test_a_split_or_an_unlinked_account_is_not_used(self):
        savings = Account.objects.create(name="Savings", account_type="savings", starting_balance_cents=0)
        Transaction.objects.create(account=savings, date=date(2026, 10, 24), amount_cents=20000, payee="Me")
        split = Transaction.objects.create(account=self.revolut, date=date(2026, 10, 24), amount_cents=20000, payee="Me")
        save_split(split, [SplitLine(10000), SplitLine(10000)])
        self.feed(line("o", "200.00", "2026-10-23"))
        sync_all()
        self.assertIsNone(self.txns().get().transfer_counterpart)

    def test_a_wrong_link_stays_undone(self):
        self.feed(line("o", "200.00", "2026-10-23"))
        self.feed(line("i", "200.00", "2026-10-24", debit=False), link=self.other)
        sync_all()
        out = self.txns().get()
        Transaction.objects.filter(pk=out.pk).update(transfer_counterpart=None)
        Transaction.objects.filter(account=self.revolut).update(transfer_counterpart=None)
        sync_all()
        self.assertFalse(Transaction.objects.filter(transfer_counterpart__isnull=False).exists())


class AfterSyncTests(SyncCase):
    def test_repeat_payees_arrive_categorized(self):
        groceries = Category.objects.create(name="Groceries")
        Transaction.objects.create(account=self.crelan, date=date(2026, 9, 1), amount_cents=-500, payee="Delhaize", category=groceries)
        self.feed(line("a", "9.00", payee="Delhaize"), line("b", "9.50", payee="Nobody"))
        with mock.patch("transactions.categorize.get_guesser", return_value=None):
            sync_all()
        guessed = self.txns().get(payee="Delhaize", amount_cents=-900)
        self.assertEqual((guessed.category, guessed.category_confirmed), (groceries, False))
        self.assertIsNone(self.txns().get(payee="Nobody").category)

    def test_a_transfer_gets_no_guess(self):
        other = self.make_link(self.revolut, "revolut-hash")
        groceries = Category.objects.create(name="Groceries")
        Transaction.objects.create(account=self.crelan, date=date(2026, 9, 1), amount_cents=-500, payee="Topup", category=groceries)
        self.feed(line("a", "200.00", "2026-10-23", payee="Topup"))
        self.feed(line("b", "200.00", "2026-10-24", debit=False, payee="Topup"), link=other)
        with mock.patch("transactions.categorize.get_guesser", return_value=None):
            sync_all()
        self.assertEqual(Transaction.objects.filter(transfer_counterpart__isnull=False, category__isnull=False).count(), 0)

    def test_loans_are_matched(self):
        self.feed(line())
        with mock.patch("imports.ledger.sync_loans") as sync_loans:
            sync_all()
        sync_loans.assert_called_once()

    def test_a_failing_guess_does_not_undo_the_sync(self):
        guesser = mock.Mock(side_effect=TimeoutError)
        self.feed(line())
        with mock.patch("transactions.categorize.get_guesser", return_value=guesser):
            sync_all()
        self.assertEqual(self.txns().count(), 1)


class FailureTests(SyncCase):
    def setUp(self):
        super().setUp()
        self.second = self.connect("Revolut")
        self.other = self.make_link(self.revolut, "revolut-hash", self.second)

    def test_one_bank_is_down(self):
        self.feeds[self.link.account_uid] = client.BankError("Enable Banking couldn't be reached.")
        self.feed(line(), link=self.other)
        self.assertEqual(sync_all(), 1)
        self.link.refresh_from_db()
        self.assertIn("reached", self.link.last_error)
        self.assertIsNone(self.link.last_synced_at)
        self.feed(line("late"))
        sync_all()
        self.link.refresh_from_db()
        self.assertEqual((self.txns().count(), self.link.last_error), (1, ""))

    def test_a_rate_limit(self):
        self.feeds[self.link.account_uid] = client.RateLimited("limited")
        sync_all()
        self.link.refresh_from_db()
        self.assertEqual(self.link.last_error, "limited")
        self.connection.refresh_from_db()
        self.assertFalse(self.connection.ended)

    def test_the_bank_ends_consent_early(self):
        self.feeds[self.link.account_uid] = client.SessionEnded("ended")
        sync_all()
        self.connection.refresh_from_db()
        self.assertTrue(self.connection.ended)
        self.fetched.reset_mock()
        sync_all()
        self.assertEqual([c.args[0] for c in self.fetched.call_args_list], [self.other.account_uid])

    def test_an_unexpected_line_stays_with_its_link(self):
        self.feed({"status": "BOOK"})
        self.feed(line(), link=self.other)
        with self.assertLogs("banksync.sync", "ERROR"):
            sync_all()
        self.assertEqual(self.txns(self.revolut).count(), 1)

    def test_an_ended_consent_does_not_sync(self):
        BankConnection.objects.filter(pk=self.connection.pk).update(valid_until=timezone.now() - timedelta(days=1))
        sync_all()
        self.assertEqual([c.args[0] for c in self.fetched.call_args_list], [self.other.account_uid])

    def test_an_archived_account_does_not_sync(self):
        Account.objects.filter(pk=self.crelan.pk).update(archived=True)
        sync_all()
        self.assertEqual([c.args[0] for c in self.fetched.call_args_list], [self.other.account_uid])

    def test_sync_pressed_during_a_scheduled_run(self):
        with mock.patch("banksync.sync.household_lock") as run:
            run.return_value.__enter__.return_value = False
            self.assertIsNone(sync_all())
        self.fetched.assert_not_called()


class CommandTests(TestCase):
    @override_settings(ENABLE_BANKING_APP_ID="", ENABLE_BANKING_PRIVATE_KEY="")
    def test_no_credentials(self):
        out = StringIO()
        with mock.patch("banksync.sync.sync_all") as sync:
            call_command("sync_banks", stdout=out)
        sync.assert_not_called()
        self.assertIn("isn't set up", out.getvalue())


@override_settings(ENABLE_BANKING_APP_ID="app", ENABLE_BANKING_PRIVATE_KEY="key")
@override_settings(HOUSEHOLD_ENCRYPTION_KEYS=[TEST_KEY])
class ApiTests(SyncCase):
    def setUp(self):
        super().setUp()
        own_credentials()
        self.api = APIClient()
        self.api.force_login(get_user_model().objects.create_user("me", password="x"))

    def session(self, uid="u1", account_hash="crelan-hash"):
        return {
            "session_id": "new-session",
            "access": {"valid_until": (timezone.now() + timedelta(days=180)).isoformat()},
            "accounts": [{"uid": uid, "identification_hash": account_hash, "name": "Joint", "currency": "EUR", "account_id": {"iban": "BE00"}}],
        }

    def authorize(self):
        with mock.patch("banksync.views.client.maximum_consent_seconds", return_value=15552000), mock.patch(
            "banksync.views.client.start_authorization", return_value="https://bank/login"
        ) as start:
            response = self.api.post("/api/bank-sync/authorize/", {"bank_name": "Crelan"}, format="json", HTTP_ORIGIN="https://budget.example")
        self.assertEqual(response.json()["url"], "https://bank/login")
        self.assertEqual(start.call_args.args[2], "https://budget.example/settings/banks")
        return start.call_args.args[3]

    def complete(self, state, session):
        with mock.patch("banksync.views.client.create_session", return_value=session):
            return self.api.post("/api/bank-sync/complete/", {"code": "c", "state": state}, format="json")

    def test_needs_login(self):
        self.assertIn(APIClient().get("/api/bank-sync/").status_code, (401, 403))

    @override_settings(ENABLE_BANKING_APP_ID="", ENABLE_BANKING_PRIVATE_KEY="")
    def test_no_credentials(self):
        BankCredentials.objects.all().delete()
        body = self.api.get("/api/bank-sync/").json()
        self.assertFalse(body["enabled"])
        self.assertEqual(body["credentials"]["state"], "not_set_up")
        self.assertEqual(self.api.post("/api/bank-sync/run/").status_code, 400)

    def test_status_says_whether_a_sync_is_running(self):
        self.assertFalse(self.api.get("/api/bank-sync/").json()["running"])
        with household_lock() as acquired:
            self.assertTrue(acquired)
            self.assertTrue(self.api.get("/api/bank-sync/").json()["running"])
        self.assertFalse(self.api.get("/api/bank-sync/").json()["running"])

    @override_settings(BANK_SYNC_TIMES=[(6, 30), (18, 30)])
    def test_status_gives_the_next_scheduled_sync(self):
        with mock.patch("banksync.sync.timezone.now", return_value=datetime(2026, 11, 11, 10, 0, tzinfo=dt_timezone.utc)):
            body = self.api.get("/api/bank-sync/").json()
        self.assertEqual(body["next_sync_at"], "2026-11-11T18:30:00Z")

    def test_no_schedule_means_no_next_sync(self):
        self.assertIsNone(self.api.get("/api/bank-sync/").json()["next_sync_at"])

    def test_authorize_crelan(self):
        BankConnection.objects.all().delete()
        BankAccountLink.objects.all().delete()
        state = self.authorize()
        self.assertEqual(self.complete(state, self.session(account_hash="fresh")).status_code, 201)
        row = self.api.get("/api/bank-sync/").json()["connections"][0]
        self.assertEqual((row["bank_name"], row["accounts"][0]["iban"], row["ended"]), ("Crelan", "BE00", False))

    def test_wrong_state_creates_nothing(self):
        self.authorize()
        self.assertEqual(self.complete("forged", self.session()).status_code, 400)
        self.assertEqual(BankConnection.objects.count(), 1)

    def test_reconnect_keeps_the_link(self):
        BankConnection.objects.filter(pk=self.connection.pk).update(
            ended_early=True, accounts=[{"uid": "before", "hash": "crelan-hash", "name": "", "iban": "", "currency": "EUR"}]
        )
        self.complete(self.authorize(), self.session(uid="after"))
        self.link.refresh_from_db()
        self.assertEqual(BankConnection.objects.count(), 1)
        self.assertEqual((self.link.account_uid, self.link.connection.ended, self.link.account), ("after", False, self.crelan))

    def test_link_with_the_default_start_date(self):
        BankAccountLink.objects.all().delete()
        self.connection.accounts = [{"uid": "u1", "hash": "h", "name": "", "iban": "", "currency": "EUR"}]
        self.connection.save()
        Transaction.objects.create(account=self.revolut, date=date(2026, 10, 20), amount_cents=-1, payee="x")
        rows = {a["id"]: a for a in self.api.get("/api/bank-sync/").json()["accounts"]}
        self.assertEqual(rows[self.revolut.id]["default_start_date"], "2026-10-21")
        response = self.api.post("/api/bank-sync/links/", {"connection_id": self.connection.id, "uid": "u1", "account_id": self.revolut.id}, format="json")
        self.assertEqual(response.json()["start_date"], "2026-10-21")

    def test_an_account_has_one_link(self):
        self.connection.accounts = [{"uid": "u1", "hash": "h", "name": "", "iban": "", "currency": "EUR"}]
        self.connection.save()
        response = self.api.post("/api/bank-sync/links/", {"connection_id": self.connection.id, "uid": "u1", "account_id": self.crelan.id}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_sync_now(self):
        self.feed(line())
        self.assertEqual(self.api.post("/api/bank-sync/run/", REMOTE_ADDR="1.2.3.4").json(), {"running": False, "added": 1})
        self.assertEqual(self.fetched.call_args.args[2]["Psu-Ip-Address"], "1.2.3.4")

    def test_disconnect(self):
        self.feed(line())
        sync_all()
        with mock.patch("banksync.views.client.end_session") as end:
            self.assertEqual(self.api.delete(f"/api/bank-sync/connections/{self.connection.id}/").status_code, 204)
        end.assert_called_once_with("Crelan-session")
        self.assertFalse(BankAccountLink.objects.exists())
        self.assertEqual(self.txns().count(), 1)


class OverviewTests(SyncCase):
    def setUp(self):
        super().setUp()
        self.api = APIClient()
        self.api.force_login(get_user_model().objects.create_user("me", password="x"))

    def overview(self):
        return self.api.get(reverse("report-overview"), {"month": timezone.localdate().strftime("%Y-%m")}).json()

    def set_consent(self, days, **extra):
        BankConnection.objects.filter(pk=self.connection.pk).update(
            valid_until=timezone.now() + timedelta(days=days), **extra
        )

    def test_consent_ending_soon(self):
        self.set_consent(12)
        self.assertEqual(
            self.overview()["attention"]["reconnect"],
            [{"bank_name": "Crelan", "days_left": 12, "ended": False}],
        )

    def test_consent_has_ended(self):
        self.set_consent(-3)
        self.assertEqual(
            self.overview()["attention"]["reconnect"],
            [{"bank_name": "Crelan", "days_left": -3, "ended": True}],
        )

    def test_the_bank_ended_it_early(self):
        self.set_consent(60, ended_early=True)
        self.assertEqual(self.overview()["attention"]["reconnect"][0]["days_left"], 0)

    def test_plenty_of_time_left(self):
        self.set_consent(60)
        self.assertEqual(self.overview()["attention"]["reconnect"], [])

    def test_a_restored_link_waits(self):
        BankConnection.objects.all().delete()
        self.assertEqual(
            self.overview()["attention"]["reconnect"],
            [{"bank_name": "Crelan", "days_left": None, "ended": True}],
        )

    def row(self):
        return next(a for a in self.overview()["accounts"] if a["id"] == self.crelan.id)

    def test_a_sync_counts_as_an_import(self):
        moment = timezone.now() - timedelta(days=1)
        BankAccountLink.objects.filter(pk=self.link.pk).update(last_synced_at=moment)
        session = ImportSession.objects.create(account=self.crelan, file_format="csv", status="committed", raw_content="")
        session.imported_accounts.add(self.crelan)
        ImportSession.objects.filter(pk=session.pk).update(updated_at=moment - timedelta(days=20))
        row = self.row()
        self.assertEqual(row["last_import_date"], timezone.localdate(moment).isoformat())
        self.assertEqual((row["bank_linked"], row["bank_ended"]), (True, False))

    def test_an_ended_connection_is_marked(self):
        self.set_consent(-1)
        self.assertTrue(self.row()["bank_ended"])


class BackupTests(SyncCase):
    def round_trip(self):
        restore_backup(read_backup(dump_backup(build_backup())))
        self.crelan = Account.objects.get(name="Crelan")

    def test_nothing_about_bank_access_is_in_the_file(self):
        self.link.refresh_from_db()
        text = dump_backup(build_backup())
        self.assertNotIn("Crelan-session", text)
        self.assertNotIn(self.link.account_uid, text)
        self.assertIn(self.link.account_hash, text)

    def test_a_deleted_line_stays_deleted_after_a_restore(self):
        self.feed(line())
        sync_all()
        self.txns().get().delete()
        self.round_trip()
        self.link = BankAccountLink.objects.get()
        self.assertFalse(self.txns().exists())
        self.assertEqual(SeenBankLine.objects.count(), 1)

    def test_a_synced_line_stays_tied_to_its_transaction(self):
        self.feed(line())
        sync_all()
        self.round_trip()
        self.assertEqual(SeenBankLine.objects.get().transaction, self.txns().get())

    def test_reconnect_after_a_restore(self):
        self.round_trip()
        link = BankAccountLink.objects.get()
        self.assertFalse(BankConnection.objects.exists())
        self.assertEqual((link.connection, link.account_uid, link.account.name), (None, "", "Crelan"))
        self.assertEqual(sync_all(), 0)
        self.fetched.assert_not_called()

    def test_an_older_backup_restores_with_no_links(self):
        backup = build_backup()
        backup["data"] = [row for row in backup["data"] if not row["model"].startswith("banksync.")]
        backup["migrations"].pop("banksync")
        restore_backup(read_backup(dump_backup(backup)))
        self.assertFalse(BankAccountLink.objects.exists())


def private_key():
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    return key.private_bytes(Encoding.PEM, PrivateFormat.PKCS8, NoEncryption()).decode()


APP = {"redirect_urls": ["http://testserver/settings/banks"], "active": True, "environment": "PRODUCTION"}


@override_settings(HOUSEHOLD_ENCRYPTION_KEYS=[TEST_KEY], ALLOWED_HOSTS=["testserver"])
class CredentialsTests(TestCase):
    def setUp(self):
        self.api = APIClient()
        self.api.force_login(get_user_model().objects.create_user("me", password="x"))
        self.key = private_key()

    def save(self, app=APP, key=None, error=None):
        kwargs = {"side_effect": error} if error else {"return_value": app}
        with mock.patch("banksync.views.client.application", **kwargs):
            return self.api.post(
                "/api/bank-sync/credentials/", {"app_id": "app-1", "private_key": key or self.key}, format="json"
            )

    def test_ready(self):
        response = self.save()
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.json()["state"], "ready")
        self.assertTrue(client.enabled())

    def test_the_key_is_encrypted_and_never_returned(self):
        response = self.save()
        found = BankCredentials.objects.get()
        secret = self.key.splitlines()[1]
        self.assertNotIn(secret, found.encrypted_key)
        self.assertEqual(found.private_key, self.key)
        self.assertNotIn(secret, response.content.decode())
        self.assertNotIn(secret, self.api.get("/api/bank-sync/").content.decode())

    def test_not_a_private_key_saves_nothing(self):
        response = self.save(key="hello")
        self.assertEqual(response.status_code, 400)
        self.assertIn("isn't a valid private key", response.json()["detail"])
        self.assertFalse(BankCredentials.objects.exists())

    def test_each_failed_check_says_what_is_wrong_and_keeps_the_key(self):
        cases = [
            ("rejected", {"error": client.CredentialsRejected("x")}),
            ("unreachable", {"error": client.Unreachable("x")}),
            ("redirect_missing", {"app": {**APP, "redirect_urls": []}}),
            ("not_active", {"app": {**APP, "active": False}}),
            ("sandbox", {"app": {**APP, "environment": "SANDBOX"}}),
        ]
        for state, kwargs in cases:
            with self.subTest(state=state):
                self.assertEqual(self.save(**kwargs).json()["state"], state)
                self.assertTrue(BankCredentials.objects.exists())

    def test_check_again(self):
        self.save(app={**APP, "active": False})
        with mock.patch("banksync.views.client.application", return_value=APP):
            response = self.api.post("/api/bank-sync/credentials/check/")
        self.assertEqual(response.json()["state"], "ready")

    def test_the_redirect_url_comes_from_where_the_page_is(self):
        body = self.api.get("/api/bank-sync/", HTTP_REFERER="https://budget.example/settings").json()
        self.assertEqual(body["credentials"]["redirect_url"], "https://budget.example/settings/banks")

    def test_replacing_stops_using_the_old_key(self):
        self.save()
        other = private_key()
        self.save(key=other)
        self.assertEqual(BankCredentials.objects.get().private_key, other)

    def test_without_an_encryption_key(self):
        with override_settings(HOUSEHOLD_ENCRYPTION_KEYS=[]):
            self.assertEqual(self.save().status_code, 503)
        self.assertFalse(BankCredentials.objects.exists())

    def test_tokens_are_signed_with_the_households_key(self):
        self.save()
        token = client._token()
        self.assertEqual(jwt.get_unverified_header(token)["kid"], "app-1")

    def test_rotating_keeps_credentials_working(self):
        self.save()
        new = Fernet.generate_key().decode()
        with override_settings(HOUSEHOLD_ENCRYPTION_KEYS=[new, TEST_KEY]):
            call_command("rotate_encryption_key", stdout=StringIO())
        with override_settings(HOUSEHOLD_ENCRYPTION_KEYS=[new]):
            self.assertEqual(BankCredentials.objects.get().private_key, self.key)


@override_settings(HOUSEHOLD_ENCRYPTION_KEYS=[TEST_KEY])
class TwoHouseholdSyncTests(SyncCase):
    def setUp(self):
        super().setUp()
        own_credentials()
        self.other = Household.objects.create(name="Other")
        with household_context(self.other):
            own_credentials()
            self.other_account = Account.objects.create(name="Joint", account_type="checking", starting_balance_cents=0)
            self.other_link = self.make_link(self.other_account, "crelan-hash", connection=self.connect("Crelan"))

    def test_a_joint_account_arrives_once_in_each_household(self):
        self.feed(line())
        results = sync_every_household()
        self.assertEqual(results, {self.household_name(): 1, "Other": 1})
        self.assertEqual(self.txns().count(), 1)
        with household_context(self.other):
            self.assertEqual(Transaction.objects.count(), 1)
        self.assertEqual(sync_every_household(), {self.household_name(): 0, "Other": 0})

    def household_name(self):
        return self.default_household.name

    def test_one_households_failure_leaves_the_other(self):
        self.feed(line())
        original = sync_all

        def flaky():
            if current_household() == self.other:
                raise RuntimeError("boom")
            return original()

        with mock.patch("banksync.sync.sync_all", side_effect=flaky):
            results = sync_every_household()
        self.assertEqual(results, {self.household_name(): 1})

    def test_a_rejected_key_stops_only_that_household_once(self):
        self.feed(line())
        with mock.patch("banksync.sync.client.fetch_transactions", side_effect=client.CredentialsRejected("x")):
            self.assertEqual(sync_all(), 0)
        found = BankCredentials.objects.get()
        self.assertTrue(found.stopped)
        self.assertEqual(found.state, "rejected")
        self.link.refresh_from_db()
        self.link.connection.refresh_from_db()
        self.assertEqual(self.link.last_error, "")
        self.assertFalse(self.link.connection.ended)
        with household_context(self.other):
            self.assertFalse(BankCredentials.objects.get().stopped)

    def test_a_stopped_key_shows_on_the_overview(self):
        BankCredentials.objects.update(stopped=True)
        api = APIClient()
        api.force_authenticate(get_user_model().objects.create_user("me", password="x"))
        body = api.get(reverse("report-overview"), {"month": "2026-10"}).json()
        self.assertTrue(body["attention"]["bank_sync_stopped"] if "attention" in body else body["bank_sync_stopped"])

    def test_a_lock_is_per_household(self):
        with household_lock() as mine:
            self.assertTrue(mine)
            with household_context(self.other), household_lock() as theirs:
                self.assertTrue(theirs)

    def test_another_households_sync_isnt_running_here(self):
        with household_context(self.other), household_lock() as theirs:
            self.assertTrue(theirs)
            self.assertTrue(sync_running())
            with household_context(self.default_household):
                self.assertFalse(sync_running())

    def test_reconnecting_leaves_the_other_household_alone(self):
        session = {
            "session_id": "fresh",
            "access": {"valid_until": (timezone.now() + timedelta(days=180)).isoformat()},
            "accounts": [{"uid": "fresh-uid", "identification_hash": "crelan-hash", "name": "Joint", "currency": "EUR"}],
        }
        _store_session("Crelan", "BE", session, timezone.now())
        self.link.refresh_from_db()
        self.assertEqual(self.link.account_uid, "fresh-uid")
        with household_context(self.other):
            self.other_link.refresh_from_db()
            self.assertEqual(self.other_link.account_uid, "crelan-hash-uid")
            self.assertEqual(BankConnection.objects.get().session_id, "Crelan-session")


@override_settings(HOUSEHOLD_ENCRYPTION_KEYS=[TEST_KEY])
class SwitchDuringAuthorizationTests(TestCase):
    def test_no_connection_lands_in_the_other_household(self):
        one, two = Household.objects.create(name="One"), Household.objects.create(name="Two")
        user = get_user_model().objects.create_user("me", password="x")
        Membership.objects.create(user=user, household=one)
        Membership.objects.create(user=user, household=two)
        for household in (one, two):
            with household_context(household):
                own_credentials()
        api = APIClient()
        api.force_login(user)
        api.post("/api/household/switch/", {"household": one.pk}, format="json")
        with mock.patch("banksync.views.client.maximum_consent_seconds", return_value=100), mock.patch(
            "banksync.views.client.start_authorization", return_value="https://bank"
        ):
            self.assertEqual(
                api.post("/api/bank-sync/authorize/", {"bank_name": "Crelan"}, format="json").status_code, 200
            )
        state = api.session["bank_authorization"]["state"]
        api.post("/api/household/switch/", {"household": two.pk}, format="json")
        with mock.patch("banksync.views.client.create_session") as create:
            response = api.post("/api/bank-sync/complete/", {"state": state, "code": "c"}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("switched household", response.json()["detail"])
        create.assert_not_called()
        self.assertFalse(BankConnection.objects.all_households().exists())


class BootstrapTests(TestCase):
    def run_it(self):
        env = {"BUDGET_APP_USERNAME": "boss", "BUDGET_APP_PASSWORD": "pw"}
        out, err = StringIO(), StringIO()
        with mock.patch.dict("os.environ", env):
            call_command("bootstrap_user", stdout=out, stderr=err)
        return out.getvalue(), err.getvalue()

    def boss_household(self):
        return Membership.objects.get(user__username="boss").household

    def test_a_restart_changes_nothing(self):
        self.run_it()
        self.run_it()
        self.assertEqual(Membership.objects.filter(user__username="boss").count(), 1)

    @override_settings(ENABLE_BANKING_APP_ID="app", ENABLE_BANKING_PRIVATE_KEY="key", HOUSEHOLD_ENCRYPTION_KEYS=[TEST_KEY])
    def test_environment_values_move_to_the_first_household_once(self):
        self.run_it()
        with household_context(self.boss_household()):
            found = BankCredentials.objects.get()
            self.assertEqual(found.private_key, "key")
            found.app_id = "changed"
            found.save()
        self.run_it()
        with household_context(self.boss_household()):
            self.assertEqual(BankCredentials.objects.get().app_id, "changed")

    @override_settings(ENABLE_BANKING_APP_ID="app", ENABLE_BANKING_PRIVATE_KEY="key", HOUSEHOLD_ENCRYPTION_KEYS=[])
    def test_no_encryption_key_logs_and_carries_on(self):
        _out, err = self.run_it()
        self.assertIn("HOUSEHOLD_ENCRYPTION_KEYS", err)
        self.assertFalse(BankCredentials.objects.all_households().exists())

    @override_settings(ENABLE_BANKING_APP_ID="", ENABLE_BANKING_PRIVATE_KEY="")
    def test_nothing_to_move(self):
        self.run_it()
        self.assertFalse(BankCredentials.objects.all_households().exists())


class ScheduleTests(TestCase):
    def at(self, hours, minutes):
        return datetime(2026, 11, 11, hours, minutes, tzinfo=dt_timezone.utc)

    @override_settings(BANK_SYNC_TIMES=[(6, 30), (18, 30)])
    def test_next_time_later_today(self):
        self.assertEqual(next_sync_at(self.at(7, 0)), self.at(18, 30))
        self.assertEqual(next_sync_at(self.at(6, 0)), self.at(6, 30))

    @override_settings(BANK_SYNC_TIMES=[(6, 30), (18, 30)])
    def test_after_the_last_time_it_is_tomorrow(self):
        self.assertEqual(next_sync_at(self.at(18, 30)), datetime(2026, 11, 12, 6, 30, tzinfo=dt_timezone.utc))

    @override_settings(BANK_SYNC_TIMES=[])
    def test_no_schedule(self):
        self.assertIsNone(next_sync_at(self.at(7, 0)))

    def test_reading_the_setting(self):
        self.assertEqual(_sync_times(" 18:30, 06:30 ,"), [(6, 30), (18, 30)])
        self.assertEqual(_sync_times(""), [])

    def test_an_invalid_time_fails_clearly(self):
        for value in ("25:00", "6.30", "06:60", "soon"):
            with self.assertRaisesMessage(ImproperlyConfigured, "isn't a time like 06:30"):
                _sync_times(value)
