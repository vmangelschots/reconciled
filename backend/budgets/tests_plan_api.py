"""The year plans API - see openspec/specs/year-plans."""

from datetime import date
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APIClient

from accounts.models import Account
from forecasting.models import ExpectedItem
from households.testing import TestCase
from transactions.models import Transaction

from .models import Bill, BudgetSettings, Category, CategoryLimit, IncomeLine, PlanBudget, YearlyBudget, YearPlan
from .summary import budget_rows, monthly_limits


def limit(category, month):
    return monthly_limits(month, loan_lines={})[0].get(category.id)


class PlanApiCase(TestCase):
    today = date(2026, 11, 16)

    def setUp(self):
        patcher = patch("budgets.utils.today", lambda: self.today)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.client = APIClient()
        self.client.force_authenticate(user=get_user_model().objects.create_user(username="b", password="x"))
        BudgetSettings.objects.create(pk=1)
        self.account = Account.objects.create(name="Crelan", account_type="checking", starting_balance_cents=0)
        self.groceries = Category.objects.create(name="Groceries")
        CategoryLimit.objects.create(category=self.groceries, limit_cents=65000)
        self.holidays = Category.objects.create(name="Holidays")
        CategoryLimit.objects.create(category=self.holidays, limit_cents=25000)
        self.income = Category.objects.create(name="Income")

    def create(self, year=2027, **data):
        response = self.client.post(reverse("plan-list"), {"year": year, **data}, format="json")
        self.assertEqual(response.status_code, 201, response.content)
        return YearPlan.objects.get(pk=response.json()["id"])

    def view(self, plan):
        return self.client.get(reverse("plan-detail", args=[plan.id])).json()

    def rows(self, plan):
        return {r["category_name"]: r for r in self.view(plan)["rows"]}

    def set_budget(self, plan, category, **data):
        return self.client.put(
            reverse("plan-category-budget", args=[plan.id, category.id]), data, format="json"
        )

    def preview(self, plan, from_month=None):
        url = reverse("plan-apply", args=[plan.id])
        return self.client.get(url, {"from": from_month} if from_month else {})

    def apply(self, plan, from_month=None):
        data = {"from_month": from_month} if from_month else {}
        return self.client.post(reverse("plan-apply", args=[plan.id]), data, format="json")


