from django.db import models


class Transaction(models.Model):
    class CategorySource(models.TextChoices):
        MANUAL = "manual", "Manual"
        HISTORY = "history", "History"

    account = models.ForeignKey(
        "accounts.Account", on_delete=models.CASCADE, related_name="transactions"
    )
    date = models.DateField()
    amount_cents = models.BigIntegerField()
    payee = models.CharField(max_length=255)
    category = models.ForeignKey(
        "budgets.Category",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="transactions",
    )
    # A category the categorizer guessed is unconfirmed until the user
    # accepts or replaces it; everything else (and "no category") is
    # confirmed. Source records what produced the current category. All
    # guessing lives in transactions/categorize.py.
    category_confirmed = models.BooleanField(default=True)
    category_source = models.CharField(
        max_length=10, choices=CategorySource.choices, default=CategorySource.MANUAL
    )
    notes =models.TextField(blank=True, default="")
    # A transfer between two of the user's accounts is two ordinary
    # transactions pointing at each other. SET_NULL: deleting one side
    # unlinks the other. All rules live in transactions/transfers.py.
    transfer_counterpart = models.OneToOneField(
        "self",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    # True for a counterpart the app generated because nothing matched;
    # cleared once a bank import confirms it.
    created_by_transfer = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-date", "-id"]

    def __str__(self):
        return f"{self.date} {self.payee} ({self.amount_cents})"
