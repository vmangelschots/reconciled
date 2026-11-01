from datetime import date
from pathlib import Path

from django.test import SimpleTestCase

from .portfolio_file import CASH_SIGNS, SHARE_SIGNS, PortfolioFileError, read_portfolio_file

SAMPLE = (Path(__file__).parent / "testdata" / "portfolio_sample.xml").read_bytes()


def security(name="World", currency="EUR", price=10000000000, on="2026-10-30"):
    prices = f'<price t="{on}" v="{price}"/>' if price is not None else ""
    return (
        f"<security><uuid>sec-{name}</uuid><name>{name}</name><currencyCode>{currency}</currencyCode>"
        f"<prices>{prices}</prices></security>"
    )


def portfolio_tx(kind, shares=1, index=1):
    ref = f"../../../../../securities/security[{index}]"
    return (
        f'<portfolio-transaction><uuid>t</uuid><date>2026-01-01T00:00</date><amount>100</amount>'
        f'<security reference="{ref}"/><shares>{shares * 10**8}</shares><type>{kind}</type></portfolio-transaction>'
    )


def cash_tx(kind, cents=100):
    return (
        f"<account-transaction><uuid>t</uuid><date>2026-01-01T00:00</date><amount>{cents}</amount>"
        f"<shares>0</shares><type>{kind}</type></account-transaction>"
    )


def export(securities="", portfolio="", cash="", currency="EUR", version=70, base="EUR", extra=""):
    return (
        f"<client><version>{version}</version><baseCurrency>{base}</baseCurrency>"
        f"<securities>{securities}</securities>"
        f"<accounts><account><uuid>cash-1</uuid><name>Broker</name><currencyCode>{currency}</currencyCode>"
        f"<transactions>{cash}</transactions></account></accounts>"
        f"<portfolios><portfolio><uuid>port-1</uuid><name>Main</name>"
        f"<transactions>{portfolio}</transactions></portfolio></portfolios>{extra}</client>"
    ).encode()


class SampleTests(SimpleTestCase):
    """The spec's "Value worked out from the file", on the file's real shape."""

    def setUp(self):
        self.file = read_portfolio_file(SAMPLE)

    def test_holdings_follow_references_and_moves_between_portfolios(self):
        self.assertEqual(
            sorted((h.name, h.value_cents) for h in self.file.holdings),
            [("Emerging fund", 20000), ("World fund", 101000)],
        )

    def test_the_latest_price_can_sit_apart_from_the_history(self):
        world = next(h for h in self.file.holdings if h.name == "World fund")
        self.assertEqual(world.price_date, date(2026, 10, 30))

    def test_the_newest_price_can_be_in_the_history(self):
        emerging = next(h for h in self.file.holdings if h.name == "Emerging fund")
        self.assertEqual(emerging.price_date, date(2026, 10, 29))

    def test_latest_wins_over_the_history_on_the_same_date(self):
        data = SAMPLE.replace(b'<latest t="2026-10-30"', b'<latest t="2026-10-29"')
        world = next(h for h in read_portfolio_file(data).holdings if h.name == "World fund")
        self.assertEqual(world.value_cents, 101000)

    def test_a_sold_foreign_holding_without_a_price_doesnt_count(self):
        self.assertNotIn("Old US fund", [h.name for h in self.file.holdings])

    def test_an_account_first_named_inside_a_transfer_is_listed(self):
        self.assertEqual(
            sorted((c.id, c.name, c.balance_cents) for c in self.file.cash_accounts),
            [("cash-broker", "Broker", 194925), ("cash-joint", "Joint broker", 4075)],
        )