class DraftTests(PlanApiCase):
    def test_new_draft_from_current(self):
        current = IncomeLine.objects.create(
            plan=YearPlan.objects.create(year=2027, kind="current"), name="Salary", amount_cents=320000
        )

        plan = self.create()

        self.assertEqual((plan.name, plan.from_month, plan.kind), ("2027 plan", 1, "draft"))
        rows = self.rows(plan)
        self.assertEqual(rows["Groceries"]["plan_cents"], 12 * 65000)
        self.assertFalse(rows["Groceries"]["changed"])
        self.assertEqual([line["name"] for line in self.view(plan)["income"]], [current.name])

    def test_a_second_draft_gets_its_own_name(self):
        self.create()
        self.assertEqual(self.create().name, "2027 plan 2")

    def test_correcting_in_june(self):
        self.today = date(2027, 6, 14)

        plan = self.create()

        self.assertEqual((plan.name, plan.from_month), ("Rest of 2027", 7))
        response = self.set_budget(plan, self.groceries, kind="monthly", default_cents=55000, months={"5": 70000})
        self.assertEqual(response.status_code, 400)
        response = self.set_budget(plan, self.groceries, kind="monthly", default_cents=55000, months={"12": 80000})
        self.assertEqual(response.status_code, 200)

    def test_earlier_months_stay_real(self):
        self.today = date(2027, 6, 14)
        plan = self.create()
        self.set_budget(plan, self.groceries, kind="monthly", default_cents=55000)

        self.assertEqual(self.rows(plan)["Groceries"]["plan_cents"], 6 * 65000 + 6 * 55000)

    def test_from_july_to_september(self):
        self.today = date(2027, 6, 14)
        plan = self.create()
        self.set_budget(plan, self.groceries, kind="monthly", default_cents=55000, months={"8": 90000})

        self.client.patch(reverse("plan-detail", args=[plan.id]), {"from_month": 9}, format="json")

        row = self.rows(plan)["Groceries"]
        self.assertEqual(row["months"][7], 65000)
        self.assertEqual(row["kept"], {"8": 90000})
        self.assertEqual(PlanBudget.objects.get(plan=plan, category=self.groceries).month_cents, {"8": 90000})

        self.client.patch(reverse("plan-detail", args=[plan.id]), {"from_month": 7}, format="json")
        self.assertEqual(self.rows(plan)["Groceries"]["months"][7], 90000)

    def test_from_july_to_may(self):
        self.today = date(2027, 4, 2)
        plan = self.create(from_month=7)

        self.client.patch(reverse("plan-detail", args=[plan.id]), {"from_month": 5}, format="json")

        self.assertEqual(self.rows(plan)["Groceries"]["months"][4:6], [65000, 65000])

    def test_no_drafts_of_a_past_year(self):
        response = self.client.post(reverse("plan-list"), {"year": 2025}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertFalse(self.client.get(reverse("plan-list"), {"year": 2025}).json()["can_draft"])

    def test_delete_a_draft(self):
        plan = self.create()

        self.assertEqual(self.client.delete(reverse("plan-detail", args=[plan.id])).status_code, 204)
        self.assertEqual(self.client.get(reverse("plan-list"), {"year": 2027}).json()["drafts"], [])

    def test_the_list(self):
        lean = self.create(name="Lean")
        car = self.create(name="New car")
        self.set_budget(car, self.groceries, kind="monthly", default_cents=60000)

        listing = self.client.get(reverse("plan-list"), {"year": 2027}).json()

        self.assertEqual([p["name"] for p in listing["drafts"]], ["New car", "Lean"])
        self.assertEqual((listing["last_year"], listing["can_draft"]), (2027, True))
        self.assertEqual(lean.kind, "draft")

    def test_current_is_read_only(self):
        response = self.client.put(f"/api/budgets/plans/current/2027/categories/{self.groceries.id}/budget/", {})
        self.assertEqual(response.status_code, 404)

    def test_from_current_to_a_draft(self):
        plan = self.create()

        response = self.set_budget(plan, self.groceries, kind="monthly", default_cents=60000)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.rows(plan)["Groceries"]["change_cents"], -60000)


