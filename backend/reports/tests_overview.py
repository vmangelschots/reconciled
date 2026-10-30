from datetime import date, datetime, timezone as dt_timezone
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from accounts.models import Account
from budgets.models import BudgetSettings, Category, CategoryLimit, YearlyBudget
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

    def get(self, month="2026-10"):
        return self.client.get(reverse("report-overview"), {"month": month})

    def body(self, **kwargs):
        response = self.get(**kwargs)
        self.assertEqual(response.status_code, 200, response.content)
        return response.json()

    # --- balance ---

    def test_total_and_per_account_balances(self):
        self.txn(240000, 1, category=self.income)
        self.txn(-119000, 3, category=self.groceries)
        self.txn(50000, 4, account=self.savings, category=self.income)

        body = self.body()

        self.assertEqual(
            [(a["name"], a["balance_cents"]) for a in body["accounts"]],
            [("Joint", 121000), ("Savings", 50000)],
        )
        self.assertEqual(body["balance_cents"], 171000)
        self.assertEqual(body["in_out"], {"in_cents": 290000, "out_cents": 119000})

    def test_the_months_change_leaves_out_transfers_and_tabs(self):
        tabs = Category.objects.create(name="Tabs", is_tab_group=True)
        jan = Category.objects.create(name="Jan", parent=tabs)
        self.txn(240000, 1, category=self.income)
        self.txn(-119000, 3, category=self.groceries)
        link_transfer(self.txn(-50000, 5), self.savings)
        self.txn(-3000, 6, category=jan)
        self.txn(-1000, 30, month=9)

        body = self.body()

        self.assertEqual(body["balance_cents"], 240000 - 119000 - 3000 - 1000)
        self.assertEqual(body["in_out"], {"in_cents": 240000, "out_cents": 119000})

    def test_a_transfer_between_accounts_changes_nothing(self):
        self.txn(100000, 1, month=9)
        before = self.body()["balance_cents"]
        link_transfer(self.txn(-50000, 5), self.savings)

        body = self.body()

        self.assertEqual(body["balance_cents"], before)
        self.assertEqual(body["in_out"], {"in_cents": 0, "out_cents": 0})

    def test_archived_accounts_are_left_out(self):
        old = Account.objects.create(name="Old", account_type="checking", starting_balance_cents=50000, archived=True)

        body = self.body()

        self.assertNotIn(old.id, [a["id"] for a in body["accounts"]])
        self.assertEqual(body["balance_cents"], 0)

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

    def test_last_import_date_per_account(self):
        self.assertEqual([a["last_import_date"] for a in self.body()["accounts"]], [None, None])

        for status, day in ((ImportSession.Status.COMMITTED, 12), (ImportSession.Status.COMMITTED, 3),
                            (ImportSession.Status.PENDING, 20)):
            session = ImportSession.objects.create(account=self.joint, file_format="csv", raw_content="", status=status)
            session.imported_accounts.add(self.joint)
            ImportSession.objects.filter(pk=session.pk).update(
                updated_at=datetime(2026, 10, day, 10, tzinfo=dt_timezone.utc)
            )

        accounts = {a["name"]: a["last_import_date"] for a in self.body()["accounts"]}
        self.assertEqual(accounts, {"Joint": "2026-10-12", "Savings": None})

    def test_the_pocket_account_is_imported_too(self):
        session = ImportSession.objects.create(
            account=self.joint, file_format="csv", raw_content="", status=ImportSession.Status.COMMITTED
        )
        session.imported_accounts.set([self.joint, self.savings])
        ImportSession.objects.filter(pk=session.pk).update(updated_at=datetime(2026, 10, 24, 10, tzinfo=dt_timezone.utc))

        accounts = {a["name"]: a["last_import_date"] for a in self.body()["accounts"]}
        self.assertEqual(accounts, {"Joint": "2026-10-24", "Savings": "2026-10-24"})

        # --- recent ---

    def test_last_eight_with_a_split_listed_once(self):
        for day in range(1, 11):
            self.txn(-100 * day, day, payee=f"p{day}")
        dinner = self.txn(-6000, 20, payee="Pizzeria")
        save_split(dinner, [SplitLine(-3000, category=self.restaurants), SplitLine(-3000)])
        self.txn(-500, 15, payee="other account", account=self.savings)

        recent = self.body()["recent"]

        self.assertEqual(
            [r["payee"] for r in recent], ["Pizzeria", "other account"] + [f"p{d}" for d in range(10, 4, -1)]
        )
        self.assertEqual((recent[0]["part_count"], recent[0]["category_label"]), (2, None))
        self.assertEqual((recent[0]["account_name"], recent[1]["account_name"]), ("Joint", "Savings"))

    def test_a_transfer_shows_once(self):
        for day in range(1, 11):
            self.txn(-100 * day, day, payee=f"p{day}")
        link_transfer(self.txn(-50000, 20, payee="to savings"), self.savings)

        recent = self.body()["recent"]

        self.assertEqual(len(recent), 8)
        self.assertEqual(
            (recent[0]["payee"], recent[0]["account_name"], recent[0]["transfer_account_name"], recent[0]["amount_cents"]),
            ("to savings", "Joint", "Savings", -50000),
        )
        self.assertNotIn(50000, [r["amount_cents"] for r in recent])

    def test_a_transfer_from_an_archived_account_keeps_its_incoming_leg(self):
        old = Account.objects.create(name="Old", account_type="checking", starting_balance_cents=0)
        link_transfer(self.txn(-50000, 20, account=old, payee="closing"), self.joint)
        old.archived = True
        old.save()

        recent = self.body()["recent"]

        self.assertEqual([(r["account_name"], r["amount_cents"]) for r in recent], [("Joint", 50000)])

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

    def test_bad_or_missing_month(self):
        self.assertEqual(self.get(month="2026-13").status_code, 400)
        self.assertEqual(self.client.get(reverse("report-overview")).status_code, 400)

    # --- net worth change ---

    def test_net_worth_change_this_month(self):
        self.txn(500000, 1, month=9)
        self.txn(124000, 3)
        self.assertEqual(self.body()["net_worth_change_cents"], 124000)

    def test_net_worth_change_in_a_past_month(self):
        self.txn(500000, 1, month=8)
        self.txn(-30000, 3, month=9)
        self.txn(90000, 3)
        self.assertEqual(self.body(month="2026-09")["net_worth_change_cents"], -30000)

    def test_net_worth_change_counts_a_transfer_as_nothing(self):
        self.txn(500000, 1, month=9)
        link_transfer(self.txn(-1000, 3), self.savings)
        self.assertEqual(self.body()["net_worth_change_cents"], 0)

    def test_no_net_worth_change_without_an_earlier_month_end(self):
        self.txn(500000, 1)
        self.assertIsNone(self.body()["net_worth_change_cents"])


