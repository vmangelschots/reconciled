from django.core.management.base import BaseCommand

from banksync.sync import sync_every_household


class Command(BaseCommand):
    """The scheduled sync. Finishes quietly without credentials, so the
    CronJob can be part of every install."""

    help = "Fetch new lines from every household's linked bank accounts into the ledger"

    def handle(self, *args, **options):
        results = sync_every_household()
        if not results:
            self.stdout.write("Bank sync isn't set up.")
        for name, added in results.items():
            if added is None:
                self.stdout.write(f"{name}: a sync is already running.")
            else:
                self.stdout.write(f"{name}: added {added} lines.")
