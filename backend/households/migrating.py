"""Moving a single-household install's rows into its first household. Migrations
add the field, backfill it, and enforce it in separate files, because one
PostgreSQL transaction can't both update rows and alter their table."""


def backfill(app_label, model_names):
    def run(apps, schema_editor):
        first = apps.get_model("households", "Household").objects.order_by("id").first()
        for name in model_names:
            model = apps.get_model(app_label, name)
            if first is not None:
                model.objects.update(household=first)
            if model.objects.filter(household__isnull=True).exists():
                raise RuntimeError(f"{app_label}.{name} has rows but there is no household to put them in.")

    return run
