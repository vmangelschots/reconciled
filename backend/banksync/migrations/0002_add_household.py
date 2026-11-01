import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("households", "0002_first_household"), ("banksync", "0001_initial")]

    operations = [
        migrations.AddField(
            model_name="bankconnection",
            name="household",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT, related_name="+", to="households.household", null=True
            ),
        ),
        migrations.AddField(
            model_name="bankaccountlink",
            name="household",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT, related_name="+", to="households.household", null=True
            ),
        ),
        migrations.AddField(
            model_name="seenbankline",
            name="household",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT, related_name="+", to="households.household", null=True
            ),
        ),
    ]
