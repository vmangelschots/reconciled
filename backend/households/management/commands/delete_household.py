from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from backup.format import clear_household
from households.context import household_context
from households.models import Household


class Command(BaseCommand):
    help = "Delete a household with all of its data, for good"

    def add_arguments(self, parser):
        parser.add_argument("household_id", type=int)
        parser.add_argument("--yes", action="store_true", help="Skip the confirmation")

    def handle(self, *args, **options):
        household = Household.objects.filter(pk=options["household_id"]).first()
        if household is None:
            raise CommandError("There's no household with that id.")
        if not options["yes"]:
            typed = input(f"Type the name to delete {household.name} and all its data: ")
            if typed != household.name:
                raise CommandError("Nothing was deleted.")
        with transaction.atomic(), household_context(household):
            clear_household(household, keep_credentials=False)
            household.invites.all().delete()
            household.memberships.all().delete()
            household.delete()
        self.stdout.write(f"Deleted {household.name}.")
