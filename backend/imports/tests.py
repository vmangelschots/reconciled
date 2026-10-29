import io
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework.test import APIClient

from accounts.models import Account
from budgets.models import Category
from transactions.models import Transaction
from transactions.splits import SplitLine, save_split
from transactions.tests_categorize import FakeGuesser
from transactions.transfers import link_transfer

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
            {
                "date": "Posted Date",
                "date_format": "YYYY-MM-DD",
                "amount": "Amount",
                "description": "Description",
            },
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
        self.assertIn("date_format", response.json()["detail"])
        self.assertIn("amount", response.json()["detail"])


class DelimiterDetectionTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        user = get_user_model().objects.create_user(username="budgeter", password="x")
        self.client.force_authenticate(user=user)
        self.account = Account.objects.create(
            name="Main Checking", account_type="checking", starting_balance_cents=0
        )

    def test_semicolon_delimited_file_is_detected_and_parsed(self):
        # Mirrors the real Crelan export that motivated this change,
        # including a description field containing a stray comma - the
        # kind of thing that could confuse a naive delimiter guess.
        content = (
            "Datum;Bedrag;Mededeling\n"
            "01/10/2026;-21.85;Verzekeringstaks van 9,60 voor premies\n"
            "02/10/2026;-400.00;Spending money\n"
        )
        upload = self.client.post(
            reverse("importsession-list"),
            {"account": self.account.id, "file": csv_file(content)},
            format="multipart",
        )
        self.assertEqual(upload.status_code, 201)
        data = upload.json()
        self.assertEqual(data["columns"], ["Datum", "Bedrag", "Mededeling"])

        preview = self.client.post(
            reverse("importsession-map", args=[data["id"]]),
            {
                "date": "Datum",
                "date_format": "DD/MM/YYYY",
                "amount": "Bedrag",
                "description": "Mededeling",
            },
            format="json",
        )
        self.assertEqual(preview.status_code, 200)
        candidates = preview.json()["candidates"]
        self.assertEqual(len(candidates), 2)
        self.assertEqual(candidates[0]["date"], "2026-10-01")
        self.assertEqual(candidates[0]["amount_cents"], -2185)
        self.assertEqual(candidates[0]["description"], "Verzekeringstaks van 9,60 voor premies")

    def test_comma_delimited_file_still_works(self):
        content = "Posted Date,Amount,Description\n2026-01-15,-42.50,Grocery Store\n"
        upload = self.client.post(
            reverse("importsession-list"),
            {"account": self.account.id, "file": csv_file(content)},
            format="multipart",
        )
        self.assertEqual(upload.json()["columns"], ["Posted Date", "Amount", "Description"])

    def test_inconclusive_sample_falls_back_to_comma(self):
        # A single-column file gives the sniffer nothing to detect from.
        content = "OnlyColumn\nsomething\n"
        upload = self.client.post(
            reverse("importsession-list"),
            {"account": self.account.id, "file": csv_file(content)},
            format="multipart",
        )
        self.assertEqual(upload.status_code, 201)
        self.assertEqual(upload.json()["columns"], ["OnlyColumn"])


class DateFormatTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        user = get_user_model().objects.create_user(username="budgeter", password="x")
        self.client.force_authenticate(user=user)
        self.account = Account.objects.create(
            name="Main Checking", account_type="checking", starting_balance_cents=0
        )
        content = "Date,Amount,Description\n01/10/2026,-21.85,Ambiguous date\n"
        upload = self.client.post(
            reverse("importsession-list"),
            {"account": self.account.id, "file": csv_file(content)},
            format="multipart",
        )
        self.session_id = upload.json()["id"]

    def test_same_ambiguous_date_resolves_differently_per_chosen_format(self):
        as_dd_mm = self.client.post(
            reverse("importsession-map", args=[self.session_id]),
            {"date": "Date", "date_format": "DD/MM/YYYY", "amount": "Amount", "description": "Description"},
            format="json",
        )
        self.assertEqual(as_dd_mm.json()["candidates"][0]["date"], "2026-10-01")

        as_mm_dd = self.client.post(
            reverse("importsession-map", args=[self.session_id]),
            {"date": "Date", "date_format": "MM/DD/YYYY", "amount": "Amount", "description": "Description"},
            format="json",
        )
        self.assertEqual(as_mm_dd.json()["candidates"][0]["date"], "2026-01-10")

    def test_unrecognized_date_format_is_rejected(self):
        response = self.client.post(
            reverse("importsession-map", args=[self.session_id]),
            {"date": "Date", "date_format": "not-a-real-format", "amount": "Amount", "description": "Description"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)


class DateWithTimeTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        user = get_user_model().objects.create_user(username="budgeter", password="x")
        self.client.force_authenticate(user=user)
        self.account = Account.objects.create(
            name="Main Checking", account_type="checking", starting_balance_cents=0
        )

    def preview(self, content, date_format):
        upload = self.client.post(
            reverse("importsession-list"),
            {"account": self.account.id, "file": csv_file(content)},
            format="multipart",
        )
        return self.client.post(
            reverse("importsession-map", args=[upload.json()["id"]]),
            {"date": "Date", "date_format": date_format, "amount": "Amount", "description": "Description"},
            format="json",
        )

    def test_a_date_with_a_time(self):
        response = self.preview("Date,Amount,Description\n2026-10-12 2:00:00,-254.72,Luminus SA\n", "YYYY-MM-DD")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["candidates"][0]["date"], "2026-10-12")

    def test_a_date_alone_parses_as_before(self):
        response = self.preview("Date,Amount,Description\n12.10.2026,-254.72,Luminus SA\n", "DD.MM.YYYY")
        self.assertEqual(response.json()["candidates"][0]["date"], "2026-10-12")


