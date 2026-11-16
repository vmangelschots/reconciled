"""A year's budget per category, for Current and drafts - see
openspec/specs/year-plans."""

from datetime import date

from households.testing import TestCase

from .models import Bill, BudgetSettings, Category, CategoryLimit, PlanBill, PlanBudget, YearlyBudget, YearPlan
from .plans import counted_cents, current_budgets, current_plan_row, plan_budgets, year_view
from .summary import monthly_limits

TODAY = date(2026, 11, 16)


class CurrentYearBudgetTests(TestCase):
    def setUp(self):
        BudgetSettings.objects.create(pk=1)
        self.groceries = Category.objects.create(name="Groceries")

    def test_monthly_with_a_december_exception(self):
        CategoryLimit.objects.create(category=self.groceries, limit_cents=60000)
        CategoryLimit.objects.create(category=self.groceries, month=date(2027, 12, 1), limit_cents=80000)

        budget = current_budgets(2027, TODAY)[self.groceries.id]

        self.assertEqual(budget.year_cents, 740000)
        self.assertEqual(budget.default_cents, 60000)
        self.assertEqual(budget.exceptions, {"12": 80000})

    def test_a_bill_ending_in_march(self):
        utilities = Category.objects.create(name="Utilities", budget_kind="bills")
        Bill.objects.create(category=utilities, name="Old", day=5, amount_cents=4000, from_month=date(2026, 1, 1),
                            until_month=date(2027, 3, 1))
        Bill.objects.create(category=utilities, name="Water", day=9, amount_cents=1500, from_month=date(2026, 1, 1))

        budget = current_budgets(2027, TODAY)[utilities.id]

        self.assertEqual(budget.year_cents, 3 * 4000 + 12 * 1500)
        self.assertEqual([b["until_month"] for b in budget.bills], [3, None])

    def test_yearly_kinds(self):
        clothing = Category.objects.create(name="Clothing", budget_kind="yearly")
        YearlyBudget.objects.create(category=clothing, from_year=2026, amount_cents=120000)
        insurance = Category.objects.create(name="Insurance", budget_kind="target")
        YearlyBudget.objects.create(category=insurance, from_year=2026, amount_cents=78000, due_month=3, due_day=1)

        budgets = current_budgets(2027, TODAY)

        self.assertEqual(budgets[clothing.id].year_cents, 120000)
        self.assertEqual((budgets[insurance.id].year_cents, budgets[insurance.id].due), (78000, "03-01"))

    def test_the_start_year_is_pro_rated(self):
        BudgetSettings.objects.filter(pk=1).update(start_month=date(2027, 7, 1))
        clothing = Category.objects.create(name="Clothing", budget_kind="yearly")
        YearlyBudget.objects.create(category=clothing, from_year=2027, amount_cents=120000)

        self.assertEqual(current_budgets(2027, TODAY)[clothing.id].year_cents, 60000)

    def test_no_budget(self):
        self.assertEqual(current_budgets(2027, TODAY)[self.groceries.id].kind, "none")

    def test_the_year_matches_the_month_view(self):
        CategoryLimit.objects.create(category=self.groceries, limit_cents=60000)
        CategoryLimit.objects.create(category=self.groceries, from_month=date(2027, 7, 1), limit_cents=55000)
        CategoryLimit.objects.create(category=self.groceries, month=date(2027, 12, 1), limit_cents=80000)
        streaming = Category.objects.create(name="Streaming", budget_kind="bills")
        Bill.objects.create(category=streaming, name="Netflix", day=5, amount_cents=1799, from_month=date(2027, 3, 1))

        budgets = current_budgets(2027, TODAY)

        for category in (self.groceries, streaming):
            months = [monthly_limits(date(2027, m, 1), loan_lines={})[0].get(category.id) for m in range(1, 13)]
            self.assertEqual(budgets[category.id].months, months)
            self.assertEqual(budgets[category.id].year_cents, sum(m for m in months if m))


