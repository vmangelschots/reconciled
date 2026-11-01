from datetime import date
from pathlib import Path
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from households.context import household_context
from households.models import Household
from households.testing import TestCase
from rest_framework.test import APIClient

from imports.models import ImportSession
from transactions.adjustments import set_value
from transactions.models import Transaction

from .models import Account
from .portfolio_import import MAX_FILE_BYTES

SAMPLE = (Path(__file__).parent / "testdata" / "portfolio_sample.xml").read_bytes()
HOLDINGS = 121000
BROKER = 194925
JOINT = 4075


class PortfolioImportTestCase(TestCase):
    def setUp(self):
        self.client = APIClient()
        user = get_user_model().objects.create_user(username="investor", password="irrelevant-for-this-test")
        self.client.force_authenticate(user=user)
        self.account = self.create_account()

    def create_account(self, account_type="investment", balance=0, **fields):
        return Account.objects.create(
            name=account_type, account_type=account_type, starting_balance_cents=balance, **fields
        )

    def preview(self, account=None, content=SAMPLE):
        upload = SimpleUploadedFile("portfolio.xml", content, content_type="text/xml")
        url = reverse("account-portfolio-preview", args=[(account or self.account).id])
        return self.client.post(url, {"file": upload}, format="multipart")

    def save(self, account=None, on="2026-10-30", value=HOLDINGS, excluded=()):
        url = reverse("account-portfolio-import", args=[(account or self.account).id])
        body = {"date": on, "value_cents": value, "excluded_cash_ids": list(excluded)}
        return self.client.post(url, body, format="json")

    def adjustments(self, account=None):
        return list(
            Transaction.objects.filter(account=account or self.account, is_adjustment=True)
            .order_by("date")
            .values_list("date", "adjustment_value_cents")
        )


class PreviewTests(PortfolioImportTestCase):
    def test_the_figures_of_a_file(self):
        account = self.create_account(balance=1800000)
        body = self.preview(account).json()
        self.assertEqual(body["holdings_cents"], HOLDINGS)
        self.assertEqual(body["holdings_count"], 2)
        self.assertEqual(body["oldest_price_date"], "2026-10-29")
        self.assertEqual(body["newest_price_date"], "2026-10-30")
        self.assertEqual(body["value_date"], "2026-10-30")
        self.assertEqual(body["current_balance_cents"], 1800000)
        self.assertFalse(body["has_later_value"])
        self.assertEqual(
            sorted((c["id"], c["balance_cents"], c["included"]) for c in body["cash"]),
            [("cash-broker", BROKER, True), ("cash-joint", JOINT, True)],
        )

    def test_an_empty_cash_account_isnt_listed(self):
        content = SAMPLE.replace(b"<amount>4075</amount>", b"<amount>0</amount>")
        names = [c["name"] for c in self.preview(content=content).json()["cash"]]
        self.assertEqual(names, ["Broker"])

    def test_previewing_changes_nothing(self):
        self.preview()
        self.account.refresh_from_db()
        self.assertEqual(self.adjustments(), [])
        self.assertEqual(self.account.portfolio_excluded_cash, [])

    def test_a_refused_file_says_why(self):
        response = self.preview(content=b"PORTFOLIO\x00 encrypted")
        self.assertEqual(response.status_code, 400)
        self.assertIn("save the file as XML", response.json()["detail"])

    def test_no_file(self):
        url = reverse("account-portfolio-preview", args=[self.account.id])
        self.assertEqual(self.client.post(url, {}, format="multipart").status_code, 400)

    def test_too_large_is_refused_before_reading(self):
        with patch("accounts.portfolio_import.read_portfolio_file") as read:
            response = self.preview(content=b" " * (MAX_FILE_BYTES + 1))
        self.assertEqual(response.status_code, 400)
        self.assertIn("25 MB", response.json()["detail"])
        read.assert_not_called()

    def test_prices_from_the_future_stop_at_today(self):
        with patch("accounts.portfolio_import.timezone.localdate", return_value=date(2026, 10, 29)):
            self.assertEqual(self.preview().json()["value_date"], "2026-10-29")

    def test_a_file_without_holdings_is_dated_today(self):
        content = (
            b"<client><version>70</version><baseCurrency>EUR</baseCurrency>"
            b"<accounts><account><uuid>c</uuid><name>Cash</name><currencyCode>EUR</currencyCode>"
            b"<transactions/></account></accounts></client>"
        )
        with patch("accounts.portfolio_import.timezone.localdate", return_value=date(2026, 11, 3)):
            body = self.preview(content=content).json()
        self.assertEqual(body["value_date"], "2026-11-03")
        self.assertIsNone(body["newest_price_date"])

    def test_a_later_value_is_flagged(self):
        set_value(self.account, date(2026, 11, 15), 5000)
        self.assertTrue(self.preview().json()["has_later_value"])

    def test_a_value_on_the_same_day_isnt_later(self):
        set_value(self.account, date(2026, 10, 30), 5000)
        self.assertFalse(self.preview().json()["has_later_value"])


