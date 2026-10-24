from django.db import models
from django.db.models import Sum


class Account(models.Model):
    class AccountType(models.TextChoices):
        CHECKING = "checking", "Checking"
        SAVINGS = "savings", "Savings"
        CREDIT_CARD = "credit_card", "Credit Card"
        CASH = "cash", "Cash"
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
    def has_transactions(self):
        """Whether this account has at least one transaction."""
        return self.transactions.exists()

    @property
    def current_balance_cents(self):
        """starting balance + sum of transactions, per the accounts spec."""
        # Parts of a split are inside their transaction's amount already.
        total = self.transactions.ledger_rows().aggregate(total=Sum("amount_cents"))["total"] or 0
        return self.starting_balance_cents + total
