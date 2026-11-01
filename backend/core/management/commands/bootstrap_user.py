import os

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError

from banksync.credentials import NoEncryptionKey, encrypt
from banksync.models import BankCredentials
from households.context import household_context
from households.models import Household, Membership

FIRST_HOUSEHOLD_NAME = "My household"


class Command(BaseCommand):
    """Create the deployment user and make sure they have a household.

    Idempotent: safe to run on every container startup. Reads credentials
    from BUDGET_APP_USERNAME / BUDGET_APP_PASSWORD so no secret is baked
    into the image or committed to the repo. Does not reset the password
    of an existing user - use `manage.py changepassword` for that.

    Also moves Enable Banking values still in the environment into the first
    household, once, so an upgrade keeps bank sync working.
    """

    help = "Create the app user from BUDGET_APP_USERNAME/BUDGET_APP_PASSWORD env vars"

    def handle(self, *args, **options):
        User = get_user_model()
        username = os.environ.get("BUDGET_APP_USERNAME")
        password = os.environ.get("BUDGET_APP_PASSWORD")

        if not username or not password:
            raise CommandError(
                "BUDGET_APP_USERNAME and BUDGET_APP_PASSWORD must both be set"
            )

        user = User.objects.filter(username=username).first()
        if user:
            self.stdout.write(f"User '{username}' already exists, leaving it as-is.")
        else:
            user = User.objects.create_superuser(username=username, password=password)
            self.stdout.write(self.style.SUCCESS(f"Created user '{username}'."))

        household = Household.objects.order_by("id").first()
        if household is None:
            household = Household.objects.create(name=FIRST_HOUSEHOLD_NAME)
        if not user.memberships.exists():
            Membership.objects.create(user=user, household=household)
        self._import_bank_credentials(household)

    def _import_bank_credentials(self, household):
        app_id = settings.ENABLE_BANKING_APP_ID
        private_key = settings.ENABLE_BANKING_PRIVATE_KEY
        if not app_id or not private_key:
            return
        with household_context(household):
            if BankCredentials.objects.exists():
                return
            try:
                encrypted = encrypt(private_key)
            except NoEncryptionKey:
                self.stderr.write(
                    "Enable Banking values are set but HOUSEHOLD_ENCRYPTION_KEYS isn't, so they weren't "
                    "stored. Bank sync shows as not set up until it is."
                )
                return
            BankCredentials.objects.create(app_id=app_id, encrypted_key=encrypted)
        self.stdout.write("Stored the Enable Banking values for the first household.")
