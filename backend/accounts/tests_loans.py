from datetime import date
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from budgets.models import Category
from transactions.models import Transaction

from .models import Account, Loan


def euros(amount):
    return round(amount * 100)


class LoanApiTestCase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(get_user_model().objects.create_user(username="budgeter", password="x"))
        self.crelan = Account.objects.create(name="Crelan", account_type="checking", starting_balance_cents=0)
        self.mortgage = Account.objects.create(name="Mortgage", account_type="loan", starting_balance_cents=0)
        self.category = Category.objects.create(name="Mortgage")
        self.today = patch("django.utils.timezone.localdate", return_value=date(2026, 11, 12))
        self.today.start()
        self.addCleanup(self.today.stop)

    def terms(self, **overrides):
        return {
            "principal_cents": euros(200000),
            "annual_rate": "3.00",
            "term_months": 300,
            "first_payment_date": "2024-12-02",
            "paid_from": self.crelan.id,
            "payment_category": self.category.id,
            **overrides,
        }

    def put(self, account=None, **overrides):
        return self.client.put(
            reverse("account-loan", args=[(account or self.mortgage).id]), self.terms(**overrides), format="json"
        )

    def pay(self, on, amount):
        return Transaction.objects.create(account=self.crelan, date=on, amount_cents=euros(amount), payee="BNP")


