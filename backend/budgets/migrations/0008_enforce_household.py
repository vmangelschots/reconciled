import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("budgets", "0007_backfill_household")]

    operations = [
        migrations.AlterField(
            model_name="category",
            name="household",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT, related_name="+", to="households.household"
            ),
        ),
        migrations.AlterField(
            model_name="budgetsettings",
            name="household",
            field=models.OneToOneField(
                on_delete=django.db.models.deletion.PROTECT, related_name="+", to="households.household"
            ),
        ),
        migrations.RemoveConstraint(model_name="category", name="unique_top_level_category_name"),
        migrations.AddConstraint(
            model_name="category",
            constraint=models.UniqueConstraint(
                condition=models.Q(("parent__isnull", True)),
                fields=("household", "name"),
                name="unique_top_level_category_name",
            ),
        ),
    ]
