from django.db import models


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
        """Whether this account has at least one transaction.

        The `transactions` app doesn't exist yet (task 3.x), so no
        account can have any transactions right now and this is
        correctly always False. Task 3.2 must update this to query the
        real transactions relation once it exists.
        """
        return False

    @property
    def current_balance_cents(self):
        """starting balance + sum of transactions, per the accounts spec.

        Until the `transactions` app exists (task 3.x) no transactions
        can exist, so this is exactly the starting balance for now.
        Task 3.2 must update this to add the transaction sum once that
        model exists.
        """
        return self.starting_balance_cents
