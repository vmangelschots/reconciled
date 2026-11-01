"""Household A attacks household B through every API route. New routes and
models fail here until they're accounted for, so isolation can't be forgotten.

This uses Django's own TestCase on purpose. households.testing binds a household
for the whole test, which would hide a view that forgot to."""

import re
from datetime import date, timedelta
from decimal import Decimal
from pathlib import Path
from unittest import mock

from cryptography.fernet import Fernet
from django.apps import apps
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core import serializers
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.urls import get_resolver
from django.urls.resolvers import URLPattern, URLResolver
from django.utils import timezone
from rest_framework.permissions import AllowAny
from rest_framework.test import APIClient

from accounts.models import Account, Loan, LoanCorrection
from backup.format import DATA_APPS
from banksync.models import BankAccountLink, BankConnection, BankCredentials, SeenBankLine
from budgets.models import BudgetSettings, Category, CategoryLimit, YearlyBudget
from forecasting.models import RecurringTransaction
from imports.models import AccountImportSettings, ImportSession
from transactions.models import Transaction

from .context import household_context
from .models import Household, Invite, Membership
from .scoping import HouseholdScoped

MARKER = "ZZ-THEIRS"
MISSING = 999999999
# Open without a household; each is tested on its own.
PUBLIC = {
    "api/auth/csrf/",
    "api/auth/login/",
    "api/invites/<str:token>/",
    "api/invites/<str:token>/accept/",
}
# Write routes taking no ids from another household, with why.
NO_FOREIGN_IDS = {
    ("post", "api/auth/logout/"),  # nothing but the session
    ("post", "api/auth/password/"),  # the user's own
    ("put", "api/household/ai/"),  # the active household's
    ("post", "api/household/leave/"),  # the active household's
    ("post", "api/household/invites/"),  # the active household's
    ("post", "api/household/switch/"),  # tests_api: SwitchTests
    ("post", "api/^accounts/$"),  # no links in the body
    ("put", "api/budgets/settings/"),  # no links in the body
    ("post", "api/^transactions/categorize/$"),  # no body
    ("post", "api/backup/restore/"),  # backup/tests.py: TwoHouseholdsTests
    ("post", "api/bank-sync/credentials/"),  # no links in the body
    ("post", "api/bank-sync/credentials/check/"),  # no body
    ("post", "api/bank-sync/authorize/"),  # no ids in the body
    ("post", "api/bank-sync/complete/"),  # tests in banksync/tests.py
    ("post", "api/bank-sync/run/"),  # no body
}


def routes():
    def walk(patterns, prefix=""):
        for pattern in patterns:
            if isinstance(pattern, URLResolver):
                yield from walk(pattern.url_patterns, prefix + str(pattern.pattern))
            else:
                yield prefix + str(pattern.pattern), pattern

    for route, pattern in walk(get_resolver().url_patterns):
        if not route.startswith("api/") or "format" in route or route == "api/":
            continue
        callback = pattern.callback
        actions = getattr(callback, "actions", None)
        view = callback.cls if hasattr(callback, "cls") else callback.view_class
        methods = sorted(actions) if actions else [m for m in ("get", "post", "put", "patch", "delete") if hasattr(view, m)]
        yield route, view, methods


def url_for(route, **ids):
    """A real path for a route, filled with ids."""
    path = "/" + route.replace("^", "").replace("$", "")
    path = re.sub(r"\(\?P<(\w+)>[^)]*\)", lambda m: str(ids[m.group(1)]), path)
    return re.sub(r"<(?:\w+:)?(\w+)>", lambda m: str(ids[m.group(1)]), path)


def has_ids(route):
    return "<" in route


