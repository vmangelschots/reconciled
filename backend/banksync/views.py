"""Settings' bank connections. See openspec/specs/bank-sync."""

import secrets
from datetime import date, timedelta

from django.db import transaction as db_transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import Account
from transactions.models import Transaction

from . import client
from .models import BankAccountLink, BankConnection
from .sync import sync_all

DEFAULT_COUNTRY = "BE"
# Where the bank sends the user back to; must be registered with Enable
# Banking as a redirect URL for the application.
REDIRECT_PATH = "/settings/banks"
SESSION_KEY = "bank_authorization"
NOT_SET_UP = "Bank sync isn't set up."


def _default_start_date(account):
    latest = Transaction.objects.ledger_rows().filter(account=account).order_by("-date").first()
    return (latest.date + timedelta(days=1)) if latest else timezone.localdate()


def _link_row(link):
    return {
        "id": link.id,
        "bank_name": link.bank_name,
        "account_id": link.account_id,
        "account_name": link.account.name,
        "start_date": link.start_date,
        "last_synced_at": link.last_synced_at,
        "last_added_count": link.last_added_count,
        "last_error": link.last_error,
    }


def _connection_row(connection, links_by_hash):
    return {
        "id": connection.id,
        "bank_name": connection.bank_name,
        "valid_until": connection.valid_until,
        "ended": connection.ended,
        "accounts": [
            {
                "uid": a["uid"],
                "name": a["name"],
                "iban": a["iban"],
                "currency": a["currency"],
                "link": _link_row(links_by_hash[a["hash"]]) if a["hash"] in links_by_hash else None,
            }
            for a in connection.accounts
        ],
    }


def _session_accounts(session):
    return [
        {
            "uid": a["uid"],
            "hash": a["identification_hash"],
            "name": a.get("name") or "",
            "iban": (a.get("account_id") or {}).get("iban") or "",
            "currency": a.get("currency") or "",
        }
        for a in session.get("accounts") or []
    ]


def _psu_headers(request):
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR", "")
    return {
        "Psu-Ip-Address": forwarded.split(",")[0].strip() or request.META.get("REMOTE_ADDR", ""),
        "Psu-User-Agent": request.META.get("HTTP_USER_AGENT", ""),
    }


class StatusView(APIView):
    def get(self, request):
        if not client.enabled():
            return Response({"enabled": False})
        links = list(BankAccountLink.objects.select_related("account"))
        links_by_hash = {link.account_hash: link for link in links}
        accounts = Account.objects.filter(archived=False).order_by("name")
        linked = {link.account_id for link in links}
        return Response(
            {
                "enabled": True,
                "connections": [_connection_row(c, links_by_hash) for c in BankConnection.objects.all()],
                # After a restore: links with no connection yet.
                "waiting_links": [_link_row(link) for link in links if link.connection_id is None],
                "accounts": [
                    {"id": a.id, "name": a.name, "default_start_date": _default_start_date(a)}
                    for a in accounts
                    if a.id not in linked
                ],
            }
        )


class BanksView(APIView):
    def get(self, request):
        if not client.enabled():
            return Response({"detail": NOT_SET_UP}, status=400)
        country = request.query_params.get("country", DEFAULT_COUNTRY)
        try:
            banks = client.list_banks(country)
        except client.BankError as e:
            return Response({"detail": str(e)}, status=502)
        names = sorted(b["name"] for b in banks if "personal" in (b.get("psu_types") or []))
        return Response({"country": country, "banks": names})


class AuthorizeView(APIView):
    def post(self, request):
        if not client.enabled():
            return Response({"detail": NOT_SET_UP}, status=400)
        bank_name = request.data.get("bank_name")
        country = request.data.get("country", DEFAULT_COUNTRY)
        origin = request.headers.get("Origin")
        if not bank_name or not origin:
            return Response({"detail": "Pick a bank."}, status=400)
        state = secrets.token_urlsafe(32)
        try:
            seconds = client.maximum_consent_seconds(bank_name, country)
            valid_until = timezone.now() + timedelta(seconds=seconds or 90 * 86400)
            url = client.start_authorization(bank_name, country, origin + REDIRECT_PATH, state, valid_until)
        except client.BankError as e:
            return Response({"detail": str(e)}, status=502)
        request.session[SESSION_KEY] = {
            "state": state,
            "bank_name": bank_name,
            "country": country,
            "valid_until": valid_until.isoformat(),
        }
        return Response({"url": url})


