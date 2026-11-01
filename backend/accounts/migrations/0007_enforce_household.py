import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("accounts", "0006_backfill_household")]

    operations = [
        migrations.AlterField(
            model_name="account",
            name="household",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT, related_name="+", to="households.household"
            ),
        ),
    ]
