from datetime import date, timedelta

from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import TransactionTestCase


class RecurringToExpectedTests(TransactionTestCase):
    """Recurring transactions become expected items - see the REMOVED
    "Define recurring transaction" migration note in openspec/specs/forecasting."""

    before = [("forecasting", "0002_expecteditem")]
    after = [("forecasting", "0003_recurring_to_expected")]

    def setUp(self):
        executor = MigrationExecutor(connection)
        executor.migrate(self.before)
        apps = executor.loader.project_state(self.before).apps
        Household = apps.get_model("households", "Household")
        Account = apps.get_model("accounts", "Account")
        Category = apps.get_model("budgets", "Category")
        Recurring = apps.get_model("forecasting", "RecurringTransaction")

        household = Household.objects.create(name="Home")
        self.household_id = household.pk
        account = Account.objects.create(
            household=household, name="Crelan", account_type="checking", starting_balance_cents=0
        )
        salary = Category.objects.create(household=household, name="Salary")
        self.salary_id = salary.pk
        streaming = Category.objects.create(household=household, name="Streaming", budget_kind="bills")

        def recurring(payee, **fields):
            defaults = {"account": account, "amount_cents": 450000, "payee": payee, "frequency": "monthly",
                        "start_date": date(2026, 3, 25), "category": salary}
            Recurring.objects.create(**{**defaults, **fields})

        recurring("Salary")
        recurring("Weekly", frequency="weekly")
        recurring("Ended", end_date=date.today() - timedelta(days=40))
        recurring("No category", category=None)
        recurring("Netflix", amount_cents=-1799, category=streaming)

    def tearDown(self):
        MigrationExecutor(connection).migrate(MigrationExecutor(connection).loader.graph.leaf_nodes())

    def test_only_the_monthly_salary_becomes_an_expected_item(self):
        executor = MigrationExecutor(connection)
        executor.migrate(self.after)
        ExpectedItem = executor.loader.project_state(self.after).apps.get_model("forecasting", "ExpectedItem")

        items = list(ExpectedItem.objects.values("household_id", "name", "direction", "amount_cents", "day", "category_id", "account_id"))
        self.assertEqual(
            items,
            [
                {
                    "household_id": self.household_id,
                    "name": "Salary",
                    "direction": "in",
                    "amount_cents": 450000,
                    "day": 25,
                    "category_id": self.salary_id,
                    "account_id": None,
                }
            ],
        )
