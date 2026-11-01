from django.core.management.base import BaseCommand

from banksync.credentials import rotate
from banksync.models import BankCredentials


class Command(BaseCommand):
    help = "Re-encrypt every household's bank key with the newest HOUSEHOLD_ENCRYPTION_KEYS key"

    def handle(self, *args, **options):
        rows = list(BankCredentials.objects.all_households())
        for row in rows:
            row.encrypted_key = rotate(row.encrypted_key)
            row.save(update_fields=["encrypted_key"])
        self.stdout.write(f"Re-encrypted {len(rows)} keys. The old key can go once this is done.")