class WrongAccountTests(PortfolioImportTestCase):
    def assertRejected(self, account):
        self.assertEqual(self.preview(account).status_code, 400)
        self.assertEqual(self.save(account).status_code, 400)
        self.assertEqual(self.adjustments(account), [])

    def test_a_checking_account(self):
        self.assertRejected(self.create_account("checking"))

    def test_a_house(self):
        self.assertRejected(self.create_account("property"))

    def test_an_archived_account(self):
        self.assertRejected(self.create_account(archived=True))

    def test_another_households_account(self):
        with household_context(Household.objects.create(name="Other")):
            theirs = self.create_account()
        self.assertEqual(self.preview(theirs).status_code, 404)
        self.assertEqual(self.save(theirs).status_code, 404)


class SaveTests(PortfolioImportTestCase):
    def test_saving_sets_the_value_on_the_date(self):
        response = self.save(on="2026-10-30", value=2004075)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["current_balance_cents"], 2004075)
        self.assertEqual(self.adjustments(), [(date(2026, 10, 30), 2004075)])

    def test_uploading_twice_replaces_the_value(self):
        self.save(value=100)
        self.save(value=200)
        self.assertEqual(self.adjustments(), [(date(2026, 10, 30), 200)])

    def test_an_older_file_leaves_the_balance(self):
        set_value(self.account, date(2026, 10, 15), 5000)
        response = self.save(on="2026-10-01", value=4000)
        self.assertEqual(response.json()["current_balance_cents"], 5000)
        self.assertEqual(self.adjustments(), [(date(2026, 10, 1), 4000), (date(2026, 10, 15), 5000)])

    def test_nothing_from_the_file_stays(self):
        self.preview()
        self.save()
        self.assertEqual(Transaction.objects.filter(account=self.account).count(), 1)
        self.assertEqual(ImportSession.objects.count(), 0)


class RememberedCashTests(PortfolioImportTestCase):
    def included(self, content=SAMPLE):
        return {c["id"]: c["included"] for c in self.preview(content=content).json()["cash"]}

    def test_the_next_upload_keeps_it_unticked(self):
        self.save(excluded=["cash-broker"])
        self.assertEqual(self.included(), {"cash-broker": False, "cash-joint": True})

    def test_a_renamed_cash_account_stays_unticked(self):
        self.save(excluded=["cash-broker"])
        renamed = SAMPLE.replace(b"<name>Broker</name>", b"<name>New name</name>")
        self.assertFalse(self.included(renamed)["cash-broker"])

    def test_a_new_cash_account_is_ticked(self):
        self.save(excluded=["cash-gone"])
        self.assertTrue(all(self.included().values()))

    def test_nothing_is_remembered_without_saving(self):
        self.preview()
        self.assertTrue(all(self.included().values()))

    def test_ticking_it_again_is_remembered_too(self):
        self.save(excluded=["cash-broker"])
        self.save(excluded=[])
        self.assertTrue(all(self.included().values()))

    def test_it_stays_per_account(self):
        other = self.create_account()
        self.save(excluded=["cash-broker"])
        self.assertTrue(self.preview(other).json()["cash"][0]["included"])

    def test_a_failed_save_remembers_nothing(self):
        Account.objects.filter(pk=self.account.pk).update(account_type="savings")
        self.save(excluded=["cash-broker"])
        self.account.refresh_from_db()
        self.assertEqual(self.account.portfolio_excluded_cash, [])
