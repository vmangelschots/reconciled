from django.db import migrations

from households.migrating import backfill


class Migration(migrations.Migration):
    dependencies = [("accounts", "0005_add_household")]

    operations = [migrations.RunPython(backfill("accounts", ["Account"]), migrations.RunPython.noop)]
