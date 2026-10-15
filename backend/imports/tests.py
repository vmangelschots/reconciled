import io

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from accounts.models import Account
from transactions.models import Transaction

from .models import ImportSession

SAMPLE_OFX = """OFXHEADER:100
DATA:OFXSGML
VERSION:102
SECURITY:NONE
ENCODING:USASCII
CHARSET:1252
COMPRESSION:NONE
OLDFILEUID:NONE
NEWFILEUID:NONE

<OFX>
<SIGNONMSGSRSV1>
<SONRS>
<STATUS>
<CODE>0
<SEVERITY>INFO
</STATUS>
<DTSERVER>20260115120000
<LANGUAGE>ENG
</SONRS>
</SIGNONMSGSRSV1>
<BANKMSGSRSV1>
<STMTTRNRS>
<TRNUID>1
<STATUS>
<CODE>0
<SEVERITY>INFO
</STATUS>
<STMTRS>
<CURDEF>USD
<BANKACCTFROM>
<BANKID>123456789
<ACCTID>987654321
<ACCTTYPE>CHECKING
</BANKACCTFROM>
<BANKTRANLIST>
<DTSTART>20260101
<DTEND>20260131
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260115
<TRNAMT>-42.50
<FITID>1001
<NAME>GROCERY STORE
<MEMO>Grocery Store
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260120
<TRNAMT>1500.00
<FITID>1002
<NAME>PAYCHECK
<MEMO>Paycheck
</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL>
<BALAMT>1000.00
<DTASOF>20260131
</LEDGERBAL>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>
"""


def csv_file(content, name="export.csv"):
    return SimpleUploadedFile(name, content.encode("utf-8"), content_type="text/csv")


def ofx_file(content=SAMPLE_OFX, name="export.ofx"):
    return SimpleUploadedFile(name, content.encode("utf-8"), content_type="application/x-ofx")


class ImportUploadTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        user = get_user_model().objects.create_user(username="budgeter", password="x")
        self.client.force_authenticate(user=user)
        self.account = Account.objects.create(
            name="Main Checking", account_type="checking", starting_balance_cents=100000
        )

    def test_upload_csv_returns_columns_for_mapping(self):
        content = "Posted Date,Amount,Description\n2026-01-15,-42.50,Grocery Store\n"
        response = self.client.post(
            reverse("importsession-list"),
            {"account": self.account.id, "file": csv_file(content)},
            format="multipart",
        )
        self.assertEqual(response.status_code, 201)
        data = response.json()
        self.assertEqual(data["file_format"], "csv")
        self.assertEqual(data["columns"], ["Posted Date", "Amount", "Description"])
        self.assertEqual(data["candidates"], [])

    def test_upload_ofx_parses_automatically(self):
        response = self.client.post(
            reverse("importsession-list"),
            {"account": self.account.id, "file": ofx_file()},
            format="multipart",
        )
        self.assertEqual(response.status_code, 201)
        data = response.json()
        self.assertEqual(data["file_format"], "ofx")
        self.assertEqual(len(data["candidates"]), 2)

    def test_upload_unsupported_format_is_rejected(self):
        bad_file = SimpleUploadedFile("export.txt", b"not a bank file", content_type="text/plain")
        response = self.client.post(
            reverse("importsession-list"),
            {"account": self.account.id, "file": bad_file},
            format="multipart",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(ImportSession.objects.count(), 0)

    def test_nothing_is_created_by_preview_alone(self):
        self.client.post(
            reverse("importsession-list"),
            {"account": self.account.id, "file": ofx_file()},
            format="multipart",
        )
        self.assertEqual(Transaction.objects.count(), 0)


class CsvMappingTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        user = get_user_model().objects.create_user(username="budgeter", password="x")
        self.client.force_authenticate(user=user)
        self.account = Account.objects.create(
            name="Main Checking", account_type="checking", starting_balance_cents=0
        )
        content = (
            "Posted Date,Amount,Description\n"
            "2026-01-15,-42.50,Grocery Store\n"
            "2026-01-16,1500.00,Paycheck\n"
        )
        upload = self.client.post(
            reverse("importsession-list"),
            {"account": self.account.id, "file": csv_file(content)},
            format="multipart",
        )
        self.session_id = upload.json()["id"]

    def test_valid_mapping_parses_every_row(self):
        response = self.client.post(
            reverse("importsession-map", args=[self.session_id]),
            {"date": "Posted Date", "amount": "Amount", "description": "Description"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        candidates = response.json()["candidates"]
        self.assertEqual(len(candidates), 2)
        self.assertEqual(candidates[0]["amount_cents"], -4250)
        self.assertEqual(candidates[1]["amount_cents"], 150000)

    def test_missing_required_mapping_is_blocked(self):
        response = self.client.post(
            reverse("importsession-map", args=[self.session_id]),
            {"description": "Description"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("date", response.json()["detail"])
        self.assertIn("amount", response.json()["detail"])


class DuplicateDetectionTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        user = get_user_model().objects.create_user(username="budgeter", password="x")
        self.client.force_authenticate(user=user)
        self.account = Account.objects.create(
            name="Main Checking", account_type="checking", starting_balance_cents=100000
        )
        Transaction.objects.create(
            account=self.account, date="2026-01-15", amount_cents=-4250, payee="Grocery Store"
        )

    def test_reimported_transaction_is_flagged_as_duplicate(self):
        content = "Posted Date,Amount,Description\n2026-01-15,-42.50,Grocery Store\n"
        upload = self.client.post(
            reverse("importsession-list"),
            {"account": self.account.id, "file": csv_file(content)},
            format="multipart",
        )
        session_id = upload.json()["id"]
        response = self.client.post(
            reverse("importsession-map", args=[session_id]),
            {"date": "Posted Date", "amount": "Amount", "description": "Description"},
            format="json",
        )
        candidates = response.json()["candidates"]
        self.assertTrue(candidates[0]["is_duplicate"])


class CommitImportTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        user = get_user_model().objects.create_user(username="budgeter", password="x")
        self.client.force_authenticate(user=user)
        self.account = Account.objects.create(
            name="Main Checking", account_type="checking", starting_balance_cents=0
        )

    def test_confirm_18_of_20_creates_exactly_those_and_updates_balance(self):
        # Two existing transactions that two of the twenty CSV rows will
        # duplicate-match against (same date/amount/description).
        Transaction.objects.create(
            account=self.account, date="2026-02-01", amount_cents=-1000, payee="Row 1"
        )
        Transaction.objects.create(
            account=self.account, date="2026-02-02", amount_cents=-1000, payee="Row 2"
        )

        rows = ["Posted Date,Amount,Description"]
        for i in range(1, 21):
            rows.append(f"2026-02-{i:02d},-10.00,Row {i}")
        content = "\n".join(rows) + "\n"

        upload = self.client.post(
            reverse("importsession-list"),
            {"account": self.account.id, "file": csv_file(content)},
            format="multipart",
        )
        session_id = upload.json()["id"]
        preview = self.client.post(
            reverse("importsession-map", args=[session_id]),
            {"date": "Posted Date", "amount": "Amount", "description": "Description"},
            format="json",
        )
        candidates = preview.json()["candidates"]
        self.assertEqual(len(candidates), 20)
        duplicate_indices = {c["index"] for c in candidates if c["is_duplicate"]}
        self.assertEqual(len(duplicate_indices), 2)

        # Select everything except the duplicates - 18 of 20, matching
        # the spec's own example exactly.
        selected = [c["index"] for c in candidates if c["index"] not in duplicate_indices]
        self.assertEqual(len(selected), 18)

        response = self.client.post(
            reverse("importsession-commit", args=[session_id]),
            {"selected_indices": selected},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["created_count"], 18)

        # 2 pre-existing + 18 newly committed = 20 total on the account.
        self.assertEqual(Transaction.objects.filter(account=self.account).count(), 20)
        self.account.refresh_from_db()
        self.assertEqual(self.account.current_balance_cents, -1000 * 20)

    def test_overriding_a_duplicate_flag_includes_it_anyway(self):
        Transaction.objects.create(
            account=self.account, date="2026-03-01", amount_cents=-500, payee="Coffee"
        )
        content = "Posted Date,Amount,Description\n2026-03-01,-5.00,Coffee\n"
        upload = self.client.post(
            reverse("importsession-list"),
            {"account": self.account.id, "file": csv_file(content)},
            format="multipart",
        )
        session_id = upload.json()["id"]
        preview = self.client.post(
            reverse("importsession-map", args=[session_id]),
            {"date": "Posted Date", "amount": "Amount", "description": "Description"},
            format="json",
        )
        candidate = preview.json()["candidates"][0]
        self.assertTrue(candidate["is_duplicate"])

        # User explicitly re-includes the flagged duplicate.
        response = self.client.post(
            reverse("importsession-commit", args=[session_id]),
            {"selected_indices": [candidate["index"]]},
            format="json",
        )
        self.assertEqual(response.json()["created_count"], 1)
        self.assertEqual(Transaction.objects.filter(account=self.account).count(), 2)

    def test_cannot_commit_the_same_session_twice(self):
        content = "Posted Date,Amount,Description\n2026-04-01,-10.00,Test\n"
        upload = self.client.post(
            reverse("importsession-list"),
            {"account": self.account.id, "file": csv_file(content)},
            format="multipart",
        )
        session_id = upload.json()["id"]
        preview = self.client.post(
            reverse("importsession-map", args=[session_id]),
            {"date": "Posted Date", "amount": "Amount", "description": "Description"},
            format="json",
        )
        index = preview.json()["candidates"][0]["index"]
        self.client.post(
            reverse("importsession-commit", args=[session_id]),
            {"selected_indices": [index]},
            format="json",
        )
        second_attempt = self.client.post(
            reverse("importsession-commit", args=[session_id]),
            {"selected_indices": [index]},
            format="json",
        )
        self.assertEqual(second_attempt.status_code, 400)
        self.assertEqual(Transaction.objects.filter(account=self.account).count(), 1)
