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

    # Parsed candidate rows once parsing has happened (immediately for
    # OFX; after the mapping step for CSV). Each item:
    # {"index": int, "date": "YYYY-MM-DD", "amount_cents": int,
    #  "description": str, "payee": str, "is_duplicate": bool}
    # Nothing here is a real Transaction until commit().
    candidates = models.JSONField(default=list, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.file_format} import for {self.account} ({self.status})"