@db_transaction.atomic
def _store_session(bank_name, country, session, requested_until):
    """A connection for what the bank gave access to. A reconnection replaces
    the connection it shares an account with, and every link to an account
    the bank offers again picks up its new session."""
    accounts = _session_accounts(session)
    uids = {a["hash"]: a["uid"] for a in accounts}
    previous = [
        c
        for c in BankConnection.objects.filter(bank_name=bank_name)
        if {a["hash"] for a in c.accounts} & set(uids)
    ]
    valid_until = (session.get("access") or {}).get("valid_until") or requested_until
    connection = BankConnection.objects.create(
        bank_name=bank_name,
        bank_country=country,
        session_id=session["session_id"],
        valid_until=valid_until,
        accounts=accounts,
    )
    for link in BankAccountLink.objects.filter(account_hash__in=uids):
        link.connection = connection
        link.account_uid = uids[link.account_hash]
        link.save(update_fields=["connection", "account_uid"])
    for old in previous:
        old.delete()
    return connection


class CompleteView(APIView):
    def post(self, request):
        if not client.enabled():
            return Response({"detail": NOT_SET_UP}, status=400)
        started = request.session.pop(SESSION_KEY, None)
        if not started or not secrets.compare_digest(started["state"], str(request.data.get("state", ""))):
            return Response({"detail": "This bank authorization can't be finished. Please try again."}, status=400)
        code = request.data.get("code")
        if not code:
            return Response({"detail": "The bank sent nothing back. Please try again."}, status=400)
        try:
            session = client.create_session(code)
        except client.BankError as e:
            return Response({"detail": str(e)}, status=502)
        connection = _store_session(started["bank_name"], started["country"], session, started["valid_until"])
        return Response({"id": connection.id, "bank_name": connection.bank_name}, status=201)


class RunView(APIView):
    def post(self, request):
        if not client.enabled():
            return Response({"detail": NOT_SET_UP}, status=400)
        added = sync_all(_psu_headers(request))
        if added is None:
            return Response({"running": True, "added": 0})
        return Response({"running": False, "added": added})


class ConnectionView(APIView):
    def delete(self, request, pk):
        connection = get_object_or_404(BankConnection, pk=pk)
        try:
            client.end_session(connection.session_id)
        except client.BankError:
            # Already gone there, or unreachable: consent ends by itself.
            pass
        connection.links.all().delete()
        connection.delete()
        return Response(status=204)


class LinksView(APIView):
    def post(self, request):
        connection = get_object_or_404(BankConnection, pk=request.data.get("connection_id"))
        offered = next((a for a in connection.accounts if a["uid"] == request.data.get("uid")), None)
        if offered is None:
            return Response({"detail": "This bank account isn't part of the connection."}, status=400)
        account = Account.objects.filter(pk=request.data.get("account_id"), archived=False).first()
        if account is None:
            return Response({"detail": "Pick an active account."}, status=400)
        if BankAccountLink.objects.filter(account=account).exists():
            return Response({"detail": f"{account.name} is already linked."}, status=400)
        if BankAccountLink.objects.filter(account_hash=offered["hash"]).exists():
            return Response({"detail": "This bank account is already linked."}, status=400)
        start_date = _default_start_date(account)
        if request.data.get("start_date"):
            try:
                start_date = date.fromisoformat(request.data["start_date"])
            except ValueError:
                return Response({"detail": "Enter a valid start date."}, status=400)
        link = BankAccountLink.objects.create(
            connection=connection,
            bank_name=connection.bank_name,
            account_hash=offered["hash"],
            account_uid=offered["uid"],
            account=account,
            start_date=start_date,
        )
        return Response(_link_row(link), status=201)


class LinkView(APIView):
    def delete(self, request, pk):
        get_object_or_404(BankAccountLink, pk=pk).delete()
        return Response(status=204)
