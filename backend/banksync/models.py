from django.db import models
from django.utils import timezone


class BankConnection(models.Model):
    """One authorization at a bank. Never in a backup: session_id is bank
    access, so a restore clears connections and links wait to reconnect."""

    bank_name = models.CharField(max_length=100)
    bank_country = models.CharField(max_length=2)
    session_id = models.CharField(max_length=100)
    valid_until = models.DateTimeField()
    # The bank ended the session before valid_until.
    ended_early = models.BooleanField(default=False)
    # What the bank gave access to:
    # [{"uid", "hash", "name", "iban", "currency"}]. uid only holds for this
    # session, hash (Enable Banking's identification_hash) stays the same.
    accounts = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["bank_name", "id"]

    def __str__(self):
        return self.bank_name

    @property
    def ended(self):
        return self.ended_early or self.valid_until <= timezone.now()


class BankAccountLink(models.Model):
    """A bank account feeding a ledger account. connection is null after a
    restore, until the bank is reconnected."""

    connection = models.ForeignKey(
        BankConnection, null=True, blank=True, on_delete=models.SET_NULL, related_name="links"
    )
    bank_name = models.CharField(max_length=100)
    account_hash = models.CharField(max_length=200)
    account_uid = models.CharField(max_length=100, blank=True, default="")
    account = models.OneToOneField("accounts.Account", on_delete=models.CASCADE, related_name="bank_link")
    start_date = models.DateField()
    last_synced_at = models.DateTimeField(null=True, blank=True)
    last_added_count = models.PositiveIntegerField(default=0)
    last_error = models.CharField(max_length=300, blank=True, default="")

    def __str__(self):
        return f"{self.bank_name} -> {self.account}"


class SeenBankLine(models.Model):
    """Every bank line a sync has dealt with. Keyed by account hash, not by
    link, and outliving its transaction, so neither a reconnect nor a
    deleted transaction brings a line back. A transaction with a row here
    came from the bank, so it can't be adopted by another line."""

    account_hash = models.CharField(max_length=200)
    reference = models.CharField(max_length=200)
    transaction = models.ForeignKey(
        "transactions.Transaction", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["account_hash", "reference"], name="one_seen_line_per_reference")
        ]

    def __str__(self):
        return self.reference
