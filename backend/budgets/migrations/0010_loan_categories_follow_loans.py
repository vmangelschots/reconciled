"""A loan's payment category takes its budget from the loans - see
openspec/specs/bill-budgets. Categories that were already a payment category
switch now, without waiting for the loan to be saved again."""

from django.db import migrations


def adopt_loan_categories(apps, schema_editor):
    Loan = apps.get_model("accounts", "Loan")
    Category = apps.get_model("budgets", "Category")
    ids = set(
        Loan._base_manager.filter(account__archived=False)
        .exclude(payment_category=None)
        .values_list("payment_category_id", flat=True)
    )
    for model in ("CategoryLimit", "YearlyBudget", "Bill"):
        apps.get_model("budgets", model)._base_manager.filter(category_id__in=ids).delete()
    Category._base_manager.filter(id__in=ids).update(budget_kind="bills")


def release_loan_categories(apps, schema_editor):
    Loan = apps.get_model("accounts", "Loan")
    Category = apps.get_model("budgets", "Category")
    ids = Loan._base_manager.exclude(payment_category=None).values_list("payment_category_id", flat=True)
    Category._base_manager.filter(id__in=set(ids), budget_kind="bills").update(budget_kind="monthly")


class Migration(migrations.Migration):
    dependencies = [("budgets", "0009_bills"), ("accounts", "0009_account_is_off_bank")]

    operations = [migrations.RunPython(adopt_loan_categories, release_loan_categories)]
