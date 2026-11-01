from django.conf import settings
from django.db import migrations

FIRST_HOUSEHOLD_NAME = "My household"


def create_first_household(apps, schema_editor):
    """An install with users or data becomes one household, with AI as it was."""
    User = apps.get_model(*settings.AUTH_USER_MODEL.split("."))
    data = [
        apps.get_model("accounts", "Account"),
        apps.get_model("budgets", "Category"),
        apps.get_model("budgets", "BudgetSettings"),
        apps.get_model("transactions", "Transaction"),
        apps.get_model("banksync", "BankConnection"),
        apps.get_model("banksync", "SeenBankLine"),
    ]
    users = list(User.objects.all())
    if not users and not any(model.objects.exists() for model in data):
        return
    Household = apps.get_model("households", "Household")
    Membership = apps.get_model("households", "Membership")
    household = Household.objects.create(name=FIRST_HOUSEHOLD_NAME, ai_enabled=True)
    Membership.objects.bulk_create(Membership(user=user, household=household) for user in users)


class Migration(migrations.Migration):
    dependencies = [
        ("households", "0001_initial"),
        ("accounts", "0004_loan_correction"),
        ("budgets", "0005_yearly_budgets"),
        ("transactions", "0008_loan_correction_adjustment"),
        ("forecasting", "0001_initial"),
        ("imports", "0004_backfill_imported_accounts"),
        ("banksync", "0001_initial"),
    ]

    operations = [migrations.RunPython(create_first_household, migrations.RunPython.noop)]
