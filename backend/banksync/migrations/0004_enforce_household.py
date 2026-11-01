import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("banksync", "0003_backfill_household")]

    operations = [
        migrations.AlterField(
            model_name="bankconnection",
            name="household",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT, related_name="+", to="households.household"
            ),
        ),
        migrations.AlterField(
            model_name="bankaccountlink",
            name="household",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT, related_name="+", to="households.household"
            ),
        ),
        migrations.AlterField(
            model_name="seenbankline",
            name="household",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT, related_name="+", to="households.household"
            ),
        ),
        migrations.RemoveConstraint(model_name="seenbankline", name="one_seen_line_per_reference"),
        migrations.AddConstraint(
            model_name="seenbankline",
            constraint=models.UniqueConstraint(
                fields=("household", "account_hash", "reference"), name="one_seen_line_per_reference"
            ),
        ),
        migrations.AddConstraint(
            model_name="bankaccountlink",
            constraint=models.UniqueConstraint(fields=("household", "account_hash"), name="one_link_per_bank_account"),
        ),
    ]
