from django.core.management.base import BaseCommand

from households.models import Household, Invite


class Command(BaseCommand):
    help = "Create a household and print an invite link for its first member"

    def add_arguments(self, parser):
        parser.add_argument("name")
        parser.add_argument("--url", default="", help="This Reconciled's address, e.g. https://budget.example.org")

    def handle(self, *args, **options):
        household = Household.objects.create(name=options["name"])
        _invite, token = Invite.issue(household)
        self.stdout.write(f"Created {household.name} (id {household.pk}). Send this to its first member:")
        self.stdout.write(f"{options['url'].rstrip('/')}/invite/{token}")
