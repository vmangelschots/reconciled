"""The Enable Banking API, and nothing else of it. See
openspec/specs/bank-sync."""

import json
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

import jwt

from .credentials import NoEncryptionKey
from .models import BankCredentials

API_URL = "https://api.enablebanking.com"
TIMEOUT_SECONDS = 20
# Enable Banking accepts tokens of up to 24 hours; each run makes its own.
TOKEN_SECONDS = 3600


class BankError(Exception):
    """A request failed; the message is safe to show the user."""


class CredentialsRejected(BankError):
    """Enable Banking doesn't accept the household's key."""


class Unreachable(BankError):
    """Enable Banking didn't answer."""


class SessionEnded(BankError):
    """The bank session is over and needs a new authorization."""


class RateLimited(BankError):
    """The bank refuses more fetches for now."""


def _credentials():
    return BankCredentials.objects.first()


def enabled():
    """Whether the current household can talk to Enable Banking at all."""
    found = _credentials()
    if found is None:
        return False
    try:
        return bool(found.private_key)
    except NoEncryptionKey:
        return False


def _token():
    found = _credentials()
    if found is None:
        raise CredentialsRejected("Bank sync isn't set up.")
    now = int(time.time())
    return jwt.encode(
        {
            "iss": "enablebanking.com",
            "aud": "api.enablebanking.com",
            "iat": now,
            "exp": now + TOKEN_SECONDS,
        },
        found.private_key,
        algorithm="RS256",
        headers={"kid": found.app_id},
    )


def _error(status, content):
    try:
        data = json.loads(content)
    except ValueError:
        data = {}
    code = str(data.get("error") or "") if isinstance(data, dict) else ""
    if status == 429:
        return RateLimited("The bank is limiting requests. The next sync will try again.")
    if status == 401 and "SESSION" in code:
        return SessionEnded("The bank session has ended.")
    if status == 401:
        return CredentialsRejected("Enable Banking didn't accept the key.")
    return BankError(f"Enable Banking answered with an error ({status} {code}).".replace(" )", ")"))


def _call(method, path, *, body=None, query=None, headers=None):
    url = API_URL + path + (f"?{urlencode(query)}" if query else "")
    request = Request(
        url,
        data=json.dumps(body).encode() if body is not None else None,
        method=method,
        headers={"Authorization": f"Bearer {_token()}", "Content-Type": "application/json", **(headers or {})},
    )
    try:
        with urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            content = response.read()
    except HTTPError as e:
        raise _error(e.code, e.read()) from None
    except (URLError, TimeoutError):
        raise Unreachable("Enable Banking couldn't be reached.") from None
    return json.loads(content) if content else {}


def application():
    """What Enable Banking knows about the household's application."""
    return _call("GET", "/application")


def list_banks(country):
    return _call("GET", "/aspsps", query={"country": country})["aspsps"]


def start_authorization(bank_name, country, redirect_url, state, valid_until):
    """The address to send the user to."""
    started = _call(
        "POST",
        "/auth",
        body={
            "access": {"valid_until": valid_until.isoformat()},
            "aspsp": {"name": bank_name, "country": country},
            "state": state,
            "redirect_url": redirect_url,
            "psu_type": "personal",
        },
    )
    return started["url"]


def maximum_consent_seconds(bank_name, country):
    for bank in list_banks(country):
        if bank["name"] == bank_name:
            return bank.get("maximum_consent_validity")
    raise BankError(f"{bank_name} isn't available in {country}.")


def create_session(code):
    return _call("POST", "/sessions", body={"code": code})


def end_session(session_id):
    _call("DELETE", f"/sessions/{session_id}")


def fetch_transactions(account_uid, date_from, psu_headers=None):
    """Every line from date_from on, across all pages. PSU headers mark the
    fetch as made by the user, which background limits don't count."""
    lines = []
    continuation_key = None
    while True:
        query = {"date_from": date_from.isoformat()}
        if continuation_key:
            query["continuation_key"] = continuation_key
        page = _call("GET", f"/accounts/{account_uid}/transactions", query=query, headers=psu_headers)
        lines += page.get("transactions") or []
        continuation_key = page.get("continuation_key")
        if not continuation_key:
            return lines
