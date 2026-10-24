from datetime import date, datetime, timezone as dt_timezone
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from accounts.models import Account
from budgets.models import Category, CategoryLimit
from forecasting.models import RecurringTransaction
from imports.models import ImportSession
from transactions.models import Transaction
from transactions.splits import SplitLine, save_split
from transactions.transfers import link_transfer

TODAY = date(2026, 10, 24)


@patch("reports.views._today", lambda: TODAY)
class OverviewTests(TestCase):
    """The overview scenarios in openspec/specs/overview, at the API."""

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(get_user_model().objects.create_user(username="u", password="x"))
        self.joint = Account.objects.create(name="Joint", account_type="checking", starting_balance_cents=0)
        self.savings = Account.objects.create(name="Savings", account_type="savings", starting_balance_cents=0)
        self.groceries = Category.objects.create(name="Groceries")
        self.restaurants = Category.objects.create(name="Restaurants")
        self.repairs = Category.objects.create(name="Repairs")
        self.income = Category.objects.create(name="Income")

    def txn(self, amount_cents, day, month=10, category=None, account=None, payee="bank line", **kwargs):
        return Transaction.objects.create(
            account=account or self.joint,
            date=date(2026, month, day),
            amount_cents=amount_cents,
            payee=payee,
            category=category,
            **kwargs,
        )

    def limit(self, category, cents, month=None):
        CategoryLimit.objects.create(category=category, month=month, limit_cents=cents)

    def get(self, month="2026-10", account=None):
        return self.client.get(
            reverse("report-overview"), {"month": month, "account": (account or self.joint).pk}
        )

    def body(self, **kwargs):
        response = self.get(**kwargs)
        self.assertEqual(response.status_code, 200, response.content)
        return response.json()

    # --- balance ---

    def test_balance_and_the_months_change_without_transfers_or_tabs(self):
        tabs = Category.objects.create(name="Tabs", is_tab_group=True)
        jan = Category.objects.create(name="Jan", parent=tabs)
        self.txn(240000, 1, category=self.income)
        self.txn(-119000, 3, category=self.groceries)
        link_transfer(self.txn(-50000, 5), self.savings)
        self.txn(-3000, 6, category=jan)
        self.txn(-1000, 30, month=9)

        body = self.body()

        self.assertEqual(body["account"]["balance_cents"], 240000 - 119000 - 50000 - 3000 - 1000)
        self.assertEqual(body["in_out"], {"in_cents": 240000, "out_cents": 119000})

    # --- budget ---

    def test_under_budget_mid_month(self):
        self.limit(self.groceries, 200000)
        self.limit(self.restaurants, 60000)
        self.txn(-150000, 3, category=self.groceries)
        self.txn(-44000, 4, category=self.restaurants)
        self.txn(-12000, 5, category=self.repairs)  # no limit
        self.txn(-21300, 6)  # uncategorized

        budget = self.body()["budget"]

        self.assertEqual(
            {k: budget[k] for k in ("has_limits", "limit_cents", "spent_cents", "outside_cents", "uncategorized_cents")},
            {"has_limits": True, "limit_cents": 260000, "spent_cents": 194000, "outside_cents": 12000,
             "uncategorized_cents": 21300},
        )
        self.assertEqual(budget["days_left"], 8)
        self.assertAlmostEqual(budget["pace"], 24 / 31)

    def test_unbudgeted_spending_doesnt_make_the_budget_over(self):
        self.limit(self.groceries, 260000)
        self.txn(-200000, 3, category=self.groceries)
        self.txn(-90000, 4, category=self.repairs)

        budget = self.body()["budget"]

        self.assertEqual((budget["spent_cents"], budget["outside_cents"]), (200000, 90000))

    def test_a_month_override_replaces_the_default(self):
        self.limit(self.groceries, 30000)
        self.limit(self.groceries, 50000, month=date(2026, 10, 1))

        self.assertEqual(self.body()["budget"]["limit_cents"], 50000)

    def test_a_past_month_has_no_pace(self):
        self.limit(self.groceries, 30000)

        budget = self.body(month="2026-09")["budget"]

        self.assertEqual((budget["pace"], budget["days_left"]), (None, None))

    def test_no_budgets(self):
        self.txn(-1000, 3, category=self.groceries)

        budget = self.body()["budget"]

        self.assertEqual((budget["has_limits"], budget["limit_cents"], budget["outside_cents"]), (False, 0, 1000))

    def test_tabs_are_not_budgeted(self):
        tabs = Category.objects.create(name="Tabs", is_tab_group=True)
        jan = Category.objects.create(name="Jan", parent=tabs)
        self.txn(-3000, 3, category=jan)

        self.assertEqual(self.body()["budget"]["outside_cents"], 0)

    # --- needs attention ---

    def attention_names(self, **kwargs):
        return [(c["name"], c["share"], c["over"]) for c in self.body(**kwargs)["attention"]["categories"]]

    def test_over_first_by_euros_then_ahead_of_pace_by_share(self):
        household = Category.objects.create(name="Household")
        self.limit(self.groceries, 35000)
        self.limit(household, 10000)
        self.limit(self.restaurants, 20000)
        self.limit(self.repairs, 10000)
        self.txn(-41200, 3, category=self.groceries)  # 62 over
        self.txn(-11000, 3, category=household)  # 10 over, higher share
        self.txn(-18000, 3, category=self.restaurants)  # 90%
        self.txn(-8690, 3, category=self.repairs)  # 86.9% -> 86

        self.assertEqual(
            self.attention_names(),
            [("Groceries", 117, True), ("Household", 110, True), ("Restaurants", 90, False), ("Repairs", 86, False)],
        )

    def test_on_pace_is_not_a_warning(self):
        self.limit(self.restaurants, 20000)
        self.txn(-18000, 3, category=self.restaurants)

        with patch("reports.views._today", lambda: date(2026, 10, 29)):
            self.assertEqual(self.attention_names(), [])

    def test_shares_are_rounded_down(self):
        self.limit(self.restaurants, 20000)
        self.txn(-16990, 3, category=self.restaurants)  # 84.95% stays out

        self.assertEqual(self.attention_names(), [])

    def test_a_past_month_lists_only_what_went_over(self):
        self.limit(self.groceries, 35000)
        self.limit(self.restaurants, 20000)
        self.txn(-38000, 3, month=9, category=self.groceries)
        self.txn(-19000, 3, month=9, category=self.restaurants)

        self.assertEqual(self.attention_names(month="2026-09"), [("Groceries", 108, True)])

    def test_subcategories_carry_their_parent_name(self):
        supermarket = Category.objects.create(name="Supermarket", parent=self.groceries)
        self.limit(supermarket, 10000)
        self.txn(-12000, 3, category=supermarket)

        [item] = self.body()["attention"]["categories"]
        self.assertEqual((item["name"], item["parent_name"]), ("Supermarket", "Groceries"))

    def test_review_and_uncategorized_counts(self):
        self.txn(-1000, 3, category=self.groceries, category_confirmed=False, category_source="history")
        self.txn(-2000, 4)
        self.txn(-3000, 5, month=1)

        attention = self.body()["attention"]

        self.assertEqual((attention["review_count"], attention["uncategorized_count"]), (1, 2))

    def test_last_import_date(self):
        self.assertIsNone(self.body()["account"]["last_import_date"])

        for status, day in ((ImportSession.Status.COMMITTED, 12), (ImportSession.Status.PENDING, 20)):
            session = ImportSession.objects.create(account=self.joint, file_format="csv", raw_content="", status=status)
            ImportSession.objects.filter(pk=session.pk).update(
                updated_at=datetime(2026, 10, day, 10, tzinfo=dt_timezone.utc)
            )

        self.assertEqual(self.body()["account"]["last_import_date"], "2026-10-12")

    # --- forecast ---

    def test_low_point_and_next_recurring(self):
        self.txn(136000, 1)
        RecurringTransaction.objects.create(
            account=self.joint, amount_cents=-95000, payee="Rent", frequency="monthly", start_date=date(2026, 11, 1)
        )

        forecast = self.body()["forecast"]

        self.assertEqual(forecast["next"], {"payee": "Rent", "amount_cents": -95000, "date": "2026-11-01"})
        self.assertEqual((forecast["low_cents"], forecast["low_date"]), (136000 - 3 * 95000, "2027-01-01"))
        self.assertTrue(forecast["has_recurring"])

    def test_nothing_recurring(self):
        self.txn(5000, 1)

        forecast = self.body()["forecast"]

        self.assertEqual((forecast["next"], forecast["has_recurring"], forecast["low_cents"]), (None, False, 5000))

    # --- recent ---

    def test_last_eight_with_a_split_listed_once(self):
        for day in range(1, 11):
            self.txn(-100 * day, day, payee=f"p{day}")
        dinner = self.txn(-6000, 20, payee="Pizzeria")
        save_split(dinner, [SplitLine(-3000, category=self.restaurants), SplitLine(-3000)])
        self.txn(-500, 21, payee="other account", account=self.savings)

        recent = self.body()["recent"]

        self.assertEqual([r["payee"] for r in recent], ["Pizzeria"] + [f"p{d}" for d in range(10, 3, -1)])
        self.assertEqual((recent[0]["part_count"], recent[0]["category_label"]), (2, None))

    def test_recent_labels(self):
        supermarket = Category.objects.create(name="Supermarket", parent=self.groceries)
        tabs = Category.objects.create(name="Tabs", is_tab_group=True)
        jan = Category.objects.create(name="Jan", parent=tabs)
        self.txn(-100, 1, category=supermarket)
        self.txn(-100, 2, category=jan)
        link_transfer(self.txn(-100, 3), self.savings)

        rows = {r["date"]: r for r in self.body()["recent"]}

        self.assertEqual((rows["2026-10-01"]["category_label"], rows["2026-10-01"]["is_tab"]), ("Groceries / Supermarket", False))
        self.assertEqual((rows["2026-10-02"]["category_label"], rows["2026-10-02"]["is_tab"]), ("Tabs / Jan", True))
        self.assertEqual(rows["2026-10-03"]["transfer_account_name"], "Savings")

    # --- errors ---

    def test_bad_month_and_unknown_account(self):
        self.assertEqual(self.get(month="2026-13").status_code, 400)
        self.assertEqual(self.client.get(reverse("report-overview"), {"account": self.joint.pk}).status_code, 400)
        self.assertEqual(
            self.client.get(reverse("report-overview"), {"month": "2026-10", "account": 99999}).status_code, 404
        )
        self.assertEqual(self.client.get(reverse("report-overview"), {"month": "2026-10"}).status_code, 404)