class DraftEditTests(PlanApiCase):
    def setUp(self):
        super().setUp()
        self.plan = self.create(name="Lean")

    def test_switch_kind_in_a_draft(self):
        response = self.set_budget(self.plan, self.holidays, kind="yearly", amount_cents=300000)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.rows(self.plan)["Holidays"]["kind"], "yearly")
        self.assertEqual(Category.objects.get(pk=self.holidays.pk).budget_kind, "monthly")

    def test_remove_a_budget_in_a_draft(self):
        response = self.client.delete(reverse("plan-category-budget", args=[self.plan.id, self.holidays.id]))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.rows(self.plan)["Holidays"]["kind"], "none")
        self.assertEqual(limit(self.holidays, date(2027, 1, 1)), 25000)

    def test_a_loan_in_a_draft(self):
        house = Category.objects.create(name="House A", budget_kind="bills")
        loan_account = Account.objects.create(name="House A", account_type="loan", starting_balance_cents=0)
        from decimal import Decimal

        from accounts.models import Loan

        Loan.objects.create(
            account=loan_account, principal_cents=12000000, annual_rate=Decimal("2.0"), term_months=240,
            first_payment_date=date(2026, 1, 1), paid_from=self.account, setup_date=date(2026, 1, 1),
            payment_category=house,
        )

        response = self.set_budget(self.plan, house, kind="monthly", default_cents=1000)
        self.assertEqual(response.status_code, 400)
        row = self.rows(self.plan)["House A"]
        self.assertTrue(row["locked"])
        self.assertEqual([loan["name"] for loan in row["loans"]], ["House A"])
        self.assertEqual(len([m for m in row["months"] if m]), 12)

    def test_december_groceries(self):
        self.set_budget(self.plan, self.groceries, kind="monthly", default_cents=60000, months={"12": 80000})

        row = self.rows(self.plan)["Groceries"]
        self.assertEqual((row["plan_cents"], row["exceptions"]), (740000, {"12": 80000}))

    def test_back_to_the_default(self):
        self.set_budget(self.plan, self.groceries, kind="monthly", default_cents=60000, months={"12": 80000})
        self.set_budget(self.plan, self.groceries, kind="monthly", default_cents=60000, months={"12": 60000})

        self.assertEqual(self.rows(self.plan)["Groceries"]["exceptions"], {})

    def test_a_contract_ending_in_december(self):
        gym = Category.objects.create(name="Gym", budget_kind="bills")
        response = self.client.put(
            reverse("plan-category-bills", args=[self.plan.id, gym.id]),
            {"bills": [{"name": "Gym", "day": 1, "amount_cents": 3000, "until_month": 12}]},
            format="json",
        )
        self.assertEqual(response.status_code, 200)

        self.apply(self.plan)

        bill = Bill.objects.get(category=gym)
        self.assertEqual((bill.from_month, bill.until_month), (date(2027, 1, 1), date(2027, 12, 1)))
        self.assertIsNone(budget_rows(date(2028, 1, 1))[[r["category_name"] for r in budget_rows(date(2028, 1, 1))].index("Gym")]["limit_cents"])

    def test_use_the_new_value(self):
        CategoryLimit.objects.filter(category=self.groceries).update(limit_cents=70000)
        self.assertEqual(self.rows(self.plan)["Groceries"]["changed_since_copy"], {"from_cents": 65000, "to_cents": 70000})

        response = self.client.post(reverse("plan-category-use-current", args=[self.plan.id, self.groceries.id]))

        self.assertEqual(response.status_code, 200)
        row = self.rows(self.plan)["Groceries"]
        self.assertIsNone(row["changed_since_copy"])
        self.assertEqual(row["plan_cents"], 12 * 70000)

    def test_car_fund(self):
        response = self.client.post(reverse("plan-add-category", args=[self.plan.id]), {"name": "Car fund"}, format="json")
        self.assertEqual(response.status_code, 201)
        car_fund = Category.objects.get(name="Car fund")
        self.assertEqual(self.rows(self.plan)["Car fund"]["kind"], "none")
        self.assertIsNone(self.rows(self.plan)["Car fund"]["changed_since_copy"])

        self.set_budget(self.plan, car_fund, kind="yearly", amount_cents=240000)

        self.assertEqual(self.rows(self.plan)["Car fund"]["plan_cents"], 240000)
        self.assertEqual(car_fund.yearly_budgets.count(), 0)

    def test_a_draft_doesnt_touch_the_budget(self):
        self.set_budget(self.plan, self.groceries, kind="monthly", default_cents=50000)
        self.client.put(
            reverse("plan-category-bills", args=[self.plan.id, self.holidays.id]),
            {"bills": [{"name": "Trip", "day": 1, "amount_cents": 3000}]},
            format="json",
        )

        self.assertEqual(limit(self.groceries, date(2027, 3, 1)), 65000)
        self.assertEqual(Category.objects.get(pk=self.holidays.pk).budget_kind, "monthly")
        self.assertFalse(Bill.objects.exists())

    def test_an_applied_plan_is_read_only(self):
        self.set_budget(self.plan, self.groceries, kind="monthly", default_cents=60000)
        self.apply(self.plan)

        self.assertEqual(self.set_budget(self.plan, self.groceries, kind="monthly", default_cents=1).status_code, 400)
        self.assertEqual(self.client.delete(reverse("plan-detail", args=[self.plan.id])).status_code, 400)


