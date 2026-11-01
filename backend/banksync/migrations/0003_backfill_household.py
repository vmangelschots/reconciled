from django.db import migrations

from households.migrating import backfill


class Migration(migrations.Migration):
    dependencies = [("banksync", "0002_add_household")]

    operations = [migrations.RunPython(backfill("banksync", ["BankConnection", "BankAccountLink", "SeenBankLine"]), migrations.RunPython.noop)]
