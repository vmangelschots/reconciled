"""Monthly recurring transactions that haven't ended and have a category an
expected item may use become expected items; the rest are dropped (logged).
See openspec/changes/everyday-forecast and openspec/specs/forecasting.

The category rule is copied here rather than imported, so this migration
keeps doing what it did when the app's rule moves on."""

import logging
from datetime import date

from django.db import migrations

logger = logging.getLogger(__name__)

BUDGET_KINDS = {"yearly", "target", "bills"}


def blocked_category_ids(Category, CategoryLimit, Loan):
    limited = set(CategoryLimit.objects.values_list("category_id", flat=True))
    rows = list(Category.objects.values_list("id", "parent_id", "budget_kind", "is_tab_group"))
    loans = set(Loan.objects.exclude(payment_category=None).values_list("payment_category_id", flat=True))
    covering = {cid for cid, _, kind, tab in rows if kind in BUDGET_KINDS or cid in limited or tab or cid in loans}
    return covering | {cid for cid, parent, _, _ in rows if parent in covering}


def convert(apps, schema_editor):
    RecurringTransaction = apps.get_model("forecasting", "RecurringTransaction")
    ExpectedItem = apps.get_model("forecasting", "ExpectedItem")
    blocked = blocked_category_ids(
        apps.get_model("budgets", "Category"),
        apps.get_model("budgets", "CategoryLimit"),
        apps.get_model("accounts", "Loan"),
    )
    today = date.today()
    for recurring in RecurringTransaction.objects.select_related("account", "category"):
        usable = (
            recurring.frequency == "monthly"
            and (recurring.end_date is None or recurring.end_date >= today)
            and recurring.amount_cents != 0
            and recurring.category_id is not None
            and recurring.category_id not in blocked
        )
        if not usable:
            logger.warning(
                "Dropped recurring transaction %s (%s, %s, %s cents): no expected item fits it",
                recurring.pk,
                recurring.payee,
                recurring.frequency,
                recurring.amount_cents,
            )
            continue
        ExpectedItem.objects.create(
            household_id=recurring.account.household_id,
            name=recurring.payee,
            direction="in" if recurring.amount_cents > 0 else "out",
            amount_cents=abs(recurring.amount_cents),
            day=recurring.start_date.day,
            category_id=recurring.category_id,
        )


class Migration(migrations.Migration):
    dependencies = [
        ("forecasting", "0002_expecteditem"),
    ]

    operations = [
        migrations.RunPython(convert, migrations.RunPython.noop),
    ]
