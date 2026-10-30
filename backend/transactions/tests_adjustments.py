from datetime import date
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from accounts.models import Account
from budgets.models import Category

from .adjustments import set_value
from .models import Transaction


def euros(amount):
    return round(amount * 100)


class AdjustmentTestCase(TestCase):
    def setUp(self):
        self.client = APIClient()
        user = get_user_model().objects.create_user(username="budgeter", password="irrelevant-for-this-test")
        self.client.force_authenticate(user=user)

    def account(self, name, account_type, balance=0):
        return Account.objects.create(name=name, account_type=account_type, starting_balance_cents=euros(balance))

    def set_value(self, account, on, value):
        return self.client.post(
            reverse("account-set-value", args=[account.id]),
            {"date": on, "value_cents": euros(value)},
            format="json",
        )

    def balance(self, account):
        account.refresh_from_db()
        return account.current_balance_cents

    def adjustments(self, account):
        return list(
            Transaction.objects.filter(account=account, is_adjustment=True)
            .order_by("date")
            .values_list("date", "amount_cents", "adjustment_value_cents")
        )


class SetValueTests(AdjustmentTestCase):
    """The value-adjustments spec's "Set an account's value" and "Loan
    values are entered as what is owed"."""

    def test_revalue_the_house(self):
        house = self.account("House", "property", 295000)
        response = self.set_value(house, "2026-10-01", 310000)
        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertEqual(body["adjustment"]["amount_cents"], euros(15000))
        self.assertEqual(body["adjustment"]["adjustment_value_cents"], euros(310000))
        self.assertEqual(body["adjustment"]["payee"], "Value adjustment")
        self.assertTrue(body["adjustment"]["is_adjustment"])
        self.assertEqual(body["current_balance_cents"], euros(310000))

    def test_a_value_on_an_earlier_date(self):
        funds = self.account("Funds", "investment", 14000)
        Transaction.objects.create(account=funds, date=date(2026, 10, 3), amount_cents=euros(500), payee="Deposit")
        self.set_value(funds, "2026-09-30", 14200)
        self.assertEqual(self.adjustments(funds), [(date(2026, 9, 30), euros(200), euros(14200))])
        self.assertEqual(self.balance(funds), euros(14700))

    def test_same_day_replaces(self):
        house = self.account("House", "property", 295000)
        self.set_value(house, "2026-10-01", 310000)
        self.set_value(house, "2026-10-01", 305000)
        self.assertEqual(self.adjustments(house), [(date(2026, 10, 1), euros(10000), euros(305000))])

    def test_same_value_still_records_the_value(self):
        house = self.account("House", "property", 295000)
        self.set_value(house, "2026-10-01", 295000)
        self.assertEqual(self.adjustments(house), [(date(2026, 10, 1), 0, euros(295000))])

    def test_update_the_mortgage_balance(self):
        mortgage = self.account("Mortgage", "loan", -188000)
        self.set_value(mortgage, "2026-10-01", -187340)
        self.assertEqual(self.adjustments(mortgage), [(date(2026, 10, 1), euros(660), euros(-187340))])
        self.assertEqual(self.balance(mortgage), euros(-187340))

    def test_not_offered_on_a_checking_account(self):
        checking = self.account("Revolut", "checking", 1000)
        response = self.set_value(checking, "2026-10-01", 2000)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.adjustments(checking), [])

    def test_not_offered_on_an_archived_account(self):
        house = self.account("House", "property", 295000)
        house.archived = True
        house.save()
        self.assertEqual(self.set_value(house, "2026-10-01", 310000).status_code, 400)