class DraftYearBudgetTests(TestCase):
    def setUp(self):
        BudgetSettings.objects.create(pk=1)
        self.groceries = Category.objects.create(name="Groceries")
        CategoryLimit.objects.create(category=self.groceries, limit_cents=65000)

    def test_earlier_months_stay_real(self):
        plan = YearPlan.objects.create(year=2027, name="Rest of 2027", from_month=7)
        PlanBudget.objects.create(plan=plan, category=self.groceries, kind="monthly", default_cents=55000)

        budget = plan_budgets(plan, TODAY)[self.groceries.id]

        self.assertEqual(budget.year_cents, 6 * 65000 + 6 * 55000)

    def test_exceptions_before_the_from_month_dont_count(self):
        plan = YearPlan.objects.create(year=2027, name="Rest of 2027", from_month=9)
        PlanBudget.objects.create(
            plan=plan, category=self.groceries, kind="monthly", default_cents=55000, month_cents={"8": 90000}
        )

        budget = plan_budgets(plan, TODAY)[self.groceries.id]

        self.assertEqual(budget.months[7], 65000)
        self.assertEqual(budget.exceptions, {})

    def test_a_kind_switch_holds_for_the_whole_year(self):
        plan = YearPlan.objects.create(year=2027, name="Fix", from_month=7)
        PlanBudget.objects.create(plan=plan, category=self.groceries, kind="yearly", amount_cents=300000)

        budget = plan_budgets(plan, TODAY)[self.groceries.id]

        self.assertEqual((budget.kind, budget.year_cents), ("yearly", 300000))

    def test_bills_in_a_draft(self):
        plan = YearPlan.objects.create(year=2027, name="2027 plan")
        gym = Category.objects.create(name="Gym", budget_kind="bills")
        plan_budget = PlanBudget.objects.create(plan=plan, category=gym, kind="bills")
        PlanBill.objects.create(plan_budget=plan_budget, name="Gym", day=1, amount_cents=3000, until_month=6)

        self.assertEqual(plan_budgets(plan, TODAY)[gym.id].year_cents, 6 * 3000)

    def test_a_category_the_draft_doesnt_hold_is_current(self):
        plan = YearPlan.objects.create(year=2027, name="2027 plan")

        self.assertEqual(plan_budgets(plan, TODAY)[self.groceries.id].year_cents, 12 * 65000)


class YearTotalTests(TestCase):
    def setUp(self):
        BudgetSettings.objects.create(pk=1)

    def test_caps_arent_counted_twice(self):
        food = Category.objects.create(name="Food")
        takeaway = Category.objects.create(name="Takeaway", parent=food)
        CategoryLimit.objects.create(category=food, limit_cents=80000)
        CategoryLimit.objects.create(category=takeaway, limit_cents=10000)

        budgets = current_budgets(2027, TODAY)

        self.assertEqual(counted_cents(budgets, [food, takeaway]), 12 * 80000)

    def test_a_subcategory_under_a_plain_group_counts(self):
        home = Category.objects.create(name="Home")
        garden = Category.objects.create(name="Garden", parent=home)
        CategoryLimit.objects.create(category=garden, limit_cents=5000)

        self.assertEqual(counted_cents(current_budgets(2027, TODAY), [home, garden]), 12 * 5000)