class LoanApiTests(LoanApiTestCase):
    """The loan-schedules spec, through /api/accounts/{id}/loan/."""

    def test_set_up_the_mortgage(self):
        response = self.put()
        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertEqual(len(body["installments"]), 300)
        self.assertEqual(body["payment_cents"], euros(944.22))
        self.assertEqual(body["paid_from_name"], "Crelan")
        self.assertEqual(body["end_date"], "2049-11-02")
        loan = Loan.objects.get(account=self.mortgage)
        self.assertEqual((loan.setup_date, loan.payment_category), (date(2026, 11, 12), self.category))

    def test_invalid_terms_are_rejected(self):
        other_loan = Account.objects.create(name="Car", account_type="loan", starting_balance_cents=0)
        archived = Account.objects.create(name="Old", account_type="checking", starting_balance_cents=0, archived=True)
        for overrides in (
            {"principal_cents": 0},
            {"annual_rate": "-1"},
            {"term_months": 0},
            {"paid_from": self.mortgage.id},
            {"paid_from": other_loan.id},
            {"paid_from": archived.id},
        ):
            with self.subTest(overrides):
                self.assertEqual(self.put(**overrides).status_code, 400)
        self.assertFalse(Loan.objects.exists())

    def test_not_offered_on_other_accounts(self):
        self.assertEqual(self.put(account=self.crelan).status_code, 400)
        self.assertEqual(self.client.get(reverse("account-loan", args=[self.crelan.id])).status_code, 400)

    def test_a_loan_without_a_setup(self):
        self.assertEqual(self.client.get(reverse("account-loan", args=[self.mortgage.id])).status_code, 404)

    def test_terms_that_match_the_bank(self):
        for on in (date(2026, 9, 2), date(2026, 10, 2), date(2026, 11, 2)):
            self.pay(on, -944.22)
        self.pay(date(2026, 8, 2), -944.22)  # more than 90 days ago
        response = self.client.post(reverse("account-loan-preview", args=[self.mortgage.id]), self.terms(), format="json")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["payment_cents"], euros(944.22))
        self.assertEqual(body["next_installment"], {"number": 25, "date": "2026-12-02"})
        self.assertEqual([p["date"] for p in body["found_payments"]], ["2026-11-02", "2026-10-02", "2026-09-02"])
        self.assertIsNone(body["repost"])
        self.assertFalse(Loan.objects.exists())

    def test_terms_that_dont_match(self):
        body = self.client.post(reverse("account-loan-preview", args=[self.mortgage.id]), self.terms(), format="json").json()
        self.assertEqual(body["found_payments"], [])

    def test_repost_counts_in_an_edit_preview(self):
        with patch("django.utils.timezone.localdate", return_value=date(2026, 10, 20)):
            self.put(first_payment_date="2026-11-02")
        self.pay(date(2026, 11, 2), -944.22)
        self.client.get(reverse("account-loan", args=[self.mortgage.id]))
        preview = lambda **o: self.client.post(  # noqa: E731
            reverse("account-loan-preview", args=[self.mortgage.id]),
            self.terms(first_payment_date="2026-11-02", **o),
            format="json",
        ).json()
        self.assertEqual(preview(annual_rate="2.90")["repost"], {"installments": 1, "no_longer_matching": 1})
        self.assertIsNone(preview(payment_category=None)["repost"])

    def test_states_in_the_table(self):
        with patch("django.utils.timezone.localdate", return_value=date(2026, 10, 20)):
            self.put(first_payment_date="2026-09-02")
        payment = self.pay(date(2026, 11, 4), -944.22)
        body = self.client.get(reverse("account-loan", args=[self.mortgage.id])).json()
        states = {i["date"]: i["state"] for i in body["installments"][:5]}
        self.assertEqual(
            states,
            {
                "2026-09-02": "before_setup",
                "2026-10-02": "before_setup",
                "2026-11-02": "posted",
                "2026-12-02": "due",
                "2027-01-02": "upcoming",
            },
        )
        self.assertEqual(body["installments"][2]["payment"]["id"], payment.id)
        self.assertFalse(body["installments"][2]["payment"]["linked_by_hand"])

    def test_a_missed_installment(self):
        with patch("django.utils.timezone.localdate", return_value=date(2026, 10, 20)):
            self.put(first_payment_date="2026-11-02")
        body = self.client.get(reverse("account-loan", args=[self.mortgage.id])).json()
        self.assertEqual([i["state"] for i in body["installments"][:2]], ["missed", "due"])

    def test_link_and_unlink_through_the_api(self):
        with patch("django.utils.timezone.localdate", return_value=date(2026, 10, 20)):
            self.put(first_payment_date="2026-11-02")
        payment = self.pay(date(2026, 11, 9), -944.22)
        candidates = self.client.get(reverse("account-loan-candidates", args=[self.mortgage.id, 1])).json()
        self.assertEqual(candidates[0]["id"], payment.id)
        response = self.client.post(
            reverse("account-loan-link", args=[self.mortgage.id, 1]), {"transaction": payment.id}, format="json"
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["installments"][0]["payment"]["linked_by_hand"])
        response = self.client.delete(reverse("account-loan-link", args=[self.mortgage.id, 1]))
        self.assertEqual(response.json()["installments"][0]["state"], "missed")

    def test_remove(self):
        self.put()
        self.assertEqual(self.client.delete(reverse("account-loan", args=[self.mortgage.id])).status_code, 204)
        self.assertFalse(Loan.objects.exists())