class SetValueHoldsTests(AdjustmentTestCase):
    """The value-adjustments spec's "A set value holds on its date"."""

    def test_back_dating_keeps_a_later_value(self):
        house = self.account("House", "property", 295000)
        self.set_value(house, "2026-10-15", 310000)
        self.set_value(house, "2026-09-30", 300000)
        self.assertEqual(
            self.adjustments(house),
            [(date(2026, 9, 30), euros(5000), euros(300000)), (date(2026, 10, 15), euros(10000), euros(310000))],
        )
        self.assertEqual(self.balance(house), euros(310000))

    def test_an_earlier_transaction_arrives(self):
        funds = self.account("Funds", "investment", 14700)
        self.set_value(funds, "2026-10-15", 14700)
        Transaction.objects.create(account=funds, date=date(2026, 10, 10), amount_cents=euros(500), payee="Deposit")
        self.assertEqual(self.adjustments(funds), [(date(2026, 10, 15), euros(-500), euros(14700))])
        self.assertEqual(self.balance(funds), euros(14700))

    def test_an_earlier_transaction_arrives_by_import(self):
        funds = self.account("Funds", "investment", 14700)
        self.set_value(funds, "2026-10-15", 14700)
        content = "Posted Date,Amount,Description\n2026-10-10,500.00,Deposit\n"
        upload = self.client.post(
            reverse("importsession-list"),
            {"account": funds.id, "file": SimpleUploadedFile("export.csv", content.encode(), content_type="text/csv")},
            format="multipart",
        )
        session_id = upload.json()["id"]
        preview = self.client.post(
            reverse("importsession-map", args=[session_id]),
            {"date": "Posted Date", "date_format": "YYYY-MM-DD", "amount": "Amount", "description": "Description"},
            format="json",
        )
        indices = [c["index"] for c in preview.json()["candidates"]]
        commit = self.client.post(
            reverse("importsession-commit", args=[session_id]), {"selected_indices": indices}, format="json"
        )
        self.assertEqual(commit.status_code, 201)
        self.assertEqual(self.balance(funds), euros(14700))

    def test_later_transactions_still_count(self):
        funds = self.account("Funds", "investment", 14700)
        self.set_value(funds, "2026-10-15", 14700)
        Transaction.objects.create(account=funds, date=date(2026, 10, 20), amount_cents=euros(300), payee="Deposit")
        self.assertEqual(self.adjustments(funds), [(date(2026, 10, 15), 0, euros(14700))])
        self.assertEqual(self.balance(funds), euros(15000))

    def test_a_starting_balance_edit_keeps_the_value(self):
        house = self.account("House", "property", 295000)
        self.set_value(house, "2026-10-01", 310000)
        self.client.patch(
            reverse("account-detail", args=[house.id]), {"starting_balance_cents": euros(290000)}, format="json"
        )
        self.assertEqual(self.adjustments(house), [(date(2026, 10, 1), euros(20000), euros(310000))])
        self.assertEqual(self.balance(house), euros(310000))