@patch("reports.views._today", lambda: TODAY)
class YearlyOverviewTests(TestCase):
    """The yearly parts of openspec/specs/overview, at the API."""

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(get_user_model().objects.create_user(username="u", password="x"))
        self.joint = Account.objects.create(name="Joint", account_type="checking", starting_balance_cents=0)
        BudgetSettings.objects.create(pk=1, start_month=date(2026, 10, 1))
        self.clothing = self.yearly("Clothing", 120000)

    def yearly(self, name, cents, due=None):
        category = Category.objects.create(name=name, budget_kind="target" if due else "yearly")
        YearlyBudget.objects.create(
            category=category, from_year=2026, amount_cents=cents,
            due_month=due[0] if due else None, due_day=due[1] if due else None,
        )
        return category

    def spend(self, category, cents, day, month=10):
        Transaction.objects.create(
            account=self.joint, date=date(2026, month, day), amount_cents=-cents, payee="x", category=category
        )

    def attention(self, month="2026-10"):
        return self.client.get(reverse("report-overview"), {"month": month}).json()["attention"]["yearly"]

    def test_yearly_spending_has_its_own_line(self):
        groceries = Category.objects.create(name="Groceries")
        CategoryLimit.objects.create(category=groceries, month=None, limit_cents=260000)
        self.spend(groceries, 194000, 3)
        self.spend(self.clothing, 18000, 5)
        tax = self.yearly("Property tax", 40000, due=(11, 1))
        self.spend(tax, 40000, 20)
        budget = self.client.get(reverse("report-overview"), {"month": "2026-10"}).json()["budget"]
        self.assertEqual(budget["spent_cents"], 194000)
        self.assertEqual(budget["limit_cents"], 260000)
        self.assertEqual(budget["yearly_spent_cents"], 58000)
        self.assertEqual(budget["outside_cents"], 0)

    def test_a_yearly_budget_ahead_of_pace(self):
        self.spend(self.clothing, 27000, 5)
        [item] = self.attention()
        self.assertEqual((item["name"], item["state"], item["share"]), ("Clothing", "ahead", 90))

    def test_on_pace_is_not_a_warning(self):
        self.spend(self.clothing, 18000, 5)
        self.assertEqual(self.attention(), [])

    def test_targets_that_need_action(self):
        tax = self.yearly("Property tax", 40000, due=(11, 1))
        water = self.yearly("Water tax", 12000, due=(10, 1))
        self.spend(water, 13500, 2)
        with patch("reports.views._today", lambda: date(2026, 11, 9)):
            items = self.attention("2026-11")
        self.assertEqual([(i["name"], i["state"]) for i in items], [("Property tax", "overdue"), ("Water tax", "over")])
        self.assertEqual(items[0]["due_date"], "2026-11-01")
        self.assertEqual(tax.id, items[0]["id"])

    def test_not_seen_yet_is_listed(self):
        self.yearly("Property tax", 40000, due=(11, 1))
        with patch("reports.views._today", lambda: date(2026, 11, 4)):
            items = self.attention("2026-11")
        self.assertEqual([(i["name"], i["state"]) for i in items], [("Property tax", "not_seen")])

    def test_paid_within_tolerance_is_not_listed(self):
        tax = self.yearly("Property tax", 40000, due=(11, 1))
        self.spend(tax, 39812, 20)
        self.assertEqual(self.attention(), [])

    def test_due_soon_in_the_current_month(self):
        self.yearly("Property tax", 40000, due=(11, 1))
        self.assertEqual([i["state"] for i in self.attention()], ["due_soon"])

    def test_a_past_month_lists_no_early_warnings(self):
        self.yearly("Property tax", 40000, due=(11, 1))
        self.spend(self.clothing, 27000, 5)
        with patch("reports.views._today", lambda: date(2026, 11, 20)):
            # October, seen from late November: the target was due soon at
            # the end of October and Clothing was at 90%, but under budget.
            self.assertEqual(self.attention("2026-10"), [])


