from django.core.management.base import BaseCommand

from banksync import client
from banksync.sync import sync_all


class Command(BaseCommand):
    """The scheduled sync. Finishes quietly without credentials, so the
    CronJob can be part of every install."""

    help = "Fetch new lines from every linked bank account into the ledger"

    def handle(self, *args, **options):
        if not client.enabled():
            self.stdout.write("Bank sync isn't set up.")
            return
        added = sync_all()
        if added is None:
            self.stdout.write("A sync is already running.")
        else:
            self.stdout.write(f"Added {added} lines.")
