from django.db import migrations


def backfill(apps, schema_editor):
    # Before this change every import went to its one account.
    ImportSession = apps.get_model("imports", "ImportSession")
    for session in ImportSession.objects.filter(status="committed"):
        session.imported_accounts.add(session.account_id)


class Migration(migrations.Migration):
    dependencies = [("imports", "0003_bank_presets")]

    operations = [migrations.RunPython(backfill, migrations.RunPython.noop)]