@override_settings(HOUSEHOLD_ENCRYPTION_KEYS=[Fernet.generate_key().decode()], AI_CATEGORIZATION_ENABLED=False)
class Case(TestCase):
    def setUp(self):
        patcher = mock.patch("banksync.client._call", return_value={"aspsps": []})
        patcher.start()
        self.addCleanup(patcher.stop)
        self.a = Household.objects.create(name="Ours")
        self.b = Household.objects.create(name=f"{MARKER} household")
        with household_context(self.a):
            self.mine = self.seed("Mine")
        with household_context(self.b):
            self.theirs = self.seed(MARKER)
        user = get_user_model().objects.create_user("attacker", password="x")
        Membership.objects.create(user=user, household=self.a)
        self.api = APIClient()
        self.api.force_login(user)
        self.before = self.snapshot()

    def seed(self, label):
        """One row of everything, so a leak has something to leak."""
        account = Account.objects.create(name=label, account_type="checking", starting_balance_cents=100)
        loan_account = Account.objects.create(name=f"{label} loan", account_type="loan", starting_balance_cents=0)
        parent = Category.objects.create(name=f"{label} top")
        category = Category.objects.create(name=f"{label} sub", parent=parent)
        loan = Loan.objects.create(
            account=loan_account,
            principal_cents=100000,
            annual_rate=Decimal("3.0"),
            term_months=12,
            first_payment_date=date(2026, 1, 1),
            paid_from=account,
            setup_date=date(2026, 1, 1),
        )
        correction = LoanCorrection.objects.create(loan=loan, date=date(2026, 2, 1), balance_cents=5)
        txn = Transaction.objects.create(
            account=account, category=category, date=date(2026, 1, 5), amount_cents=-500, payee=label
        )
        connection = BankConnection.objects.create(
            bank_name=label,
            bank_country="BE",
            session_id=f"{label}-session",
            valid_until=timezone.now() + timedelta(days=30),
            accounts=[{"uid": "u", "hash": "h", "name": label, "iban": "", "currency": "EUR"}],
        )
        link = BankAccountLink.objects.create(
            connection=connection,
            bank_name=label,
            account_hash="h",
            account_uid="u",
            account=account,
            start_date=date(2026, 1, 1),
        )
        recurring = RecurringTransaction.objects.create(
            account=account, amount_cents=-1, payee=label, frequency="monthly", start_date=date(2026, 1, 1)
        )
        session = ImportSession.objects.create(account=account, file_format="csv", raw_content=label)
        CategoryLimit.objects.create(category=category, limit_cents=1)
        YearlyBudget.objects.create(category=category, from_year=2026, amount_cents=1)
        BudgetSettings.load()
        AccountImportSettings.objects.create(account=account)
        SeenBankLine.objects.create(account_hash="h", reference=label, transaction=txn)
        BankCredentials.objects.create(app_id=label, private_key="key")
        return {
            "account": account,
            "loan_account": loan_account,
            "category": category,
            "parent": parent,
            "correction": correction,
            "txn": txn,
            "connection": connection,
            "link": link,
            "recurring": recurring,
            "session": session,
        }

    def snapshot(self):
        with household_context(self.b):
            return {
                model._meta.label: serializers.serialize("json", model.objects.order_by("pk"))
                for model in scoped_models()
            }

    def assertUntouched(self, context):
        self.assertEqual(self.snapshot(), self.before, f"{context} changed household B")


def scoped_models():
    found = []
    for label in DATA_APPS:
        found += list(apps.get_app_config(label).get_models())
    return found


class StaticTests(TestCase):
    def test_every_data_model_is_scoped(self):
        for model in scoped_models():
            self.assertTrue(issubclass(model, HouseholdScoped), f"{model._meta.label} isn't household scoped")

    def test_all_households_is_used_only_where_allowed(self):
        allowed = {
            "households/scoping.py",
            "households/management/commands/check_household_integrity.py",
            "banksync/management/commands/rotate_encryption_key.py",
        }
        root = Path(settings.BASE_DIR)
        callers = {
            str(path.relative_to(root))
            for path in root.rglob("*.py")
            if "all_households(" in path.read_text() and "tests" not in path.name and "/migrations/" not in str(path)
        }
        self.assertEqual(callers - allowed, set())

    def test_every_open_route_is_listed(self):
        open_routes = {
            route
            for route, view, _methods in routes()
            if any(permission is AllowAny for permission in view.permission_classes)
        }
        self.assertEqual(open_routes, PUBLIC)


