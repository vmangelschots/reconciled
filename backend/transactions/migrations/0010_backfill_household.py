from django.db import migrations

from households.migrating import backfill


class Migration(migrations.Migration):
    dependencies = [("transactions", "0009_add_household")]

    operations = [migrations.RunPython(backfill("transactions", ["Transaction"]), migrations.RunPython.noop)]