class LoanSyncTests(LoanApiTests):
    """The loan-schedules spec's "Matching needs no background job" and the
    overview spec's "Missed loan payments"."""

    def set_up_on(self, today, first):
        with patch("django.utils.timezone.localdate", return_value=today):
            self.put(first_payment_date=first)

    def missed(self, today):
        with patch("django.utils.timezone.localdate", return_value=today):
            body = self.client.get(reverse("report-overview"), {"month": today.strftime("%Y-%m")}).json()
        return body["attention"]["missed_loans"]

    def test_after_an_import(self):
        from django.core.files.uploadedfile import SimpleUploadedFile

        self.set_up_on(date(2026, 10, 20), "2026-11-02")
        content = "Date,Amount,Payee\n2026-11-03,-944.22,BNP HYPOTHEEK\n"
        upload = self.client.post(
            reverse("importsession-list"),
            {"account": self.crelan.id, "file": SimpleUploadedFile("x.csv", content.encode(), content_type="text/csv")},
            format="multipart",
        )
        session_id = upload.json()["id"]
        preview = self.client.post(
            reverse("importsession-map", args=[session_id]),
            {"date": "Date", "date_format": "YYYY-MM-DD", "amount": "Amount", "description": "Payee"},
            format="json",
        )
        indices = [c["index"] for c in preview.json()["candidates"]]
        response = self.client.post(
            reverse("importsession-commit", args=[session_id]), {"selected_indices": indices}, format="json"
        )
        self.assertEqual(response.status_code, 201)
        adjustment = Transaction.objects.get(loan__account=self.mortgage, loan_installment=1)
        self.assertEqual(adjustment.adjustment_value_cents, euros(-199549.03))
        payment = adjustment.loan_payment
        self.assertEqual((payment.category, payment.category_confirmed), (self.category, True))
        rows = self.client.get(reverse("transaction-list"), {"account": self.mortgage.id}).json()
        self.assertIn(adjustment.id, [r["id"] for r in rows])

    def test_the_ledger_list_syncs(self):
        self.set_up_on(date(2026, 10, 20), "2026-11-02")
        self.pay(date(2026, 11, 2), -944.22)
        rows = self.client.get(reverse("transaction-list"), {"account": self.mortgage.id}).json()
        self.assertEqual(sorted(r["loan_installment"] for r in rows), [0, 1])

    def test_a_payment_not_seen(self):
        self.set_up_on(date(2026, 10, 20), "2026-11-02")
        self.assertEqual(
            self.missed(date(2026, 11, 12)),
            [
                {
                    "account_id": self.mortgage.id,
                    "name": "Mortgage",
                    "date": "2026-11-02",
                    "installment": 1,
                    "term_months": 300,
                    "payment_cents": euros(944.22),
                    "paid_from_name": "Crelan",
                }
            ],
        )

    def test_still_within_the_window(self):
        self.set_up_on(date(2026, 10, 20), "2026-11-02")
        self.assertEqual(self.missed(date(2026, 11, 5)), [])

    def test_a_later_payment_matched(self):
        self.set_up_on(date(2026, 10, 20), "2026-11-02")
        self.pay(date(2026, 12, 2), -944.22)
        self.assertEqual(self.missed(date(2026, 12, 12)), [])

    def test_a_loan_without_a_setup_never_shows(self):
        self.assertEqual(self.missed(date(2026, 11, 12)), [])

    def test_covered_by_a_correction(self):
        from transactions.loans import add_correction

        self.set_up_on(date(2026, 10, 20), "2026-11-02")
        add_correction(Loan.objects.get(), date(2026, 11, 10), date(2026, 11, 10), euros(190000))
        self.assertEqual(self.missed(date(2026, 11, 12)), [])


