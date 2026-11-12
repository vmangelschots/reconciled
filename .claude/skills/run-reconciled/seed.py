# A demo household for looking at the app by hand: user "demo", two everyday
# accounts, savings, Bills, a monthly and a yearly budget, a yearly target and a
# loan. Dates follow today, so the Overview, Budgets and Forecast always have
# something current. Run from backend/ with:
#   python manage.py shell < ../.claude/skills/run-reconciled/seed.py
from datetime import date, timedelta

from django.contrib.auth import get_user_model

from accounts.models import Account, Loan
from budgets.models import Bill, Category, CategoryLimit, YearlyBudget
from households.context import bind
from households.models import Household, Membership
from transactions.models import Transaction

household = Household.objects.create(name="Demo")
bind(household)
user = get_user_model().objects.create_user(username="demo", password="demo-pass-123")
Membership.objects.create(user=user, household=household)

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
Transaction.objects.create(account=crelan, date=month.replace(day=min(6, today.day)), amount_cents=-1799,
                           payee="Netflix", category=streaming)

groceries = Category.objects.create(name="Groceries")
CategoryLimit.objects.create(category=groceries, limit_cents=60000)
Transaction.objects.create(account=crelan, date=month, amount_cents=-38000, payee="Delhaize", category=groceries)

holidays = Category.objects.create(name="Holidays", budget_kind="yearly")
YearlyBudget.objects.create(category=holidays, from_year=today.year, amount_cents=300000)
Transaction.objects.create(account=crelan, date=date(today.year, 1, 3), amount_cents=-250000, payee="Flights",
                           category=holidays)

insurance = Category.objects.create(name="Car insurance", budget_kind="target")
YearlyBudget.objects.create(category=insurance, from_year=today.year, amount_cents=64000, due_month=1, due_day=15)

Category.objects.create(name="Salary")
house = Account.objects.create(name="House A", account_type="loan", starting_balance_cents=-9000000)
Loan.objects.create(
    account=house, principal_cents=9000000, annual_rate="0", term_months=100,
    first_payment_date=(month + timedelta(days=32)).replace(day=2), paid_from=crelan, setup_date=today,
)
print("seeded household", household.pk, "- log in as demo / demo-pass-123")
