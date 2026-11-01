from datetime import date
from io import StringIO

from django.contrib.auth import get_user_model
from django.core.management import CommandError, call_command
from django.db import IntegrityError, connection, transaction
from django.db.migrations.executor import MigrationExecutor
from django.test import RequestFactory, TestCase, TransactionTestCase
from rest_framework.test import APIClient

from accounts.models import Account
from budgets.models import BudgetSettings, Category, CategoryLimit
from transactions.models import Transaction

from .context import NoHousehold, bind, current_household_or_none, household_context
from .middleware import HouseholdMiddleware
from .models import Household, Membership

User = get_user_model()


class MembershipTests(TestCase):
    def test_a_user_can_be_in_two_households_but_once_in_each(self):
        user = User.objects.create_user("ann", password="x")
        one, two = Household.objects.create(name="One"), Household.objects.create(name="Two")
        Membership.objects.create(user=user, household=one)
        Membership.objects.create(user=user, household=two)
        with self.assertRaises(IntegrityError), transaction.atomic():
            Membership.objects.create(user=user, household=one)


class ScopingTests(TestCase):
    def setUp(self):
        self.one = Household.objects.create(name="One")
        self.two = Household.objects.create(name="Two")

    def test_an_unbound_query_raises(self):
        with self.assertRaises(NoHousehold):
            list(Account.objects.all())

    def test_a_query_sees_only_the_bound_household(self):
        with household_context(self.one):
            mine = Account.objects.create(name="Mine", account_type="checking", starting_balance_cents=0)
        with household_context(self.two):
            Account.objects.create(name="Theirs", account_type="checking", starting_balance_cents=0)
        with household_context(self.one):
            self.assertEqual(list(Account.objects.all()), [mine])

    def test_inherited_models_follow_their_parent(self):
        with household_context(self.one):
            account = Account.objects.create(name="A", account_type="loan", starting_balance_cents=0)
            category = Category.objects.create(name="Food")
            category.limits.create(limit_cents=5)
        with household_context(self.two):
            self.assertFalse(CategoryLimit.objects.exists())
        with household_context(self.one):
            self.assertEqual(CategoryLimit.objects.count(), 1)

    def test_saving_and_bulk_creating_stamp_the_household(self):
        with household_context(self.one):
            saved = Category.objects.create(name="Saved")
            bulk = Category.objects.bulk_create([Category(name="Bulk")])[0]
        self.assertEqual(saved.household, self.one)
        self.assertEqual(bulk.household, self.one)

    def test_a_row_in_hand_still_refreshes_and_follows_links_unbound(self):
        with household_context(self.one):
            account = Account.objects.create(name="A", account_type="checking", starting_balance_cents=0)
            row = Transaction.objects.create(account=account, date=date(2026, 1, 1), amount_cents=1, payee="p")
        row = Transaction.objects.all_households().get(pk=row.pk)
        row.refresh_from_db()
        self.assertEqual(row.account.name, "A")

    def test_budget_settings_are_per_household(self):
        with household_context(self.one):
            first = BudgetSettings.load()
        with household_context(self.two):
            self.assertNotEqual(BudgetSettings.load().pk, first.pk)

    def test_two_households_can_share_a_category_name(self):
        for household in (self.one, self.two):
            with household_context(household):
                Category.objects.create(name="Groceries")
        with household_context(self.one), self.assertRaises(IntegrityError), transaction.atomic():
            Category.objects.create(name="Groceries")


class MiddlewareTests(TestCase):
    def test_a_thread_keeps_no_household_after_a_request(self):
        household = Household.objects.create(name="One")

        def view(request):
            bind(household)
            self.assertIs(current_household_or_none(), household)
            return "ok"

        HouseholdMiddleware(view)(RequestFactory().get("/"))
        self.assertIsNone(current_household_or_none())

    def test_a_household_is_gone_even_after_an_exception(self):
        def view(request):
            bind(Household(name="x"))
            raise ValueError

        with self.assertRaises(ValueError):
            HouseholdMiddleware(view)(RequestFactory().get("/"))
        self.assertIsNone(current_household_or_none())


class HasHouseholdTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user("ann", password="x")
        self.client = APIClient()
        self.client.force_login(self.user)

    def test_a_user_without_a_household_is_sent_to_sign_in(self):
        self.assertEqual(self.client.get("/api/accounts/").status_code, 401)
        # The session has ended, so a household added later needs a new login.
        Membership.objects.create(user=self.user, household=Household.objects.create(name="One"))
        self.assertEqual(self.client.get("/api/accounts/").status_code, 401)

    def test_a_user_sees_their_household(self):
        household = Household.objects.create(name="One")
        Membership.objects.create(user=self.user, household=household)
        with household_context(household):
            Account.objects.create(name="Mine", account_type="checking", starting_balance_cents=0)
        response = self.client.get("/api/accounts/")
        self.assertEqual([a["name"] for a in response.data], ["Mine"])

    def test_a_household_in_the_session_needs_a_membership(self):
        mine = Household.objects.create(name="Mine")
        other = Household.objects.create(name="Other")
        Membership.objects.create(user=self.user, household=mine)
        with household_context(other):
            Account.objects.create(name="Theirs", account_type="checking", starting_balance_cents=0)
        session = self.client.session
        session["household_id"] = other.pk
        session.save()
        self.assertEqual(self.client.get("/api/accounts/").data, [])


class IntegrityCommandTests(TestCase):
    def test_clean_data_passes_and_a_mismatch_is_reported(self):
        one = Household.objects.create(name="One")
        two = Household.objects.create(name="Two")
        with household_context(one):
            account = Account.objects.create(name="A", account_type="checking", starting_balance_cents=0)
            Transaction.objects.create(account=account, date=date(2026, 1, 1), amount_cents=1, payee="p")
        call_command("check_household_integrity", stdout=StringIO())
        Transaction.objects.all_households().update(household=two)
        with self.assertRaisesMessage(CommandError, "transaction and its account"):
            call_command("check_household_integrity")


class UpgradeTests(TransactionTestCase):
    """An install from before households."""

    before = [
        ("accounts", "0004_loan_correction"),
        ("budgets", "0005_yearly_budgets"),
        ("transactions", "0008_loan_correction_adjustment"),
        ("banksync", "0001_initial"),
        ("households", "0001_initial"),
    ]

    def setUp(self):
        executor = MigrationExecutor(connection)
        executor.migrate(self.before)
        self.old = executor.loader.project_state(self.before).apps

    def tearDown(self):
        executor = MigrationExecutor(connection)
        executor.migrate(executor.loader.graph.leaf_nodes())

    def _upgrade(self):
        executor = MigrationExecutor(connection)
        executor.migrate(executor.loader.graph.leaf_nodes())
        return executor.loader.project_state(executor.loader.graph.leaf_nodes()).apps

    def test_everything_lands_in_one_first_household(self):
        old = self.old
        user = old.get_model("auth", "User").objects.create(username="ann")
        account = old.get_model("accounts", "Account").objects.create(
            name="Crelan", account_type="checking", starting_balance_cents=0
        )
        category = old.get_model("budgets", "Category").objects.create(name="Food")
        old.get_model("budgets", "BudgetSettings").objects.create(pk=1)
        old.get_model("transactions", "Transaction").objects.create(
            account=account, category=category, date=date(2026, 1, 1), amount_cents=-5, payee="p"
        )
        old.get_model("banksync", "SeenBankLine").objects.create(account_hash="h", reference="r")

        new = self._upgrade()

        household = new.get_model("households", "Household").objects.get()
        self.assertTrue(household.ai_enabled)
        self.assertEqual(new.get_model("households", "Membership").objects.get().user_id, user.pk)
        for app_label, name in [
            ("accounts", "Account"),
            ("budgets", "Category"),
            ("budgets", "BudgetSettings"),
            ("transactions", "Transaction"),
            ("banksync", "SeenBankLine"),
        ]:
            self.assertEqual(new.get_model(app_label, name).objects.get().household_id, household.pk)
        call_command("check_household_integrity", stdout=StringIO())

    def test_a_fresh_install_gets_no_household(self):
        new = self._upgrade()
        self.assertFalse(new.get_model("households", "Household").objects.exists())
