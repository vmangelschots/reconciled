from django.core.management.base import BaseCommand, CommandError
from django.db.models import F

from accounts.models import Account, Loan
from budgets.models import Category
from transactions.models import Transaction


def mismatches():
    """Links across households. Django has no composite foreign keys, so the
    database can't refuse these; the scoped managers are what prevents them."""
    transactions = Transaction.objects.all_households()
    return {
        "transaction and its account": transactions.exclude(household=F("account__household")),
        "transaction and its category": transactions.filter(category__isnull=False).exclude(
            household=F("category__household")
        ),
        "subcategory and its parent": Category.objects.all_households()
        .filter(parent__isnull=False)
        .exclude(household=F("parent__household")),
        "loan and the account paying it": Loan.objects.all_households().exclude(
            account__household=F("paid_from__household")
        ),
    }


class Command(BaseCommand):
    help = "Check that nothing links across households"

    def handle(self, *args, **options):
        found = {label: rows.count() for label, rows in mismatches().items()}
        problems = {label: count for label, count in found.items() if count}
        if problems:
            raise CommandError("; ".join(f"{count} x {label}" for label, count in problems.items()))
        self.stdout.write(f"All clear across {Account.objects.all_households().count()} accounts.")
