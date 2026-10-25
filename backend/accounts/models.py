from django.db import models
from django.db.models import Case, IntegerField, Sum, Value, When

# Tiers from most to least liquid; an account's tier follows its type.
# See the accounts spec's "Account tiers".
TIER_ORDER = ["everyday", "savings", "investments", "property", "loans"]
TYPE_TIERS = {
    "checking": "everyday",
    "cash": "everyday",
    "credit_card": "everyday",
    "other": "everyday",
    "savings": "savings",
    "investment": "investments",
    "property": "property",
    "loan": "loans",
}
# Types whose value is set by hand - see the value-adjustments spec.
VALUED_TYPES = {"investment", "property", "loan"}


def tier_position():
    """An expression for the position of an account's tier in TIER_ORDER,
    to order accounts by tier."""
    return Case(
        *[When(account_type=t, then=Value(TIER_ORDER.index(tier))) for t, tier in TYPE_TIERS.items()],
        default=Value(0),
        output_field=IntegerField(),
    )


class Account(models.Model):
    class AccountType(models.TextChoices):
        CHECKING = "checking", "Checking"
        SAVINGS = "savings", "Savings"
        CREDIT_CARD = "credit_card", "Credit Card"
        CASH = "cash", "Cash"
        INVESTMENT = "investment", "Investment"
        PROPERTY = "property", "Property"
        LOAN = "loan", "Loan"
        OTHER = "other", "Other"

    name = models.CharField(max_length=255)
    account_type = models.CharField(max_length=20, choices=AccountType.choices)
    starting_balance_cents = models.BigIntegerField()
    archived = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name

    @property
    def tier(self):
        return TYPE_TIERS[self.account_type]

    @property
    def current_balance_cents(self):
        """starting balance + sum of transactions, per the accounts spec."""
        # Parts of a split are inside their transaction's amount already.
        total = self.transactions.ledger_rows().aggregate(total=Sum("amount_cents"))["total"] or 0
        return self.starting_balance_cents + total
