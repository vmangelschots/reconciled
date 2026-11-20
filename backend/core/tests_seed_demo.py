"""The demo seed used by the public demo environment. Plain Django TestCase:
the command binds its own household, and households.testing would hide a bug in
that."""

from datetime import date, timedelta
from io import StringIO

from django.contrib.auth import authenticate, get_user_model
from django.core.management import call_command
from django.test import TestCase

from accounts.models import Account, Loan
from budgets.models import Bill, Category, CategoryLimit, YearlyBudget
from households.context import household_context
from households.models import Household, Membership
from transactions.models import Transaction

DEMO = "demo"
PASSWORD = "demo-pass-123"


class SeedDemoTests(TestCase):
    def seed(self, *args):
        out = StringIO()
        call_command("seed_demo", *args, stdout=out)
        return out.getvalue()

    def counts(self):
        household = Household.objects.get()
        with household_context(household):
            return {
                "accounts": Account.objects.count(),
                "loans": Loan.objects.count(),
                "transactions": Transaction.objects.count(),
                "categories": Category.objects.count(),
                "bills": Bill.objects.count(),
                "limits": CategoryLimit.objects.count(),
                "yearly": YearlyBudget.objects.count(),
            }

    def test_seeds_a_demo_household_with_data_for_today(self):
        out = self.seed()

        self.assertEqual(Household.objects.count(), 1)
        household = Household.objects.get()
        self.assertEqual(household.name, "Demo")
        user = get_user_model().objects.get(username=DEMO)
        self.assertTrue(user.check_password(PASSWORD))
        self.assertTrue(Membership.objects.filter(user=user, household=household).exists())
        self.assertIn(f"{DEMO} / {PASSWORD}", out)

        self.assertEqual(
            self.counts(),
            {"accounts": 4, "loans": 1, "transactions": 3, "categories": 5, "bills": 3, "limits": 1, "yearly": 2},
        )

    def test_seeded_dates_follow_the_day_it_runs(self):
        self.seed()
        today = date.today()
        month = today.replace(day=1)

        with household_context(Household.objects.get()):
            netflix = Transaction.objects.get(payee="Netflix")
            self.assertEqual(netflix.date, month.replace(day=min(6, today.day)))
            self.assertEqual(Transaction.objects.get(payee="Flights").date, date(today.year, 1, 3))
            disney = Bill.objects.get(name="Disney+")
            self.assertEqual(disney.day, today.day - 3 if today.day > 3 else 1)
            loan = Loan.objects.get()
            self.assertEqual(loan.first_payment_date, (month + timedelta(days=32)).replace(day=2))

    def test_a_second_run_changes_nothing(self):
        self.seed()
        before = self.counts()
        out = self.seed()

        self.assertIn("exists already", out)
        self.assertEqual(Household.objects.count(), 1)
        self.assertEqual(self.counts(), before)

    def test_if_empty_does_nothing_when_a_household_exists(self):
        Household.objects.create(name="Real household")
        out = self.seed("--if-empty")

        self.assertIn("nothing to do", out)
        self.assertFalse(get_user_model().objects.filter(username=DEMO).exists())
        self.assertEqual(Household.objects.count(), 1)

    def test_if_empty_seeds_an_empty_installation(self):
        self.seed("--if-empty")

        self.assertEqual(Household.objects.count(), 1)
        self.assertTrue(get_user_model().objects.filter(username=DEMO).exists())

    def test_reset_removes_what_visitors_left_and_restores_the_login(self):
        self.seed()
        user = get_user_model().objects.get(username=DEMO)
        user.set_password("a visitor changed this")
        user.save()
        with household_context(Household.objects.get()):
            Transaction.objects.create(
                account=Account.objects.get(name="Crelan"),
                date=date.today(),
                amount_cents=-100,
                payee="Visitors entry",
            )
        Household.objects.create(name="Another household")

        self.seed("--reset")

        self.assertEqual(Household.objects.count(), 1)
        self.assertEqual(Household.objects.get().name, "Demo")
        with household_context(Household.objects.get()):
            self.assertFalse(Transaction.objects.filter(payee="Visitors entry").exists())
        self.assertIsNotNone(authenticate(username=DEMO, password=PASSWORD))
        self.assertEqual(list(get_user_model().objects.values_list("username", flat=True)), [DEMO])
        self.assertEqual(
            self.counts(),
            {"accounts": 4, "loans": 1, "transactions": 3, "categories": 5, "bills": 3, "limits": 1, "yearly": 2},
        )

    def test_reset_on_an_empty_installation_seeds(self):
        self.seed("--reset")

        self.assertEqual(Household.objects.count(), 1)
        self.assertTrue(get_user_model().objects.filter(username=DEMO).exists())

    def test_modes_are_mutually_exclusive(self):
        from django.core.management import CommandError

        with self.assertRaises(CommandError):
            call_command("seed_demo", "--reset", "--if-empty", stdout=StringIO())
