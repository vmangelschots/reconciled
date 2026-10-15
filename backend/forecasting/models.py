from django.db import models


class RecurringTransaction(models.Model):
    class Frequency(models.TextChoices):
        WEEKLY = "weekly", "Weekly"
        BIWEEKLY = "biweekly", "Biweekly"
        MONTHLY = "monthly", "Monthly"
        YEARLY = "yearly", "Yearly"

    account = models.ForeignKey(
        "accounts.Account", on_delete=models.CASCADE, related_name="recurring_transactions"
    )
    amount_cents = models.BigIntegerField()
    payee = models.CharField(max_length=255)
    category = models.ForeignKey(
        "budgets.Category",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="recurring_transactions",
    )
    frequency = models.CharField(max_length=10, choices=Frequency.choices)
    start_date = models.DateField()
    end_date = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["start_date"]

    def __str__(self):
        return f"{self.payee} ({self.frequency}, from {self.start_date})"
