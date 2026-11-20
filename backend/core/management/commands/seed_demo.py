"""A demo household for the public demo environment and for looking at the app
by hand. Dates follow the day it runs, so Overview, Budgets and Forecast always
have something current.

On the demo environment the backend's init container runs `seed_demo --if-empty`
and a nightly job runs `seed_demo --reset`.
"""

from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction

from accounts.models import Account, Loan
from backup.format import clear_household
from budgets.models import Bill, Category, CategoryLimit, YearlyBudget
from households.context import household_context
from households.models import Household, Membership
from transactions.models import Transaction

DEMO_USERNAME = "demo"
DEMO_PASSWORD = "demo-pass-123"
DEMO_HOUSEHOLD_NAME = "Demo"


class Command(BaseCommand):
    help = (
        "Create a demo household with accounts, transactions, bills, budgets and a loan. "
        "Safe to run on every start; --reset replaces everything first."
    )

    def add_arguments(self, parser):
        group = parser.add_mutually_exclusive_group()
        group.add_argument(
            "--if-empty",
            action="store_true",
            help="Seed only when the installation has no households at all",
        )
        group.add_argument(
            "--reset",
            action="store_true",
            help="Delete every household and the demo login, then seed again",
        )

    def handle(self, *args, **options):
        User = get_user_model()
        with transaction.atomic():
            if options["reset"]:
                self._wipe()
            elif options["if_empty"]:
                if Household.objects.exists():
                    self.stdout.write("There are households already; nothing to do.")
                    return
            elif User.objects.filter(username=DEMO_USERNAME).exists():
                self.stdout.write("The demo household exists already; nothing to do.")
                return
            self._seed()

        self.stdout.write(
            self.style.SUCCESS(f"Demo household ready. Log in as {DEMO_USERNAME} / {DEMO_PASSWORD}")
        )

    def _wipe(self):
        """Remove every household, the demo login included, so the next seed is
        the only content. There is no sign-up on a demo instance, so anything
        here was entered through the demo login."""
        User = get_user_model()
        for household in Household.objects.all():
            with household_context(household):
                clear_household(household, keep_credentials=False)
            household.invites.all().delete()
            household.memberships.all().delete()
            household.delete()
        User.objects.filter(username=DEMO_USERNAME).delete()

    def _seed(self):
        User = get_user_model()
        household = Household.objects.create(name=DEMO_HOUSEHOLD_NAME)
        user = User.objects.create_user(username=DEMO_USERNAME, password=DEMO_PASSWORD)
        Membership.objects.create(user=user, household=household)
        with household_context(household):
            _seed_rows()

    # seed_demo is for demo data only; nothing here is meant to be private.


def _seed_rows():
    today = date.today()
    month = today.replace(day=1)

    crelan = Account.objects.create(name="Crelan", account_type="checking", starting_balance_cents=320000)
    Account.objects.create(name="Revolut", account_type="checking", starting_balance_cents=45000)
    Account.objects.create(name="Spaarrekening", account_type="savings", starting_balance_cents=1200000)

    # Bills: Netflix paid this month, one bill a few days late, Spotify still to come.
    streaming = Category.objects.create(name="Streaming", budget_kind="bills")
    late_day = today.day - 3 if today.day > 3 else 1
    for name, day, cents in (("Netflix", 5, 1799), ("Disney+", late_day, 1199), ("Spotify", 21, 1099)):
        Bill.objects.create(category=streaming, name=name, day=day, amount_cents=cents, from_month=month.replace(month=1))
    Transaction.objects.create(
        account=crelan,
        date=month.replace(day=min(6, today.day)),
        amount_cents=-1799,
        payee="Netflix",
        category=streaming,
    )

    groceries = Category.objects.create(name="Groceries")
    CategoryLimit.objects.create(category=groceries, limit_cents=60000)
    Transaction.objects.create(
        account=crelan, date=month, amount_cents=-38000, payee="Delhaize", category=groceries
    )

    holidays = Category.objects.create(name="Holidays", budget_kind="yearly")
    YearlyBudget.objects.create(category=holidays, from_year=today.year, amount_cents=300000)
    Transaction.objects.create(
        account=crelan,
        date=date(today.year, 1, 3),
        amount_cents=-250000,
        payee="Flights",
        category=holidays,
    )

    insurance = Category.objects.create(name="Car insurance", budget_kind="target")
    YearlyBudget.objects.create(
        category=insurance, from_year=today.year, amount_cents=64000, due_month=1, due_day=15
    )

    Category.objects.create(name="Salary")
    house = Account.objects.create(name="House A", account_type="loan", starting_balance_cents=-9000000)
    Loan.objects.create(
        account=house,
        principal_cents=9000000,
        annual_rate="0",
        term_months=100,
        first_payment_date=(month + timedelta(days=32)).replace(day=2),
        paid_from=crelan,
        setup_date=today,
    )