@override_settings(OPENAI_API_KEY="")
class SemicolonEndToEndTests(TestCase):
    """The full upload -> map -> preview -> commit flow against a
    semicolon-delimited, DD/MM/YYYY-dated file - the exact shape of the
    real Crelan file that motivated this change, replaying the existing
    'Confirm an import' spec scenario with that format instead.
    """

    def setUp(self):
        self.client = APIClient()
        user = get_user_model().objects.create_user(username="budgeter", password="x")
        self.client.force_authenticate(user=user)
        self.account = Account.objects.create(
            name="Main Checking", account_type="checking", starting_balance_cents=100000
        )

    def test_semicolon_dd_mm_yyyy_file_commits_with_correct_dates_and_amounts(self):
        content = (
            "Datum;Bedrag;Mededeling\n"
            "01/10/2026;-21.85;DKV BELGIUM premium\n"
            "02/10/2026;-400.00;Spending money\n"
            "12/10/2026;-21.50;groente\n"
        )
        upload = self.client.post(
            reverse("importsession-list"),
            {"account": self.account.id, "file": csv_file(content)},
            format="multipart",
        )
        session_id = upload.json()["id"]

        preview = self.client.post(
            reverse("importsession-map", args=[session_id]),
            {
                "date": "Datum",
                "date_format": "DD/MM/YYYY",
                "amount": "Bedrag",
                "description": "Mededeling",
            },
            format="json",
        )
        candidates = preview.json()["candidates"]
        self.assertEqual([c["date"] for c in candidates], ["2026-10-01", "2026-10-02", "2026-10-12"])

        all_indices = [c["index"] for c in candidates]
        response = self.client.post(
            reverse("importsession-commit", args=[session_id]),
            {"selected_indices": all_indices},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["created_count"], 3)

        transactions = Transaction.objects.filter(account=self.account).order_by("date")
        self.assertEqual(
            [t.date.isoformat() for t in transactions],
            ["2026-10-01", "2026-10-02", "2026-10-12"],
        )
        self.account.refresh_from_db()
        self.assertEqual(self.account.current_balance_cents, 100000 - 2185 - 40000 - 2150)


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
            {
                "date": "Posted Date",
                "date_format": "YYYY-MM-DD",
                "amount": "Amount",
                "description": "Description",
            },
            format="json",
        )
        candidates = response.json()["candidates"]
        self.assertTrue(candidates[0]["is_duplicate"])

    def preview(self, content):
        upload = self.client.post(
            reverse("importsession-list"),
            {"account": self.account.id, "file": csv_file(content)},
            format="multipart",
        )
        response = self.client.post(
            reverse("importsession-map", args=[upload.json()["id"]]),
            {"date": "Posted Date", "date_format": "YYYY-MM-DD", "amount": "Amount", "description": "Description"},
            format="json",
        )
        return response.json()["candidates"]

    def split_pizzeria(self):
        dinner = Transaction.objects.create(
            account=self.account, date="2026-03-03", amount_cents=-6000, payee="Pizzeria"
        )
        save_split(dinner, [SplitLine(-3000), SplitLine(-3000)])
        return dinner

    def test_a_reimported_split_transaction_is_a_duplicate(self):
        dinner = self.split_pizzeria()

        [candidate] = self.preview("Posted Date,Amount,Description\n2026-03-03,-60.00,Pizzeria\n")

        self.assertTrue(candidate["is_duplicate"])
        self.assertEqual(Transaction.objects.filter(split_parent=dinner).count(), 2)

    def test_parts_are_not_duplicates(self):
        self.split_pizzeria()

        [candidate] = self.preview("Posted Date,Amount,Description\n2026-03-03,-30.00,Pizzeria\n")

        self.assertFalse(candidate["is_duplicate"])


    def test_two_identical_payments_on_one_day(self):
        Transaction.objects.create(account=self.account, date="2026-10-11", amount_cents=-780, payee="LAGO Mons")

        first, second = self.preview(
            "Posted Date,Amount,Description\n2026-10-11,-7.80,LAGO Mons\n2026-10-11,-7.80,LAGO Mons\n"
        )

        self.assertTrue(first["is_duplicate"])
        self.assertFalse(second["is_duplicate"])

    def test_a_reimported_csv_line_with_a_mapped_payee(self):
        Transaction.objects.create(
            account=self.account, date="2026-02-02", amount_cents=-4250, payee="Delhaize", notes="Weekly shop"
        )
        upload = self.client.post(
            reverse("importsession-list"),
            {
                "account": self.account.id,
                "file": csv_file("Posted Date,Amount,Payee,Description\n2026-02-02,-42.50,Delhaize,Weekly shop\n"),
            },
            format="multipart",
        )
        response = self.client.post(
            reverse("importsession-map", args=[upload.json()["id"]]),
            {
                "date": "Posted Date",
                "date_format": "YYYY-MM-DD",
                "amount": "Amount",
                "payee": "Payee",
                "description": "Description",
            },
            format="json",
        )

        [candidate] = response.json()["candidates"]
        self.assertTrue(candidate["is_duplicate"])

    def test_both_identical_payments_reimported(self):
        for _ in range(2):
            Transaction.objects.create(account=self.account, date="2026-10-11", amount_cents=-780, payee="LAGO Mons")

        candidates = self.preview(
            "Posted Date,Amount,Description\n2026-10-11,-7.80,LAGO Mons\n2026-10-11,-7.80,LAGO Mons\n"
        )

        self.assertEqual([c["is_duplicate"] for c in candidates], [True, True])


@override_settings(OPENAI_API_KEY="")
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
            {
                "date": "Posted Date",
                "date_format": "YYYY-MM-DD",
                "amount": "Amount",
                "description": "Description",
            },
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
            {
                "date": "Posted Date",
                "date_format": "YYYY-MM-DD",
                "amount": "Amount",
                "description": "Description",
            },
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
            {
                "date": "Posted Date",
                "date_format": "YYYY-MM-DD",
                "amount": "Amount",
                "description": "Description",
            },
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