@patch("reports.views._today", lambda: TODAY)
class OverviewTierTests(TestCase):
    """The overview spec's "Everyday money and net worth", at the API."""

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(get_user_model().objects.create_user(username="u", password="x"))

    def account(self, name, account_type, cents):
        return Account.objects.create(name=name, account_type=account_type, starting_balance_cents=cents)

    def body(self):
        response = self.client.get(reverse("report-overview"), {"month": "2026-10"})
        self.assertEqual(response.status_code, 200, response.content)
        return response.json()

    def test_everyday_savings_and_a_house(self):
        self.account("House", "property", 29500000)
        self.account("Revolut", "checking", 120000)
        self.account("Spaarrekening", "savings", 228200)
        body = self.body()
        self.assertEqual(body["everyday_cents"], 120000)
        self.assertEqual(body["balance_cents"], 29848200)
        self.assertEqual(
            body["tiers"],
            [
                {"tier": "everyday", "balance_cents": 120000},
                {"tier": "savings", "balance_cents": 228200},
                {"tier": "property", "balance_cents": 29500000},
            ],
        )
        self.assertEqual([a["name"] for a in body["accounts"]], ["Revolut", "Spaarrekening", "House"])
        self.assertEqual(body["accounts"][2]["tier"], "property")

    def test_a_mortgage_lowers_net_worth(self):
        self.account("House", "property", 29500000)
        self.account("Revolut", "checking", 120000)
        self.account("Spaarrekening", "savings", 228200)
        self.account("Mortgage", "loan", -18734000)
        body = self.body()
        self.assertEqual(body["tiers"][-1], {"tier": "loans", "balance_cents": -18734000})
        self.assertEqual(body["balance_cents"], 11114200)

    def test_only_everyday_accounts(self):
        self.account("Revolut", "checking", 120000)
        self.account("Wallet", "cash", 5000)
        body = self.body()
        self.assertEqual(body["tiers"], [{"tier": "everyday", "balance_cents": 125000}])
        self.assertEqual(body["everyday_cents"], body["balance_cents"])

    def test_archived_accounts_dont_count(self):
        self.account("Revolut", "checking", 120000)
        house = self.account("House", "property", 29500000)
        house.archived = True
        house.save()
        body = self.body()
        self.assertEqual([t["tier"] for t in body["tiers"]], ["everyday"])
        self.assertEqual(body["balance_cents"], 120000)

    def test_last_value_date(self):
        from transactions.adjustments import set_value

        revolut = self.account("Revolut", "checking", 120000)
        house = self.account("House", "property", 29500000)
        set_value(house, date(2026, 9, 1), 30000000)
        set_value(house, date(2026, 10, 1), 31000000)
        accounts = {a["id"]: a for a in self.body()["accounts"]}
        self.assertEqual(accounts[house.id]["last_value_date"], "2026-10-01")
        self.assertIsNone(accounts[revolut.id]["last_value_date"])

    def test_value_adjustments_are_left_out_of_recent(self):
        from transactions.adjustments import set_value

        revolut = self.account("Revolut", "checking", 120000)
        house = self.account("House", "property", 29500000)
        Transaction.objects.create(account=revolut, date=date(2026, 10, 2), amount_cents=-500, payee="Bakery")
        set_value(house, date(2026, 10, 20), 31000000)
        recent = self.body()["recent"]
        self.assertEqual([r["payee"] for r in recent], ["Bakery"])