class ListingTests(Case):
    def test_no_route_shows_the_other_households_marker(self):
        ids = self.theirs
        query = {
            "month": "2026-01",
            "year": "2026",
            "account": ids["account"].pk,
            "category": ids["category"].pk,
            "from": "2026-01-01",
            "to": "2026-12-31",
        }
        for route, _view, methods in routes():
            if "get" not in methods or has_ids(route) or route in PUBLIC:
                continue
            with self.subTest(route=route):
                response = self.api.get(url_for(route), query)
                self.assertNotIn(MARKER, response.content.decode(errors="replace"))
        self.assertUntouched("listing")


class ForeignIdTests(Case):
    def ids(self, source):
        return {
            "pk": source,
            "correction_id": self.theirs["correction"].pk if source != MISSING else MISSING,
            "number": 1,
        }

    def pk_for(self, route):
        """Household B's id for a route; a new route has to be added here."""
        theirs = self.theirs
        table = [
            ("api/household/invites/", Invite.issue(self.b)[0]),
            ("api/^accounts/(?P<pk>[^/.]+)/loan", theirs["loan_account"]),
            ("api/^accounts/", theirs["account"]),
            ("api/^categories/", theirs["category"]),
            ("api/^transactions/", theirs["txn"]),
            ("api/^tabs/", theirs["category"]),
            ("api/^import-sessions/", theirs["session"]),
            ("api/^recurring-transactions/", theirs["recurring"]),
            ("api/bank-sync/connections/", theirs["connection"]),
            ("api/bank-sync/links/", theirs["link"]),
        ]
        for prefix, row in table:
            if route.startswith(prefix):
                return row.pk
        self.fail(f"Say which of household B's rows {route} takes an id of")

    def test_a_foreign_id_answers_like_a_missing_one(self):
        for route, _view, methods in routes():
            if not has_ids(route) or route in PUBLIC:
                continue
            for method in methods:
                with self.subTest(route=route, method=method):
                    send = getattr(self.api, method)
                    foreign = send(url_for(route, **self.ids(self.pk_for(route))), {}, format="json")
                    missing = send(url_for(route, **self.ids(MISSING)), {}, format="json")
                    self.assertEqual(foreign.status_code, missing.status_code)
                    self.assertEqual(foreign.content, missing.content)
                    self.assertUntouched(f"{method} {route}")

    def test_a_loan_of_ours_cant_reach_their_correction(self):
        mine = self.mine["loan_account"].pk
        correction = self.theirs["correction"].pk
        self.assertEqual(self.api.delete(f"/api/accounts/{mine}/loan/corrections/{correction}/").status_code, 404)
        self.assertEqual(self.api.get(f"/api/accounts/{mine}/loan/corrections/{correction}/removal/").status_code, 404)
        self.assertUntouched("deleting a correction")


