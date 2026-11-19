"""Accounts, categories and transactions tools. See openspec/specs/mcp-server."""

from datetime import date, timedelta

from accounts.models import Account
from budgets.models import Category
from transactions.models import Transaction

from .testing import ToolTestCase


class AccountToolTests(ToolTestCase):
    def setUp(self):
        super().setUp()
        self.crelan = Account.objects.create(name="Crelan", account_type="checking", starting_balance_cents=10000)
        self.old = Account.objects.create(name="Old", account_type="savings", starting_balance_cents=500, archived=True)
        Transaction.objects.create(account=self.crelan, date=date(2026, 11, 1), amount_cents=-4250, payee="Shop")

    def test_balances_match_the_accounts_page(self):
        accounts = self.tool("list_accounts")["accounts"]
        page = self.api.get("/api/accounts/").json()
        self.assertEqual([a["name"] for a in accounts], [a["name"] for a in page])
        self.assertEqual(accounts[0]["balance"], "57.50 EUR")
        self.assertEqual(page[0]["current_balance_cents"], 5750)

    def test_archived_only_when_asked(self):
        self.assertEqual([a["name"] for a in self.tool("list_accounts")["accounts"]], ["Crelan"])
        accounts = self.tool("list_accounts", include_archived=True)["accounts"]
        self.assertEqual({a["name"]: a["archived"] for a in accounts}, {"Crelan": False, "Old": True})


class CategoryToolTests(ToolTestCase):
    def test_tree(self):
        groceries = Category.objects.create(name="Groceries")
        Category.objects.create(name="Supermarket", parent=groceries)
        Category.objects.create(name="Market", parent=groceries)
        Category.objects.create(name="Netflix etc", budget_kind=Category.BudgetKind.BILLS)
        tabs = Category.objects.create(name="Tabs", is_tab_group=True)
        Category.objects.create(name="Jan", parent=tabs)
        tree = {c["name"]: c for c in self.tool("list_categories")["categories"]}
        self.assertEqual([s["name"] for s in tree["Groceries"]["subcategories"]], ["Market", "Supermarket"])
        self.assertEqual(tree["Groceries"]["budget_kind"], "monthly")
        self.assertEqual(tree["Netflix etc"]["budget_kind"], "bills")
        self.assertTrue(tree["Tabs"]["is_tab_group"])
        self.assertTrue(tree["Tabs"]["subcategories"][0]["is_tab"])
        self.assertNotIn("Supermarket", tree)