@override_settings(OPENAI_API_KEY="")
class TransferCounterpartImportTests(TestCase):
    """A bank line confirms a transfer counterpart the app created."""

    def setUp(self):
        self.client = APIClient()
        user = get_user_model().objects.create_user(username="budgeter", password="x")
        self.client.force_authenticate(user=user)
        self.checking = Account.objects.create(name="Checking", account_type="checking", starting_balance_cents=0)
        self.savings = Account.objects.create(name="Savings", account_type="savings", starting_balance_cents=0)
        out = Transaction.objects.create(
            account=self.checking, date="2026-03-03", amount_cents=-50000, payee="To savings"
        )
        _, self.created = link_transfer(out, self.savings)  # +500.00 in Savings on 3 March
        self.out = out

    def preview(self, rows, account=None):
        content = "Date,Amount,Description\n" + "".join(f"{d},{a},{desc}\n" for d, a, desc in rows)
        upload = self.client.post(
            reverse("importsession-list"),
            {"account": (account or self.savings).id, "file": csv_file(content)},
            format="multipart",
        )
        session_id = upload.json()["id"]
        response = self.client.post(
            reverse("importsession-map", args=[session_id]),
            {"date": "Date", "date_format": "YYYY-MM-DD", "amount": "Amount", "description": "Description"},
            format="json",
        )
        return session_id, response.json()["candidates"]

    def commit(self, session_id, indices):
        return self.client.post(
            reverse("importsession-commit", args=[session_id]), {"selected_indices": indices}, format="json"
        )

    def test_preview_marks_the_matching_line(self):
        _, candidates = self.preview([("2026-03-04", "500.00", "OVERSCHRIJVING BE12"), ("2026-03-04", "-12.00", "Shop")])

        self.assertEqual(
            candidates[0]["transfer_match"],
            {"transaction_id": self.created.pk, "counterpart_account_name": "Checking"},
        )
        self.assertFalse(candidates[0]["is_duplicate"])
        self.assertIsNone(candidates[1]["transfer_match"])

    def test_commit_replaces_the_created_counterpart_and_keeps_the_link(self):
        session_id, candidates = self.preview([("2026-03-04", "500.00", "OVERSCHRIJVING BE12")])

        response = self.commit(session_id, [c["index"] for c in candidates])

        self.assertEqual(
            response.json(),
            {
                "created_count": 0,
                "confirmed_transfer_count": 1,
                "categorized_count": 0,
                "categorized_by_source": {"history": 0, "ai": 0},
                "ai": {"status": "off", "declined_count": 0},
            },
        )
        rows = Transaction.objects.filter(account=self.savings)
        self.assertEqual(rows.count(), 1)
        confirmed = rows.get()
        self.assertEqual(confirmed.pk, self.created.pk)
        self.assertEqual(str(confirmed.date), "2026-03-04")
        self.assertEqual(confirmed.payee, "OVERSCHRIJVING BE12")
        self.assertFalse(confirmed.created_by_transfer)
        self.assertEqual(confirmed.transfer_counterpart_id, self.out.pk)

    def test_excluded_match_changes_nothing(self):
        session_id, _ = self.preview([("2026-03-04", "500.00", "OVERSCHRIJVING BE12")])

        self.commit(session_id, [])

        created = Transaction.objects.get(pk=self.created.pk)
        self.assertTrue(created.created_by_transfer)
        self.assertEqual(created.payee, "Transfer from Checking")
        self.assertEqual(Transaction.objects.filter(account=self.savings).count(), 1)

    def test_a_confirmed_counterpart_is_not_matched_again(self):
        session_id, candidates = self.preview([("2026-03-04", "500.00", "OVERSCHRIJVING BE12")])
        self.commit(session_id, [c["index"] for c in candidates])

        _, again = self.preview([("2026-03-05", "500.00", "another 500")])

        self.assertIsNone(again[0]["transfer_match"])

    def test_outside_the_window_or_other_amount_does_not_match(self):
        _, candidates = self.preview([("2026-03-09", "500.00", "late"), ("2026-03-04", "499.00", "close")])
        self.assertEqual([c["transfer_match"] for c in candidates], [None, None])

    def test_a_line_confirming_a_counterpart_stays_a_transfer_without_a_category(self):
        # Even with confirmed history for this payee, the confirmed
        # counterpart keeps its link and gets no guessed category.
        income = Category.objects.create(name="Income")
        Transaction.objects.create(
            account=self.savings, date="2026-02-01", amount_cents=10000,
            payee="OVERSCHRIJVING BE34", category=income,
        )
        session_id, candidates = self.preview([("2026-03-04", "500.00", "OVERSCHRIJVING BE12")])

        response = self.commit(session_id, [c["index"] for c in candidates])

        self.assertEqual(response.json()["categorized_count"], 0)
        confirmed = Transaction.objects.get(pk=self.created.pk)
        self.assertIsNone(confirmed.category)
        self.assertEqual(confirmed.transfer_counterpart_id, self.out.pk)

    def test_falls_back_to_creating_when_the_match_disappeared(self):
        session_id, candidates = self.preview([("2026-03-04", "500.00", "OVERSCHRIJVING BE12")])
        self.created.delete()  # e.g. the user unlinked the transfer meanwhile

        response = self.commit(session_id, [c["index"] for c in candidates])

        self.assertEqual(
            response.json(),
            {
                "created_count": 1,
                "confirmed_transfer_count": 0,
                "categorized_count": 0,
                "categorized_by_source": {"history": 0, "ai": 0},
                "ai": {"status": "off", "declined_count": 0},
            },
        )
        self.assertEqual(Transaction.objects.get(account=self.savings).payee, "OVERSCHRIJVING BE12")



