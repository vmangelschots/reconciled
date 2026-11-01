import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("households", "0002_first_household"), ("budgets", "0005_yearly_budgets")]

    operations = [
        migrations.AddField(
            model_name="category",
            name="household",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT, related_name="+", to="households.household", null=True
            ),
        ),
        migrations.AddField(
            model_name="budgetsettings",
            name="household",
            field=models.OneToOneField(
                on_delete=django.db.models.deletion.PROTECT, related_name="+", to="households.household", null=True
            ),
        ),
    ]
