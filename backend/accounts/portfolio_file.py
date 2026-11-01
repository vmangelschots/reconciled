"""Reading a Portfolio Performance XML export: what the holdings and cash
accounts in it are worth. See openspec/specs/portfolio-value-import.

The export is XStream XML. An object is defined where it first appears, which
can be inside a transaction under another tag, and is a `reference` path after
that, so owners are found by their shape and every reference is followed. The
format isn't a public contract: whatever isn't understood refuses the whole
file, because a refusal is annoying and a wrong number in net worth isn't seen.
"""

import re
from dataclasses import dataclass
from datetime import date
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

from lxml import etree

# Older exports haven't been checked; see the change's design.
MIN_VERSION = 70
CURRENCY = "EUR"
SHARES_FACTOR = Decimal(10**8)
PRICE_FACTOR = Decimal(10**8)

SHARE_SIGNS = {
    "BUY": 1,
    "DELIVERY_INBOUND": 1,
    "TRANSFER_IN": 1,
    "SELL": -1,
    "DELIVERY_OUTBOUND": -1,
    "TRANSFER_OUT": -1,
}
CASH_SIGNS = {
    "DEPOSIT": 1,
    "INTEREST": 1,
    "DIVIDENDS": 1,
    "FEES_REFUND": 1,
    "TAX_REFUND": 1,
    "SELL": 1,
    "TRANSFER_IN": 1,
    "REMOVAL": -1,
    "INTEREST_CHARGE": -1,
    "FEES": -1,
    "TAXES": -1,
    "BUY": -1,
    "TRANSFER_OUT": -1,
}

NOT_AN_EXPORT = (
    "This isn't a file Reconciled can read. In Portfolio Performance, save the "
    "file as XML first; encrypted and binary files can't be read."
)
NOT_UNDERSTOOD = "Part of this file couldn't be understood, so no value can be worked out from it."

_REFERENCE_STEP = re.compile(r"([\w.-]+)(?:\[(\d+)\])?")


class PortfolioFileError(Exception):
    """The file can't be accounted for in full. The message is for the user."""


@dataclass(frozen=True)
class Holding:
    name: str
    price_date: date
    value_cents: int


@dataclass(frozen=True)
class CashAccount:
    id: str
    name: str
    balance_cents: int


@dataclass(frozen=True)
class PortfolioFile:
    holdings: list
    cash_accounts: list


def read_portfolio_file(data):
    """The holdings and cash accounts in the export `data` (bytes), or raises
    PortfolioFileError."""
    client = _parse(data)
    _check_header(client)
    portfolios, accounts = _owners(client)
    try:
        return _read(client, portfolios, accounts)
    except (ArithmeticError, TypeError, ValueError, AttributeError) as error:
        raise PortfolioFileError(NOT_UNDERSTOOD) from error


def _parse(data):
    parser = etree.XMLParser(resolve_entities=False, no_network=True, load_dtd=False, huge_tree=False)
    try:
        root = etree.fromstring(data, parser)
    except (etree.XMLSyntaxError, ValueError) as error:
        raise PortfolioFileError(NOT_AN_EXPORT) from error
    # An export never declares a DOCTYPE, and entities can only come from one.
    if root.tag != "client" or root.getroottree().docinfo.doctype:
        raise PortfolioFileError(NOT_AN_EXPORT)
    return root


def _check_header(client):
    try:
        version = int(client.findtext("version"))
    except (TypeError, ValueError) as error:
        raise PortfolioFileError(NOT_AN_EXPORT) from error
    if version < MIN_VERSION:
        raise PortfolioFileError("This file comes from an old Portfolio Performance. Update it and save the file again.")
    base = client.findtext("baseCurrency")
    if base != CURRENCY:
        raise PortfolioFileError(f"This file's base currency is {base}. Only euro is supported.")


def _resolve(element):
    """The element a `reference` points at, or the element itself."""
    hops = 0
    while "reference" in element.attrib:
        hops += 1
        if hops > 100:
            raise PortfolioFileError(NOT_UNDERSTOOD)
        target = element
        for step in element.attrib["reference"].split("/"):
            target = target.getparent() if step == ".." else _child(target, step)
            if target is None:
                raise PortfolioFileError(NOT_UNDERSTOOD)
        element = target
    return element