@override_settings(OPENAI_API_KEY="")
class ImportCategorizationTests(TestCase):
    """Committing an import guesses categories from history - see
    openspec/specs/transaction-import and auto-categorization."""

    def setUp(self):
        self.client = APIClient()
        user = get_user_model().objects.create_user(username="budgeter", password="x")
        self.client.force_authenticate(user=user)
        self.account = Account.objects.create(name="Checking", account_type="checking", starting_balance_cents=0)
        self.groceries = Category.objects.create(name="Groceries")
        self.transport = Category.objects.create(name="Transport")
        for payee, category in (("CARREFOUR MARKET 1234", self.groceries), ("NMBS 551", self.transport)):
            Transaction.objects.create(
                account=self.account, date="2026-09-01", amount_cents=-1000, payee=payee, category=category
            )

    def import_rows(self, rows):
        content = "Date,Amount,Description\n" + "".join(f"{d},{a},{desc}\n" for d, a, desc in rows)
        upload = self.client.post(
            reverse("importsession-list"),
            {"account": self.account.id, "file": csv_file(content)},
            format="multipart",
        )
        session_id = upload.json()["id"]
        candidates = self.client.post(
            reverse("importsession-map", args=[session_id]),
            {"date": "Date", "date_format": "YYYY-MM-DD", "amount": "Amount", "description": "Description"},
            format="json",
        ).json()["candidates"]
        return self.client.post(
            reverse("importsession-commit", args=[session_id]),
            {"selected_indices": [c["index"] for c in candidates]},
            format="json",
        )

    def test_repeat_payees_arrive_with_unconfirmed_categories(self):
        response = self.import_rows(
            [
                ("2026-10-02", "-38.10", "Carrefour Market 0987"),
                ("2026-10-03", "-15.30", "NMBS 909"),
                ("2026-10-04", "-48.00", "Bistro Lumiere"),
            ]
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["created_count"], 3)
        self.assertEqual(response.json()["categorized_count"], 2)
        rows = {t.payee: t for t in Transaction.objects.filter(date__gte="2026-10-01")}
        carrefour = rows["Carrefour Market 0987"]
        self.assertEqual(carrefour.category, self.groceries)
        self.assertFalse(carrefour.category_confirmed)
        self.assertEqual(carrefour.category_source, "history")
        self.assertEqual(rows["NMBS 909"].category, self.transport)
        self.assertIsNone(rows["Bistro Lumiere"].category)
        self.assertTrue(rows["Bistro Lumiere"].category_confirmed)

    ROWS = [
        ("2026-10-02", "-38.10", "Carrefour Market 0987"),
        ("2026-10-03", "-15.30", "NMBS 909"),
        ("2026-10-04", "-48.00", "Bistro Lumiere"),
        ("2026-10-05", "-12.00", "PAYPAL *X123"),
    ]

    def import_with(self, guesser):
        with mock.patch("transactions.categorize.get_guesser", return_value=guesser):
            return self.import_rows(self.ROWS)

    def test_commit_counts_split_by_source(self):
        eating_out = Category.objects.create(name="Eating out")
        guesser = FakeGuesser({"Bistro Lumiere": (eating_out, "Restaurant name"), "PAYPAL *X123": None})

        body = self.import_with(guesser).json()

        self.assertEqual(body["categorized_count"], 3)
        self.assertEqual(body["categorized_by_source"], {"history": 2, "ai": 1})
        self.assertEqual(body["ai"], {"status": "ok", "declined_count": 1})
        bistro = Transaction.objects.get(payee="Bistro Lumiere")
        self.assertEqual((bistro.category, bistro.category_source), (eating_out, "ai"))
        self.assertEqual(bistro.category_reason, "Restaurant name")

    def test_a_rejected_key_still_commits_with_history_guesses(self):
        body = self.import_with(FakeGuesser(status="key_rejected")).json()

        self.assertEqual(body["created_count"], 4)
        self.assertEqual(body["categorized_by_source"], {"history": 2, "ai": 0})
        self.assertEqual(body["ai"]["status"], "key_rejected")

    def test_a_raising_guesser_leaves_the_import_saved_with_its_history_guesses(self):
        # The "AI slower than the deadline" scenario: the AI step fails
        # mid-commit, and the import is kept regardless.
        with self.assertLogs("transactions.categorize", "ERROR"):
            response = self.import_with(FakeGuesser(error=TimeoutError("deadline")))

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["ai"]["status"], "failed")
        self.assertEqual(Transaction.objects.filter(date__gte="2026-10-01").count(), 4)
        self.assertEqual(Transaction.objects.get(payee="NMBS 909").category, self.transport)
        self.assertIsNone(Transaction.objects.get(payee="Bistro Lumiere").category)
        self.assertEqual(ImportSession.objects.get().status, ImportSession.Status.COMMITTED)

    def test_the_import_is_saved_before_guessing_starts(self):
        # Even if categorizing itself blows up (or the worker dies), the
        # created transactions and the committed session are already saved.
        self.client.raise_request_exception = False
        with mock.patch("imports.views.categorize", side_effect=RuntimeError("worker killed")):
            with self.assertLogs("django.request", "ERROR"):
                response = self.import_rows(self.ROWS)

        self.assertEqual(response.status_code, 500)
        self.assertEqual(Transaction.objects.filter(date__gte="2026-10-01").count(), 4)
        self.assertEqual(ImportSession.objects.get().status, ImportSession.Status.COMMITTED)

    def test_the_session_says_whether_ai_is_enabled(self):
        for guesser, expected in ((None, False), (FakeGuesser(), True)):
            with self.subTest(enabled=expected), mock.patch("imports.views.get_guesser", return_value=guesser):
                upload = self.client.post(
                    reverse("importsession-list"),
                    {"account": self.account.id, "file": csv_file("Date,Amount,Description\n2026-10-02,-1.00,X\n")},
                    format="multipart",
                ).json()
                self.assertEqual(upload["ai_enabled"], expected)
                mapped = self.client.post(
                    reverse("importsession-map", args=[upload["id"]]),
                    {"date": "Date", "date_format": "YYYY-MM-DD", "amount": "Amount", "description": "Description"},
                    format="json",
                ).json()
                self.assertEqual(mapped["ai_enabled"], expected)