class ValueTests(SimpleTestCase):
    def test_two_holdings_at_their_prices(self):
        file = read_portfolio_file(
            export(
                security("World") + security("Emerging", price=5000000000),
                portfolio_tx("BUY", 10) + portfolio_tx("BUY", 4, index=2),
            )
        )
        self.assertEqual(sum(h.value_cents for h in file.holdings), 120000)

    def test_shares_bought_and_sold(self):
        bought = "".join(portfolio_tx("BUY", 2) for _ in range(10))
        file = read_portfolio_file(export(security(), bought + portfolio_tx("SELL", 5)))
        self.assertEqual(file.holdings[0].value_cents, 150000)

    def test_each_holding_rounds_to_the_cent(self):
        file = read_portfolio_file(
            export(security(price=33333333), portfolio_tx("BUY", 1) + portfolio_tx("BUY", 1) + portfolio_tx("BUY", 1))
        )
        self.assertEqual(file.holdings[0].value_cents, 100)

    def test_half_a_cent_rounds_up(self):
        file = read_portfolio_file(export(security(price=50000000), portfolio_tx("BUY", 1)))
        self.assertEqual(file.holdings[0].value_cents, 50)
        file = read_portfolio_file(export(security(price=500000), portfolio_tx("BUY", 1)))
        self.assertEqual(file.holdings[0].value_cents, 1)

    def test_every_share_type_counts_the_right_way(self):
        for kind, sign in SHARE_SIGNS.items():
            with self.subTest(kind):
                start = portfolio_tx("BUY", 5)
                file = read_portfolio_file(export(security(), start + portfolio_tx(kind, 2)))
                self.assertEqual(file.holdings[0].value_cents, (5 + sign * 2) * 10000)

    def test_every_cash_type_counts_the_right_way(self):
        for kind, sign in CASH_SIGNS.items():
            with self.subTest(kind):
                file = read_portfolio_file(export(cash=cash_tx(kind, 250)))
                self.assertEqual(file.cash_accounts[0].balance_cents, sign * 250)

    def test_a_cash_only_file(self):
        file = read_portfolio_file(export(cash=cash_tx("DEPOSIT", 4075)))
        self.assertEqual(file.holdings, [])
        self.assertEqual(file.cash_accounts[0].balance_cents, 4075)

    def test_an_empty_foreign_cash_account_is_fine(self):
        file = read_portfolio_file(export(currency="USD"))
        self.assertEqual(file.cash_accounts[0].balance_cents, 0)

    def test_a_sold_foreign_holding_is_fine(self):
        file = read_portfolio_file(
            export(security(currency="USD", price=None), portfolio_tx("BUY", 1) + portfolio_tx("SELL", 1))
        )
        self.assertEqual(file.holdings, [])


class RefusalTests(SimpleTestCase):
    def assertRefused(self, data, *fragments):
        with self.assertRaises(PortfolioFileError) as refused:
            read_portfolio_file(data)
        for fragment in fragments:
            self.assertIn(fragment, str(refused.exception))

    def test_an_encrypted_file(self):
        self.assertRefused(b"PORTFOLIO\x00\x01\xfe\xff random bytes", "save the file as XML")

    def test_an_empty_file(self):
        self.assertRefused(b"", "save the file as XML")

    def test_other_xml(self):
        self.assertRefused(b"<html><body/></html>", "save the file as XML")

    def test_an_old_version(self):
        self.assertRefused(export(version=69), "old Portfolio Performance")

    def test_no_version(self):
        self.assertRefused(b"<client><baseCurrency>EUR</baseCurrency></client>", "save the file as XML")

    def test_an_unknown_type(self):
        self.assertRefused(export(cash=cash_tx("MYSTERY")), "MYSTERY")
        self.assertRefused(export(security(), portfolio_tx("MYSTERY")), "MYSTERY")

    def test_a_transaction_left_out(self):
        orphan = f"<plans><stray>{cash_tx('DEPOSIT')}</stray></plans>"
        self.assertRefused(export(extra=orphan), "couldn't be understood")

    def test_a_transaction_counted_twice(self):
        twice = cash_tx("DEPOSIT") + '<account-transaction reference="../account-transaction"/>'
        self.assertRefused(export(cash=twice), "couldn't be understood")

    def test_a_reference_in_another_form(self):
        tx = '<account-transaction reference="tx-12"/>'
        self.assertRefused(export(cash=tx), "couldn't be understood")

    def test_a_reference_pointing_nowhere(self):
        tx = '<account-transaction reference="../nothing[4]"/>'
        self.assertRefused(export(cash=tx), "couldn't be understood")

    def test_a_reference_loop(self):
        tx = '<account-transaction reference="../account-transaction"/>'
        self.assertRefused(export(cash=tx), "couldn't be understood")

    def test_negative_shares(self):
        self.assertRefused(export(security(), portfolio_tx("SELL", 1)), "World")

    def test_a_foreign_base_currency(self):
        self.assertRefused(export(base="USD"), "USD")

    def test_a_foreign_holding(self):
        self.assertRefused(export(security(currency="USD"), portfolio_tx("BUY", 1)), "World", "USD")

    def test_a_foreign_cash_balance(self):
        self.assertRefused(export(cash=cash_tx("DEPOSIT"), currency="USD"), "Broker", "USD")

    def test_a_holding_without_a_price(self):
        self.assertRefused(export(security(price=None), portfolio_tx("BUY", 1)), "World", "no price")

    def test_a_broken_number(self):
        self.assertRefused(export(cash=cash_tx("DEPOSIT", "twelve")), "couldn't be understood")

    def test_an_external_entity(self):
        data = b'<?xml version="1.0"?><!DOCTYPE client [<!ENTITY x SYSTEM "file:///etc/passwd">]>' + export().replace(
            b"<name>Broker</name>", b"<name>&x;</name>"
        )
        self.assertRefused(data, "save the file as XML")
