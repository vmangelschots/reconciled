import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("households", "0002_first_household"), ("accounts", "0004_loan_correction")]

    operations = [
        migrations.AddField(
            model_name="account",
            name="household",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT, related_name="+", to="households.household", null=True
            ),
        ),
    ]
