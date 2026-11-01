from django.db import migrations

from households.migrating import backfill


class Migration(migrations.Migration):
    dependencies = [("budgets", "0006_add_household")]

    operations = [migrations.RunPython(backfill("budgets", ["Category", "BudgetSettings"]), migrations.RunPython.noop)]