class CorrectionApiTests(LoanApiTestCase):
    """The loan-schedules spec's balance corrections, through
    /api/accounts/{id}/loan/corrections/. Today is 12 November 2026, the
    setup day; installment 24 of 2 November left 188,864.23."""

    def setUp(self):
        super().setUp()
        self.put()

    def url(self, suffix=""):
        return reverse("account-loan", args=[self.mortgage.id]).rstrip("/") + f"/corrections/{suffix}"

    def correction(self, owed, on="2026-11-12", payment=None):
        return {"date": on, "balance_cents": euros(owed), "payment_cents": payment and euros(payment)}

    def test_checking_a_correction(self):
        response = self.client.post(self.url("preview/"), self.correction(170000), format="json")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(
            (body["payment_cents"], body["previous_payment_cents"], body["installments_left"], body["end_date"]),
            (euros(849.91), euros(944.22), 276, "2049-11-02"),
        )
        self.assertEqual(body["first_installment"], {"number": 25, "date": "2026-12-02"})
        self.assertEqual(body["difference_cents"], euros(-18864.23))
        self.assertEqual((body["found_payments"], body["near_payment"]), ([], None))
        self.assertEqual(body["repost"], {"installments": 0, "no_longer_matching": 0})

    def test_a_cent_off(self):
        self.pay(date(2026, 10, 28), -849.90)
        body = self.client.post(self.url("preview/"), self.correction(170000), format="json").json()
        self.assertEqual((body["near_payment"]["date"], body["near_payment"]["amount_cents"]), ("2026-10-28", euros(-849.90)))
        chosen = self.client.post(self.url("preview/"), self.correction(170000, payment=849.90), format="json").json()
        self.assertEqual([p["date"] for p in chosen["found_payments"]], ["2026-10-28"])

    def test_add_and_remove(self):
        response = self.client.post(self.url(), self.correction(170000), format="json")
        self.assertEqual(response.status_code, 201)
        body = response.json()
        [correction] = body["corrections"]
        self.assertEqual(
            (correction["balance_cents"], correction["payment_before_cents"], correction["payment_after_cents"]),
            (euros(170000), euros(944.22), euros(849.91)),
        )
        self.assertEqual((body["payment_cents"], body["payment_since"]), (euros(849.91), "2026-12-02"))
        self.assertEqual(body["installments"][24]["correction_id"], correction["id"])
        self.assertEqual(body["current_balance_cents"], euros(-170000))

        removal = self.client.get(self.url(f"{correction['id']}/removal/")).json()
        self.assertEqual(removal["payment_cents"], euros(944.22))
        response = self.client.delete(self.url(f"{correction['id']}/"))
        self.assertEqual(response.status_code, 200)
        self.assertEqual((response.json()["corrections"], response.json()["payment_since"]), ([], None))
        self.assertEqual(self.client.delete(self.url(f"{correction['id']}/")).status_code, 404)

    def test_rejections(self):
        for body in (self.correction(170000, on="2026-11-13"), self.correction(170000, payment=100)):
            with self.subTest(body=body):
                response = self.client.post(self.url(), body, format="json")
                self.assertEqual(response.status_code, 400)
                self.assertIn("detail", response.json())
        self.assertEqual(self.client.post(self.url("preview/"), self.correction(-1), format="json").status_code, 400)

    def test_paid_off(self):
        body = self.client.post(self.url(), self.correction(0), format="json").json()
        self.assertEqual(body["paid_off_on"], "2026-11-12")
        self.assertEqual(body["corrections"][0]["payment_after_cents"], None)
        self.assertEqual(self.client.get(reverse("account-loan", args=[self.mortgage.id])).status_code, 200)

    def test_no_suggestion_without_misses(self):
        self.assertIsNone(self.client.get(reverse("account-loan", args=[self.mortgage.id])).json()["suggestion"])


class SetUpWithBankBalanceApiTests(LoanApiTestCase):
    def test_setting_up_with_the_banks_balance(self):
        preview = self.client.post(
            reverse("account-loan-preview", args=[self.mortgage.id]),
            self.terms(bank_balance_cents=euros(170000)),
            format="json",
        ).json()
        self.assertEqual((preview["payment_cents"], preview["schedule_payment_cents"]), (euros(849.91), euros(944.22)))

        body = self.put(bank_balance_cents=euros(170000)).json()

        self.assertEqual([c["date"] for c in body["corrections"]], ["2026-11-12"])
        self.assertEqual(body["current_balance_cents"], euros(-170000))
        # An edit ignores it and keeps the correction.
        self.assertEqual(self.put(bank_balance_cents=euros(1)).json()["current_balance_cents"], euros(-170000))

    def test_setting_up_with_the_banks_figure_from_before_an_installment(self):
        refused = self.client.post(
            reverse("account-loan-preview", args=[self.mortgage.id]),
            self.terms(bank_balance_cents=euros(170000), bank_balance_date="2026-09-01"),
            format="json",
        )
        self.assertEqual(refused.status_code, 400)
        body = self.put(bank_balance_cents=euros(170000), bank_balance_date="2026-10-30").json()
        self.assertEqual([c["date"] for c in body["corrections"]], ["2026-10-30"])
