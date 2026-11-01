import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("transactions", "0010_backfill_household")]

    operations = [
        migrations.AlterField(
            model_name="transaction",
            name="household",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT, related_name="+", to="households.household"
            ),
        ),
        migrations.AddIndex(
            model_name="transaction",
            index=models.Index(fields=["household", "date"], name="txn_household_date"),
        ),
    ]
