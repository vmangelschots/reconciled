from django.db import models


class ImportSession(models.Model):
    class FileFormat(models.TextChoices):
        CSV = "csv", "CSV"
        OFX = "ofx", "OFX"

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        COMMITTED = "committed", "Committed"

    account = models.ForeignKey(
        "accounts.Account", on_delete=models.CASCADE, related_name="import_sessions"
    )
    file_format = models.CharField(max_length=10, choices=FileFormat.choices)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)

    # The raw uploaded file content, kept only long enough to go from
    # upload -> (CSV: column mapping) -> parsed candidates -> commit.
    # Lets the CSV mapping step re-parse without asking for a re-upload.
    raw_content = models.TextField()

    # CSV only: detected once at upload time (csv.Sniffer) and reused for
    # every later parse of this session, so the mapping step never
    # re-sniffs (and potentially re-detects differently) from the stored
    # raw_content. Irrelevant for OFX sessions; left at the default.
    delimiter = models.CharField(max_length=4, default=",")

    # CSV only: the bank export recognized from the header ("revolut",
    # "crelan"; see presets.py), or blank for a file the user maps.
    preset = models.CharField(max_length=20, blank=True, default="")

    # The column mapping the candidates were parsed with (CSV without a
    # preset), and the Revolut {product: account_id | null} assignment.
    # Both are only remembered for the account once the import commits.
    mapping = models.JSONField(null=True, blank=True)
    product_accounts = models.JSONField(default=dict, blank=True)

    # Parsed candidate rows once parsing has happened (immediately for
    # OFX and single-account presets; after mapping or assigning for the
    # rest). Each item:
    # {"index": int, "date": "YYYY-MM-DD", "amount_cents": int,
    #  "description": str, "payee": str, "is_duplicate": bool,
    #  "account_id": int, "account_name": str,
    #  "transfer_match": null | {"transaction_id": int,
    #                            "counterpart_account_name": str},
    #  "pocket_pair": null | {"index": int, "account_name": str}}
    # Nothing here is a real Transaction until commit().
    candidates = models.JSONField(default=list, blank=True)

    # Filled at commit: every account the import sent lines to, so each
    # counts as imported (see openspec/specs/transaction-import).
    imported_accounts = models.ManyToManyField(
        "accounts.Account", related_name="imports_received", blank=True
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.file_format} import for {self.account} ({self.status})"


class AccountImportSettings(models.Model):
    """What the Import page remembers per upload account, written only when
    an import commits: the last CSV column mapping, and where each Revolut
    Product went ({product: account_id | null for skipped})."""

    account = models.OneToOneField(
        "accounts.Account", on_delete=models.CASCADE, related_name="import_settings"
    )
    csv_mapping = models.JSONField(null=True, blank=True)
    product_accounts = models.JSONField(default=dict, blank=True)

    def __str__(self):
        return f"Import settings for {self.account}"