class IncomeTests(PlanApiCase):
    def test_income_on_current_is_edited_directly(self):
        response = self.client.post(
            reverse("plan-current-income", args=[2027]),
            {"name": "Salary", "amount_cents": 320000, "per": "month", "extra": {"5": 290000, "12": 320000},
             "category": self.income.id},
            format="json",
        )

        self.assertEqual(response.status_code, 201, response.content)
        view = self.client.get(reverse("plan-current", args=[2027])).json()
        self.assertEqual(view["income"][0]["plan_cents"], 4450000)
        self.assertTrue(view["has_income"])

    def test_edit_and_delete_a_line(self):
        plan = self.create()
        line_id = self.client.post(
            reverse("plan-income", args=[plan.id]), {"name": "Salary", "amount_cents": 1}, format="json"
        ).json()["id"]

        self.client.patch(reverse("plan-income-line", args=[plan.id, line_id]), {"amount_cents": 300000}, format="json")
        self.assertEqual(IncomeLine.objects.get(pk=line_id).amount_cents, 300000)
        self.client.delete(reverse("plan-income-line", args=[plan.id, line_id]))
        self.assertFalse(IncomeLine.objects.filter(pk=line_id).exists())

    def test_start_from_the_forecast(self):
        ExpectedItem.objects.create(name="Salary", direction="in", amount_cents=320000, day=25, category=self.income)
        Transaction.objects.create(account=self.account, date=date(2026, 3, 25), amount_cents=4120000, payee="x",
                                   category=self.income)

        suggestions = self.client.get(reverse("plan-income-suggestions")).json()["suggestions"]

        self.assertEqual([(s["name"], s["amount_cents"], s["per"]) for s in suggestions], [("Salary", 320000, "month")])
        self.assertFalse(IncomeLine.objects.exists())

    def test_a_category_the_forecast_doesnt_cover(self):
        side_job = Category.objects.create(name="Side job")
        Transaction.objects.create(account=self.account, date=date(2026, 3, 25), amount_cents=240000, payee="x",
                                   category=side_job)

        suggestions = self.client.get(reverse("plan-income-suggestions")).json()["suggestions"]

        self.assertEqual([(s["name"], s["amount_cents"], s["per"]) for s in suggestions], [("Side job", 240000, "year")])

    def test_nothing_to_suggest(self):
        self.assertEqual(self.client.get(reverse("plan-income-suggestions")).json()["suggestions"], [])

    def test_first_visit_to_2027(self):
        view = self.client.get(reverse("plan-current", args=[2027])).json()

        self.assertFalse(view["has_income"])
        self.assertEqual(view["totals"]["expenses_cents"], 12 * 65000 + 12 * 25000)
        self.assertTrue(view["has_budgets"])

    def test_nothing_yet(self):
        CategoryLimit.objects.all().delete()

        view = self.client.get(reverse("plan-current", args=[2027])).json()

        self.assertFalse(view["has_budgets"] or view["has_income"])