class YearViewTests(TestCase):
    def setUp(self):
        from accounts.models import Account

        BudgetSettings.objects.create(pk=1)
        self.account = Account.objects.create(name="Crelan", account_type="checking", starting_balance_cents=0)
        self.groceries = Category.objects.create(name="Groceries")
        CategoryLimit.objects.create(category=self.groceries, limit_cents=60000)
        self.income = Category.objects.create(name="Income")

    def txn(self, day, cents, category=None):
        from transactions.models import Transaction

        Transaction.objects.create(account=self.account, date=day, amount_cents=cents, payee="x", category=category)

    def test_salary_with_holiday_pay_and_a_13th_month(self):
        from .models import IncomeLine

        plan = YearPlan.objects.create(year=2027, name="2027 plan")
        IncomeLine.objects.create(plan=plan, name="Salary", amount_cents=320000, extra={"5": 290000, "12": 320000})

        view = year_view(2027, TODAY, plan)

        self.assertEqual(view["income"][0]["plan_cents"], 4450000)

    def test_left_to_save(self):
        from .models import IncomeLine

        plan = YearPlan.objects.create(year=2027, name="2027 plan")
        IncomeLine.objects.create(plan=plan, name="Salary", amount_cents=900000, per="year")

        totals = year_view(2027, TODAY, plan)["totals"]

        self.assertEqual((totals["income_cents"], totals["expenses_cents"]), (900000, 720000))
        self.assertEqual((totals["left_cents"], totals["share"]), (180000, 20))

    def test_planning_2027_in_november(self):
        self.txn(date(2025, 10, 31), -1000, self.groceries)
        self.txn(date(2025, 11, 1), -2000, self.groceries)
        self.txn(date(2026, 10, 31), -3000, self.groceries)
        self.txn(date(2026, 11, 2), -4000, self.groceries)

        view = year_view(2027, TODAY)

        self.assertEqual(view["actual"], {"kind": "last_12", "from": date(2025, 11, 1), "until": date(2026, 10, 31)})
        self.assertEqual(view["rows"][0]["actual_cents"], 5000)

    def test_an_income_line_without_a_category(self):
        from .models import IncomeLine

        current = current_plan_row(2027, create=True)
        IncomeLine.objects.create(plan=current, name="Gift from parents", amount_cents=50000, per="year")
        IncomeLine.objects.create(plan=current, name="Salary", amount_cents=320000, category=self.income)
        self.txn(date(2026, 3, 25), 320000, self.income)

        income = year_view(2027, TODAY)["income"]

        self.assertEqual([(r["name"], r["actual_cents"]) for r in income], [("Gift from parents", None), ("Salary", 320000)])

    def test_no_budget_last_year(self):
        hobbies = Category.objects.create(name="Hobbies")
        self.txn(date(2026, 2, 1), -250000, hobbies)
        self.txn(date(2026, 2, 1), -60000)

        view = year_view(2027, TODAY)

        self.assertEqual(view["not_in_plan_cents"], 310000)
        self.assertNotIn("Hobbies", [r["category_name"] for r in view["rows"]])

    def test_heading_for_in_june(self):
        from .models import IncomeLine

        june = date(2027, 6, 14)
        current = current_plan_row(2027, create=True)
        IncomeLine.objects.create(plan=current, name="Salary", amount_cents=500000, per="year")
        # Groceries plans 7,200; 4,800 spent by mid-June, 1,200 over its 3,600
        # for January to June; June's own 600 is used up.
        self.txn(date(2027, 3, 1), -420000, self.groceries)
        self.txn(date(2027, 6, 1), -60000, self.groceries)

        view = year_view(2027, june)
        row = view["rows"][0]

        self.assertEqual(row["heading_cents"], 480000 + 6 * 60000)
        self.assertEqual(view["totals"]["left_cents"], 500000 - 720000)
        self.assertEqual(view["totals"]["heading_left_cents"], 500000 - 840000)
        self.assertEqual(view["totals"]["heading_expenses_cents"], 840000)
        self.assertEqual(view["split_month"], 6)

    def test_heading_for_without_income(self):
        june = date(2027, 6, 14)
        self.txn(date(2027, 3, 1), -320000, self.groceries)

        totals = year_view(2027, june)["totals"]

        self.assertIsNone(totals["heading_left_cents"])
        self.assertEqual(totals["heading_expenses_cents"], 320000 + 6 * 60000 + 60000)


class ChangesAgainstCurrentTests(TestCase):
    def setUp(self):
        BudgetSettings.objects.create(pk=1)
        self.groceries = Category.objects.create(name="Groceries")
        CategoryLimit.objects.create(category=self.groceries, limit_cents=65000)
        self.transport = Category.objects.create(name="Transport")
        self.transport_limit = CategoryLimit.objects.create(category=self.transport, limit_cents=12000)
        self.plan = YearPlan.objects.create(year=2027, name="Lean")
        current = current_budgets(2027, TODAY)
        for category, cents in ((self.groceries, 60000), (self.transport, 12000)):
            PlanBudget.objects.create(
                plan=self.plan, category=category, kind="monthly", default_cents=cents,
                base=current[category.id].snapshot(),
            )

    def rows(self):
        return {r["category_name"]: r for r in year_view(2027, TODAY, self.plan)["rows"]}

    def test_groceries_lowered(self):
        row = self.rows()["Groceries"]

        self.assertTrue(row["changed"])
        self.assertEqual((row["current"]["plan_cents"], row["plan_cents"], row["change_cents"]), (780000, 720000, -60000))

    def test_an_unchanged_row(self):
        row = self.rows()["Transport"]

        self.assertFalse(row["changed"])
        self.assertIsNone(row["change_cents"])
        self.assertIsNone(row["changed_since_copy"])

    def test_transport_changed_meanwhile(self):
        self.transport_limit.limit_cents = 14000
        self.transport_limit.save()

        row = self.rows()["Transport"]

        self.assertEqual(row["changed_since_copy"], {"from_cents": 12000, "to_cents": 14000})
        self.assertEqual(row["plan_cents"], 12 * 12000)

    def test_a_category_budgeted_after_the_copy(self):
        hobbies = Category.objects.create(name="Hobbies")
        CategoryLimit.objects.create(category=hobbies, limit_cents=5000)

        row = self.rows()["Hobbies"]

        self.assertEqual(row["changed_since_copy"], {"from_cents": None, "to_cents": 5000})

    def test_left_to_save_against_current(self):
        totals = year_view(2027, TODAY, self.plan)["totals"]

        self.assertEqual(totals["change_left_cents"], 60000)