class ForeignBodyTests(Case):
    def bodies(self):
        """Every write route that takes ids in its body, sent with household B's."""
        mine, theirs = self.mine, self.theirs
        my_txn = mine["txn"].pk
        txn = {"date": "2026-01-01", "amount_cents": -1, "payee": "x"}
        recurring = {"amount_cents": -1, "payee": "x", "frequency": "monthly", "start_date": "2026-01-01"}
        return [
            ("post", "api/^transactions/$", "/api/transactions/", {**txn, "account": theirs["account"].pk}),
            (
                "post",
                "api/^transactions/$",
                "/api/transactions/",
                {**txn, "account": mine["account"].pk, "category": theirs["category"].pk},
            ),
            (
                "patch",
                None,
                f"/api/transactions/{my_txn}/",
                {"category": theirs["category"].pk},
            ),
            ("patch", None, f"/api/transactions/{my_txn}/", {"account": theirs["account"].pk}),
            (
                "put",
                None,
                f"/api/transactions/{my_txn}/split/",
                {"lines": [{"amount_cents": -500, "category": theirs["category"].pk}]},
            ),
            ("post", None, f"/api/transactions/{my_txn}/transfer/", {"account": theirs["account"].pk}),
            (
                "post",
                "api/^transactions/confirm-categories/$",
                "/api/transactions/confirm-categories/",
                {"ids": [theirs["txn"].pk]},
            ),
            (
                "post",
                "api/^transactions/confirm-categories/$",
                "/api/transactions/confirm-categories/",
                {"ids": [my_txn], "category": theirs["category"].pk},
            ),
            ("post", "api/^categories/$", "/api/categories/", {"name": "x", "parent": theirs["parent"].pk}),
            ("patch", None, f"/api/categories/{mine['parent'].pk}/", {"parent": theirs["parent"].pk}),
            (
                "post",
                "api/^recurring-transactions/$",
                "/api/recurring-transactions/",
                {**recurring, "account": theirs["account"].pk},
            ),
            (
                "post",
                "api/^recurring-transactions/$",
                "/api/recurring-transactions/",
                {**recurring, "account": mine["account"].pk, "category": theirs["category"].pk},
            ),
            (
                "post",
                "api/bank-sync/links/",
                "/api/bank-sync/links/",
                {"connection_id": theirs["connection"].pk, "uid": "u", "account_id": mine["account"].pk},
            ),
            (
                "post",
                "api/bank-sync/links/",
                "/api/bank-sync/links/",
                {"connection_id": mine["connection"].pk, "uid": "u", "account_id": theirs["account"].pk},
            ),
            (
                "post",
                None,
                f"/api/accounts/{mine['loan_account'].pk}/loan/installments/1/link/",
                {"transaction": theirs["txn"].pk},
            ),
            (
                "put",
                None,
                f"/api/accounts/{mine['loan_account'].pk}/loan/",
                {
                    "principal_cents": 1000,
                    "annual_rate": "3.0",
                    "term_months": 12,
                    "first_payment_date": "2026-01-01",
                    "paid_from": theirs["account"].pk,
                },
            ),
            (
                "put",
                None,
                f"/api/accounts/{mine['loan_account'].pk}/loan/",
                {
                    "principal_cents": 1000,
                    "annual_rate": "3.0",
                    "term_months": 12,
                    "first_payment_date": "2026-01-01",
                    "paid_from": mine["account"].pk,
                    "payment_category": theirs["category"].pk,
                },
            ),
        ]

    def test_their_ids_in_a_body_are_refused(self):
        for method, _route, path, body in self.bodies():
            with self.subTest(method=method, path=path, body=body):
                response = getattr(self.api, method)(path, body, format="json")
                # Confirming skips what it can't see, and says it confirmed none.
                refused = response.status_code in (400, 404) or response.json() == {"confirmed_count": 0}
                self.assertTrue(refused, response.content)
                self.assertUntouched(f"{method} {path}")

    def test_an_import_cant_target_their_account(self):
        upload = SimpleUploadedFile("a.csv", b"date,amount\n2026-01-01,1\n")
        response = self.api.post(
            "/api/import-sessions/", {"account": self.theirs["account"].pk, "file": upload}, format="multipart"
        )
        self.assertIn(response.status_code, (400, 404), response.content)
        self.assertUntouched("uploading")

    def test_an_import_cant_assign_their_account(self):
        session = self.mine["session"]
        assign = {"product_accounts": {"Current": self.theirs["account"].pk}}
        response = self.api.post(f"/api/import-sessions/{session.pk}/assign/", assign, format="json")
        self.assertIn(response.status_code, (400, 404), response.content)
        self.assertUntouched("assigning")

    def test_every_write_route_is_accounted_for(self):
        covered = {(method, route) for method, route, _path, _body in self.bodies() if route}
        covered.add(("post", "api/^import-sessions/$"))
        missing = [
            (method, route)
            for route, _view, methods in routes()
            for method in methods
            if method not in ("get", "head")
            and not has_ids(route)
            and route not in PUBLIC
            and (method, route) not in covered
            and (method, route) not in NO_FOREIGN_IDS
        ]
        self.assertEqual(missing, [], "Add these to bodies(), or to NO_FOREIGN_IDS with why")
