import os

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    """Create the single deployment user, if one doesn't already exist.

    Idempotent: safe to run on every container startup. Reads credentials
    from BUDGET_APP_USERNAME / BUDGET_APP_PASSWORD so no secret is baked
    into the image or committed to the repo. Does not reset the password
    of an existing user - use `manage.py changepassword` for that.
    """

    help = "Create the single app user from BUDGET_APP_USERNAME/BUDGET_APP_PASSWORD env vars"

    def handle(self, *args, **options):
        User = get_user_model()
        username = os.environ.get("BUDGET_APP_USERNAME")
        password = os.environ.get("BUDGET_APP_PASSWORD")

        if not username or not password:
            raise CommandError(
                "BUDGET_APP_USERNAME and BUDGET_APP_PASSWORD must both be set"
            )

        if User.objects.filter(username=username).exists():
            self.stdout.write(f"User '{username}' already exists, leaving it as-is.")
            return

        User.objects.create_superuser(username=username, password=password)
        self.stdout.write(self.style.SUCCESS(f"Created user '{username}'."))