class AdjustmentLedgerTests(AdjustmentTestCase):
    """The value-adjustments spec's "Value adjustments in the ledger"."""

    def setUp(self):
        super().setUp()
        self.house = self.account("House", "property", 295000)
        self.adjustment_id = self.set_value(self.house, "2026-10-01", 310000).json()["adjustment"]["id"]
        self.category = Category.objects.create(name="Housing")
        self.checking = self.account("Revolut", "checking", 1000)

    def url(self, *suffix):
        name = "transaction-" + (suffix[0] if suffix else "detail")
        return reverse(name, args=[self.adjustment_id])

    def test_delete_the_latest_adjustment(self):
        self.assertEqual(self.client.delete(self.url()).status_code, 204)
        self.assertEqual(self.balance(self.house), euros(295000))

    def test_delete_an_earlier_adjustment(self):
        earlier = self.set_value(self.house, "2026-09-30", 300000).json()["adjustment"]["id"]
        self.client.delete(reverse("transaction-detail", args=[earlier]))
        self.assertEqual(self.adjustments(self.house), [(date(2026, 10, 1), euros(15000), euros(310000))])
        self.assertEqual(self.balance(self.house), euros(310000))

    def test_cannot_be_edited(self):
        for body in ({"amount_cents": 100}, {"date": "2026-10-02"}, {"category": self.category.id}, {"notes": "x"}):
            self.assertEqual(self.client.patch(self.url(), body, format="json").status_code, 400, body)
        self.assertEqual(self.adjustments(self.house), [(date(2026, 10, 1), euros(15000), euros(310000))])

    def test_cannot_be_split(self):
        response = self.client.put(
            self.url("split"),
            {"parts": [{"amount_cents": euros(10000)}, {"amount_cents": euros(5000)}]},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_cannot_be_a_transfer(self):
        response = self.client.post(self.url("transfer"), {"account": self.checking.id}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_is_never_a_transfer_match(self):
        # A -15,000.00 in checking marked as a transfer to the house would
        # match the +15,000.00 adjustment by amount and date.
        payment = Transaction.objects.create(
            account=self.checking, date=date(2026, 10, 1), amount_cents=euros(-15000), payee="Notary"
        )
        response = self.client.post(
            reverse("transaction-transfer", args=[payment.id]), {"account": self.house.id}, format="json"
        )
        self.assertNotEqual(response.json()["counterpart"]["id"], self.adjustment_id)

    def test_type_changed_away(self):
        self.client.patch(reverse("account-detail", args=[self.house.id]), {"account_type": "savings"}, format="json")
        self.assertEqual(self.adjustments(self.house), [(date(2026, 10, 1), euros(15000), euros(310000))])
        self.assertEqual(self.set_value(self.house, "2026-10-02", 320000).status_code, 400)
        self.assertEqual(self.client.delete(self.url()).status_code, 204)


@patch("reports.views._today", lambda: date(2026, 10, 24))
class AdjustmentsAreNotIncomeTests(AdjustmentTestCase):
    """The value-adjustments spec's "Value adjustments are neither income
    nor spending", and the dashboard and budgets scenarios that go with
    it."""

    def setUp(self):
        super().setUp()
        self.house = self.account("House", "property", 295000)
        set_value(self.house, date(2026, 10, 1), 31000000)

    def test_not_in_the_months_change(self):
        overview = self.client.get(reverse("report-overview"), {"month": "2026-10"}).json()
        self.assertEqual(overview["in_out"], {"in_cents": 0, "out_cents": 0})
        self.assertEqual(overview["budget"]["uncategorized_cents"], 0)
        report = self.client.get(reverse("report-spending"), {"start": "2026-10", "end": "2026-10"}).json()
        self.assertEqual(report["months"], [])
        summary = self.client.get(reverse("budget-summary"), {"month": "2026-10"}).json()
        self.assertEqual(summary["uncategorized_spent_cents"], 0)

    def test_a_negative_adjustment_is_not_money_out_or_uncategorized_spend(self):
        funds = self.account("Funds", "investment", 20000)
        set_value(funds, date(2026, 3, 10), euros(12000))
        checking = self.account("Revolut", "checking")
        Transaction.objects.create(account=checking, date=date(2026, 3, 5), amount_cents=euros(-50), payee="Shop")
        report = self.client.get(reverse("report-spending"), {"start": "2026-03", "end": "2026-03"}).json()
        self.assertEqual(report["in_out"], [{"month": "2026-03", "in_cents": 0, "out_cents": euros(50)}])
        summary = self.client.get(reverse("budget-summary"), {"month": "2026-03"}).json()
        self.assertEqual(summary["uncategorized_spent_cents"], euros(50))

    def test_not_waiting_for_review(self):
        review = self.client.get(reverse("transaction-review-groups")).json()
        self.assertEqual(review["uncategorized_count"], 0)
        self.assertEqual(review["groups"], [])
        result = self.client.post(reverse("transaction-categorize"), {}, format="json").json()
        self.assertEqual(result["attempted_count"], 0)

    def test_not_matched_by_an_import(self):
        content = "Posted Date,Amount,Description\n2026-10-01,15000.00,Value adjustment\n"
        upload = self.client.post(
            reverse("importsession-list"),
            {
                "account": self.house.id,
                "file": SimpleUploadedFile("export.csv", content.encode(), content_type="text/csv"),
            },
            format="multipart",
        )
        preview = self.client.post(
            reverse("importsession-map", args=[upload.json()["id"]]),
            {"date": "Posted Date", "date_format": "YYYY-MM-DD", "amount": "Amount", "description": "Description"},
            format="json",
        )
        self.assertFalse(preview.json()["candidates"][0]["is_duplicate"])