def _child(element, step):
    match = _REFERENCE_STEP.fullmatch(step)
    if match is None:
        raise PortfolioFileError(NOT_UNDERSTOOD)
    matching = list(element.iterchildren(match[1]))
    index = int(match[2] or 1) - 1
    return matching[index] if 0 <= index < len(matching) else None


def _owners(client):
    """(portfolios, cash accounts): every element that lists transactions,
    wherever it is defined. Only a cash account has a currency."""
    portfolios, accounts = [], []
    for element in client.iter("*"):
        if "reference" in element.attrib or element.tag == "investment-plan":
            continue
        if element.find("uuid") is None or element.find("transactions") is None:
            continue
        (portfolios if element.find("currencyCode") is None else accounts).append(element)
    return portfolios, accounts


def _transactions(owner, reached):
    """The owner's transactions, each counted once in `reached`."""
    for entry in owner.find("transactions").iterchildren("*"):
        transaction = _resolve(entry)
        if transaction in reached:
            raise PortfolioFileError(NOT_UNDERSTOOD)
        reached.add(transaction)
        yield transaction


def _sign(signs, transaction):
    kind = transaction.findtext("type")
    if kind not in signs:
        raise PortfolioFileError(f"This file has a transaction of a type Reconciled doesn't know: {kind}.")
    return signs[kind]


def _read(client, portfolios, accounts):
    reached = set()
    shares = {}
    for portfolio in portfolios:
        for transaction in _transactions(portfolio, reached):
            security = _resolve(transaction.find("security"))
            amount = Decimal(int(transaction.findtext("shares"))) / SHARES_FACTOR
            shares[security] = shares.get(security, Decimal(0)) + _sign(SHARE_SIGNS, transaction) * amount

    cash_accounts = []
    for account in accounts:
        balance = sum(
            _sign(CASH_SIGNS, transaction) * int(transaction.findtext("amount"))
            for transaction in _transactions(account, reached)
        )
        cash_accounts.append(_cash_account(account, balance))

    _check_complete(client, reached)
    holdings = [_holding(security, count) for security, count in shares.items() if count != 0]
    return PortfolioFile(holdings=holdings, cash_accounts=cash_accounts)


def _cash_account(account, balance):
    name = account.findtext("name")
    currency = account.findtext("currencyCode")
    if balance != 0 and currency != CURRENCY:
        raise PortfolioFileError(f"{name} is in {currency}. Only euro is supported.")
    return CashAccount(id=account.findtext("uuid"), name=name, balance_cents=balance)


def _check_complete(client, reached):
    """Every transaction in the file has to belong to something, or the
    value would quietly leave it out."""
    for element in client.iter("*"):
        is_transaction = all(element.find(tag) is not None for tag in ("date", "type", "amount"))
        if is_transaction and "reference" not in element.attrib and element not in reached:
            raise PortfolioFileError(NOT_UNDERSTOOD)


def _holding(security, count):
    name = security.findtext("name")
    if count < 0:
        raise PortfolioFileError(f"{name} ends up with fewer than no shares, so this file can't be right.")
    currency = security.findtext("currencyCode")
    if currency != CURRENCY:
        raise PortfolioFileError(f"{name} is priced in {currency}. Only euro is supported.")
    latest = _latest_price(security)
    if latest is None:
        raise PortfolioFileError(f"{name} has no price. Update the prices in Portfolio Performance first.")
    price_date, price = latest
    try:
        cents = (count * price * 100).quantize(Decimal(1), rounding=ROUND_HALF_UP)
    except InvalidOperation as error:
        raise PortfolioFileError(NOT_UNDERSTOOD) from error
    return Holding(name=name, price_date=price_date, value_cents=int(cents))


def _latest_price(security):
    """(date, price) of the newest of the price history and `latest`."""
    entries = list(security.iterfind("prices/price"))
    latest = security.find("latest")
    if latest is not None and latest.get("t"):
        entries.append(latest)
    if not entries:
        return None
    newest = max(entries, key=lambda entry: entry.get("t"))
    return date.fromisoformat(newest.get("t")), Decimal(int(newest.get("v"))) / PRICE_FACTOR