class ApplyTests(PlanApiCase):
    def setUp(self):
        super().setUp()
        self.transport = Category.objects.create(name="Transport")
        self.transport_limit = CategoryLimit.objects.create(category=self.transport, limit_cents=12000)
        self.streaming = Category.objects.create(name="Streaming", budget_kind="bills")
        Bill.objects.create(category=self.streaming, name="Netflix", day=5, amount_cents=1799, from_month=date(2026, 1, 1))
        self.plan = self.create(name="Lean")

    def lean(self):
        self.set_budget(self.plan, self.groceries, kind="monthly", default_cents=60000)
        self.set_budget(self.plan, self.holidays, kind="yearly", amount_cents=300000)
        self.client.put(
            reverse("plan-category-bills", args=[self.plan.id, self.streaming.id]),
            {"bills": [{"name": "Netflix", "day": 5, "amount_cents": 1799}, {"name": "Disney+", "day": 8, "amount_cents": 999}]},
            format="json",
        )

    def test_previewing_lean(self):
        self.lean()
        self.transport_limit.limit_cents = 14000
        self.transport_limit.save()

        preview = self.preview(self.plan).json()

        names = [c["category_name"] for c in preview["changes"]]
        self.assertEqual(names[0], "Holidays")
        self.assertIsNotNone(preview["changes"][0]["kind_switch"])
        self.assertEqual(preview["changes"][0]["kind_switch"]["removes"]["defaults"], 1)
        by_name = {c["category_name"]: c for c in preview["changes"]}
        self.assertEqual((by_name["Groceries"]["from_cents"], by_name["Groceries"]["to_cents"]), (65000, 60000))
        self.assertEqual(by_name["Streaming"]["bills"], {"added": 1, "ended": 0})
        self.assertEqual(
            [(c["category_name"], c["from_cents"], c["to_cents"], c["draft_cents"]) for c in preview["changed_since_copy"]],
            [("Transport", 12000, 14000, 12000)],
        )
        self.assertFalse(preview["nothing_to_apply"])

    def test_cancel(self):
        self.lean()
        self.preview(self.plan)

        self.assertEqual(limit(self.groceries, date(2027, 1, 1)), 65000)
        self.assertEqual(Category.objects.get(pk=self.holidays.pk).budget_kind, "monthly")

    def test_nothing_to_apply(self):
        preview = self.preview(self.plan).json()

        self.assertTrue(preview["nothing_to_apply"])
        self.assertEqual(self.apply(self.plan).status_code, 400)

    def test_next_years_draft_applied_in_november(self):
        self.lean()
        self.set_budget(self.plan, self.holidays, kind="monthly", default_cents=25000)

        self.assertEqual(self.apply(self.plan).status_code, 200)

        self.assertEqual(limit(self.groceries, date(2026, 11, 1)), 65000)
        self.assertEqual(limit(self.groceries, date(2026, 12, 1)), 65000)
        self.assertEqual(limit(self.groceries, date(2027, 1, 1)), 60000)
        self.assertEqual(limit(self.streaming, date(2026, 12, 1)), 1799)
        self.assertEqual(limit(self.streaming, date(2027, 1, 1)), 1799 + 999)
        plan = YearPlan.objects.get(pk=self.plan.pk)
        self.assertEqual((plan.kind, plan.from_month), ("applied", 1))

    def test_monthly_to_yearly_in_july(self):
        self.today = date(2027, 6, 14)
        plan = self.create()
        self.set_budget(plan, self.holidays, kind="yearly", amount_cents=300000)

        self.assertEqual(self.apply(plan).status_code, 200)

        holidays = Category.objects.get(pk=self.holidays.pk)
        self.assertEqual(holidays.budget_kind, "yearly")
        self.assertFalse(holidays.limits.exists())
        self.assertEqual(holidays.yearly_budgets.get().from_year, 2027)

    def test_applied_from_july(self):
        self.today = date(2027, 6, 14)
        plan = self.create()
        self.set_budget(plan, self.groceries, kind="monthly", default_cents=55000)

        self.apply(plan)

        self.assertEqual(limit(self.groceries, date(2027, 6, 1)), 65000)
        self.assertEqual(limit(self.groceries, date(2027, 7, 1)), 55000)
        self.assertEqual(limit(self.groceries, date(2028, 2, 1)), 55000)

    def test_an_exception_replaced(self):
        CategoryLimit.objects.create(category=self.groceries, month=date(2027, 12, 1), limit_cents=90000)
        self.set_budget(self.plan, self.groceries, kind="monthly", default_cents=65000, months={"12": 80000})

        preview = self.preview(self.plan).json()
        self.assertEqual(preview["changes"][0]["exceptions"], {"set": [12], "removed": []})
        self.apply(self.plan)

        self.assertEqual(limit(self.groceries, date(2027, 12, 1)), 80000)

    def test_from_this_month(self):
        self.today = date(2027, 6, 14)
        plan = self.create()
        self.set_budget(plan, self.groceries, kind="monthly", default_cents=55000)
        Transaction.objects.create(account=self.account, date=date(2027, 6, 3), amount_cents=-42000, payee="x",
                                   category=self.groceries)

        preview = self.preview(plan, 6).json()

        self.assertEqual(preview["part_spent_cents"], 42000)

    def test_a_month_that_has_passed(self):
        self.today = date(2027, 6, 14)
        plan = self.create()
        self.set_budget(plan, self.groceries, kind="monthly", default_cents=55000)

        self.assertEqual(self.apply(plan, 3).status_code, 400)
        self.assertEqual(limit(self.groceries, date(2027, 3, 1)), 65000)

    def test_a_failed_apply_changes_nothing(self):
        self.lean()
        IncomeLine.objects.create(plan=self.plan, name="Salary", amount_cents=1)
        with patch("budgets.apply.IncomeLine.objects.create", side_effect=RuntimeError("boom")):
            with self.assertRaises(RuntimeError):
                self.apply(self.plan)

        self.assertEqual(limit(self.groceries, date(2027, 1, 1)), 65000)
        self.assertEqual(YearPlan.objects.get(pk=self.plan.pk).kind, "draft")

    def test_income_becomes_currents(self):
        IncomeLine.objects.create(plan=self.plan, name="Salary", amount_cents=330000)

        self.assertEqual(self.preview(self.plan).json()["income"]["lines"], 1)
        self.apply(self.plan)

        view = self.client.get(reverse("plan-current", args=[2027])).json()
        self.assertEqual([line["name"] for line in view["income"]], ["Salary"])

    def test_the_record(self):
        self.today = date(2027, 6, 12)
        plan = self.create()
        self.set_budget(plan, self.groceries, kind="monthly", default_cents=55000)
        self.apply(plan)

        listing = self.client.get(reverse("plan-list"), {"year": 2027}).json()
        self.assertEqual([p["name"] for p in listing["history"]], ["Rest of 2027"])
        self.assertEqual(listing["history"][0]["from_month"], 7)
        response = self.client.post(reverse("plan-duplicate", args=[plan.id]))
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["kind"], "draft")

    def test_target_and_removal(self):
        insurance = Category.objects.create(name="Insurance", budget_kind="target")
        YearlyBudget.objects.create(category=insurance, from_year=2026, amount_cents=78000, due_month=3, due_day=1)
        plan = self.create()
        self.set_budget(plan, insurance, kind="target", amount_cents=80000, due="04-01")
        self.client.delete(reverse("plan-category-budget", args=[plan.id, self.transport.id]))

        self.apply(plan)

        row = YearlyBudget.objects.get(category=insurance, from_year=2027)
        self.assertEqual((row.amount_cents, row.due_month, row.due_day), (80000, 4, 1))
        self.assertIsNone(limit(self.transport, date(2026, 11, 1)))


class ReviewFollowUpTests(PlanApiCase):
    def test_changing_the_month_in_the_dialog(self):
        self.today = date(2027, 2, 10)
        plan = self.create()

        response = self.client.patch(reverse("plan-detail", args=[plan.id]), {"from_month": 3}, format="json")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.view(plan)["plan"]["from_month"], 3)
        self.assertEqual(self.preview(plan).json()["from_month"], 3)

    def test_lean_exists(self):
        lean = self.create(name="Lean")
        hobbies = Category.objects.create(name="Hobbies")
        CategoryLimit.objects.create(category=hobbies, limit_cents=5000)

        response = self.set_budget(lean, hobbies, kind="monthly", default_cents=4000)

        self.assertEqual(response.status_code, 200)
        row = self.rows(lean)["Hobbies"]
        self.assertEqual((row["plan_cents"], row["change_cents"]), (48000, -12000))
        self.assertIsNone(row["changed_since_copy"])
