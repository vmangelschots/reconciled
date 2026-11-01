import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("households", "0002_first_household"), ("transactions", "0008_loan_correction_adjustment")]

    operations = [
        migrations.AddField(
            model_name="transaction",
            name="household",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT, related_name="+", to="households.household", null=True
            ),
        ),
    ]
