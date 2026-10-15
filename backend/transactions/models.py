from django.db import models


class Transaction(models.Model):
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
    notes = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-date", "-id"]

    def __str__(self):
        return f"{self.date} {self.payee} ({self.amount_cents})"