class SearchToolTests(ToolTestCase):
    def setUp(self):
        super().setUp()
        self.crelan = Account.objects.create(name="Crelan", account_type="checking", starting_balance_cents=0)
        self.revolut = Account.objects.create(name="Revolut", account_type="checking", starting_balance_cents=0)
        self.groceries = Category.objects.create(name="Groceries")
        self.market = Category.objects.create(name="Market", parent=self.groceries)
        self.fun = Category.objects.create(name="Fun")
        make = Transaction.objects.create
        self.ah = make(account=self.crelan, date=date(2026, 10, 3), amount_cents=-4520, payee="ALBERT HEIJN 123", category=self.groceries)
        self.market_row = make(account=self.revolut, date=date(2026, 10, 10), amount_cents=-1200, payee="Markt", category=self.market)
        self.cinema = make(account=self.crelan, date=date(2026, 10, 12), amount_cents=-2400, payee="Cinema", notes="with albert")
        self.salary = make(account=self.crelan, date=date(2026, 9, 25), amount_cents=240000, payee="Employer")
        self.split = make(account=self.crelan, date=date(2026, 10, 15), amount_cents=-5000, payee="Hema")
        make(account=self.crelan, date=self.split.date, amount_cents=-3000, payee="Hema", split_parent=self.split, category=self.market)
        make(account=self.crelan, date=self.split.date, amount_cents=-2000, payee="Hema", split_parent=self.split, category=self.fun)

    def ids(self, **arguments):
        return [t["id"] for t in self.tool("search_transactions", **arguments)["transactions"]]

    def test_newest_first_without_parts(self):
        self.assertEqual(self.ids(), [self.split.id, self.cinema.id, self.market_row.id, self.ah.id, self.salary.id])

    def test_payee_or_notes_ignoring_case(self):
        self.assertEqual(self.ids(text="albert heijn", date_from="2026-10-01", date_to="2026-10-31"), [self.ah.id])
        self.assertEqual(self.ids(text="albert"), [self.cinema.id, self.ah.id])

    def test_dates_accounts_and_amounts(self):
        self.assertEqual(self.ids(date_to="2026-09-30"), [self.salary.id])
        self.assertEqual(self.ids(account_ids=[self.revolut.id]), [self.market_row.id])
        self.assertEqual(self.ids(max_amount="-30"), [self.split.id, self.ah.id])
        self.assertEqual(self.ids(min_amount="0"), [self.salary.id])

    def test_category_includes_subcategories_and_parts(self):
        self.assertEqual(self.ids(category_id=self.groceries.id), [self.split.id, self.market_row.id, self.ah.id])
        self.assertEqual(self.ids(category_id=self.fun.id), [self.split.id])
        self.assertIn("no category with id", self.tool_error("search_transactions", category_id=99999))

    def test_uncategorized(self):
        self.assertEqual(self.ids(uncategorized=True), [self.cinema.id, self.salary.id])

    def test_rows_say_what_they_are(self):
        rows = {t["id"]: t for t in self.tool("search_transactions")["transactions"]}
        self.assertEqual(rows[self.ah.id]["amount"], "-45.20 EUR")
        self.assertEqual(rows[self.market_row.id]["category"], "Groceries / Market")
        self.assertTrue(rows[self.split.id]["is_split"])
        self.assertEqual(rows[self.split.id]["category"], "Split")

    def test_bad_cursor(self):
        self.assertIn("cursor", self.tool_error("search_transactions", cursor="garbage"))


class PagingTests(ToolTestCase):
    def test_pages_of_fifty_with_a_total(self):
        account = Account.objects.create(name="Crelan", account_type="checking", starting_balance_cents=0)
        start = date(2026, 1, 1)
        Transaction.objects.bulk_create(
            [
                Transaction(account=account, household=self.default_household, date=start + timedelta(days=i // 3), amount_cents=-100 - i, payee=f"P{i}")
                for i in range(320)
            ]
        )
        seen, cursor, pages = [], None, 0
        while True:
            body = self.tool("search_transactions", **({"cursor": cursor} if cursor else {}))
            self.assertEqual(body["total"], 320)
            pages += 1
            seen += [t["id"] for t in body["transactions"]]
            cursor = body["next_cursor"]
            if cursor is None:
                break
        self.assertEqual(pages, 7)
        self.assertEqual(len(seen), 320)
        self.assertEqual(len(set(seen)), 320)
        self.assertEqual(len(self.tool("search_transactions", limit=200)["transactions"]), 200)
        self.assertIn("at most 200", self.tool_error("search_transactions", limit=500))


class TransactionToolTests(ToolTestCase):
    def test_a_split_with_its_parts(self):
        account = Account.objects.create(name="Crelan", account_type="checking", starting_balance_cents=0)
        groceries = Category.objects.create(name="Groceries")
        home = Category.objects.create(name="Household goods")
        split = Transaction.objects.create(account=account, date=date(2026, 10, 15), amount_cents=-5000, payee="Hema")
        Transaction.objects.create(account=account, date=split.date, amount_cents=-3000, payee="Hema", split_parent=split, category=groceries)
        Transaction.objects.create(account=account, date=split.date, amount_cents=-2000, payee="Hema", split_parent=split, category=home)
        body = self.tool("get_transaction", id=split.id)
        self.assertEqual(body["amount"], "-50.00 EUR")
        self.assertEqual(
            sorted((p["category"], p["amount"]) for p in body["parts"]),
            [("Groceries", "-30.00 EUR"), ("Household goods", "-20.00 EUR")],
        )

    def test_missing(self):
        self.assertEqual(self.tool_error("get_transaction", id=987654), "There is no transaction with id 987654.")
        self.assertIn("id is required", self.tool_error("get_transaction"))
