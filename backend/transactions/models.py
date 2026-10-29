from django.db import models
from django.db.models import Exists, OuterRef


class TransactionQuerySet(models.QuerySet):
    def ledger_rows(self):
        """The bank's lines: everything except the parts of a split. What
        balances, duplicate detection and the ledger list work from."""
        return self.filter(split_parent__isnull=True)

    def counted_rows(self):
        """Each amount once, at its finest grain: unsplit transactions and
        parts, never a split transaction itself. What reports and budgets
        sum over."""
        return self.exclude(Exists(Transaction.objects.filter(split_parent=OuterRef("pk"))))

    def in_tabs(self):
        """Rows whose category is a tab. A tab group itself never has
        rows, so checking the parent is enough."""
        return self.filter(category__parent__is_tab_group=True)

    def excluding_adjustments(self):
        """Everything except value adjustments, which change a balance but
        are never income, spending or uncategorized - see the
        value-adjustments spec."""
        return self.filter(is_adjustment=False)

    def outside_tabs(self):
        """Everything except tab rows - what income and spending reports
        count. Uncategorized rows stay in."""
        return self.exclude(category__parent__is_tab_group=True)


class Transaction(models.Model):
    class CategorySource(models.TextChoices):
        MANUAL = "manual", "Manual"
        HISTORY = "history", "History"
        AI = "ai", "AI"

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
    # confirmed. Source records what produced the current category, and an
    # AI guess keeps the model's short reason until the category changes.
    # All guessing lives in transactions/categorize.py.
    category_confirmed = models.BooleanField(default=True)
    category_source = models.CharField(
        max_length=10, choices=CategorySource.choices, default=CategorySource.MANUAL
    )
    category_reason = models.CharField(max_length=200, blank=True, default="")
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
    # A part of a split transaction: same account, date and payee as its
    # split_parent, with its own amount and category. CASCADE is only a
    # safety net - deletes go through transactions/splits.py so transfer
    # parts are unlinked first.
    split_parent = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="parts",
    )
    # A value adjustment holds the value the user set its account to on its
    # date; its amount is the difference from the balance before it,
    # recomputed when earlier rows change. All rules live in
    # transactions/adjustments.py.
    is_adjustment = models.BooleanField(default=False)
    adjustment_value_cents = models.BigIntegerField(null=True, blank=True)
    # An adjustment posted by a loan schedule: the loan, its installment
    # (0 is the line-up at setup) and the payment it was matched to.
    # SET_NULL on loan turns them into ordinary adjustments when the setup
    # is removed; CASCADE on the payment removes the adjustment with it.
    # All rules live in transactions/loans.py.
    loan = models.ForeignKey(
        "accounts.Loan", null=True, blank=True, on_delete=models.SET_NULL, related_name="adjustments"
    )
    loan_installment = models.PositiveIntegerField(null=True, blank=True)
    loan_payment = models.OneToOneField(
        "self", null=True, blank=True, on_delete=models.CASCADE, related_name="loan_adjustment"
    )
    loan_linked_by_hand = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = TransactionQuerySet.as_manager()

    class Meta:
        ordering = ["-date", "-id"]
        constraints = [
            models.UniqueConstraint(
                fields=["loan", "loan_installment"],
                condition=models.Q(loan__isnull=False),
                name="one_adjustment_per_installment",
            )
        ]

    def __str__(self):
        return f"{self.date} {self.payee} ({self.amount_cents})"
