"""The MCP endpoint: the stateless subset of the Streamable HTTP transport,
answering one JSON-RPC message per POST with plain JSON. No event streams, no
sessions - see design.md D1 of mcp-read-access, and issue #79 for when to
reconsider."""

import json
import logging
from urllib.parse import urlsplit

from django.conf import settings
from django.db import transaction
from django.http import HttpResponse, JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt

from budgets import utils
from core.version import version_info
from households.context import household_context
from transactions.loans import sync_loans

from . import tools  # noqa: F401 - registers the tools
from .registry import TOOLS, ToolError
from .tokens import mark_used, usable_token

log = logging.getLogger(__name__)

# Newest first. initialize answers with the client's version when it is
# here, otherwise with the first one.
PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26"]

SERVER_NAME = "reconciled"
INSTRUCTIONS = (
    "Read-only access to one household's budget in Reconciled: accounts, categories, monthly and yearly "
    "budgets, transactions, the overview, spending report, forecast, year plan, net worth, loans and tabs. "
    "Amounts are euro strings such as '-42.50 EUR', where a minus means money going out. Months are YYYY-MM "
    "and default to the current month. Nothing can be changed through these tools."
)

PARSE_ERROR = -32700
INVALID_REQUEST = -32600
METHOD_NOT_FOUND = -32601
INVALID_PARAMS = -32602


def _error(message_id, code, message, status=200):
    return JsonResponse({"jsonrpc": "2.0", "id": message_id, "error": {"code": code, "message": message}}, status=status)


def _result(message_id, result):
    return JsonResponse({"jsonrpc": "2.0", "id": message_id, "result": result})


def _unauthorized(detail):
    response = JsonResponse({"error": "unauthorized", "detail": detail}, status=401)
    response["WWW-Authenticate"] = 'Bearer realm="reconciled"'
    return response


def _origin_allowed(request):
    """MCP clients send no Origin; a browser always does. Only the app's own
    origins may - this blocks DNS rebinding from another site's page."""
    origin = request.headers.get("Origin")
    if not origin:
        return True
    if origin in settings.CORS_ALLOWED_ORIGINS or origin in settings.CSRF_TRUSTED_ORIGINS:
        return True
    return urlsplit(origin).netloc == request.get_host()


def _bearer(request):
    header = request.headers.get("Authorization", "")
    scheme, _, secret = header.partition(" ")
    return secret.strip() if scheme.lower() == "bearer" else None


def _initialize(params):
    wanted = params.get("protocolVersion") if isinstance(params, dict) else None
    return {
        "protocolVersion": wanted if wanted in PROTOCOL_VERSIONS else PROTOCOL_VERSIONS[0],
        "capabilities": {"tools": {"listChanged": False}},
        "serverInfo": {"name": SERVER_NAME, "title": "Reconciled", "version": version_info()["version"]},
        "instructions": INSTRUCTIONS,
    }


def _text_result(payload, is_error=False):
    if is_error:
        return {"content": [{"type": "text", "text": payload}], "isError": True}
    return {
        "content": [{"type": "text", "text": json.dumps(payload, ensure_ascii=False, default=str)}],
        "structuredContent": payload if isinstance(payload, dict) else {"items": payload},
        "isError": False,
    }


def _call_tool(message_id, params):
    if not isinstance(params, dict) or not isinstance(params.get("name"), str):
        return _error(message_id, INVALID_PARAMS, "tools/call needs a tool name.")
    tool = TOOLS.get(params["name"])
    if tool is None:
        return _error(message_id, INVALID_PARAMS, f"Unknown tool: {params['name']}")
    try:
        arguments = tool.parse(params.get("arguments"))
    except ToolError as e:
        return _result(message_id, _text_result(str(e), is_error=True))
    try:
        # The catch-up every page load does, so tools and pages agree - see
        # design.md D4. Then the read itself.
        with transaction.atomic():
            sync_loans(utils.today())
        payload = tool.handler(**arguments)
    except ToolError as e:
        return _result(message_id, _text_result(str(e), is_error=True))
    except Exception:
        log.exception("MCP tool %s failed", tool.name)
        return _result(message_id, _text_result("Something went wrong reading this. Try again.", is_error=True))
    return _result(message_id, _text_result(payload))


def _handle(message):
    if not isinstance(message, dict) or message.get("jsonrpc") != "2.0" or not isinstance(message.get("method"), str):
        return _error(message.get("id") if isinstance(message, dict) else None, INVALID_REQUEST, "Not a JSON-RPC 2.0 request.", 400)
    method = message["method"]
    if "id" not in message:
        # A notification (notifications/initialized and the like): nothing to answer.
        return HttpResponse(status=202)
    message_id = message["id"]
    params = message.get("params") or {}
    if method == "initialize":
        return _result(message_id, _initialize(params))
    if method == "ping":
        return _result(message_id, {})
    if method == "tools/list":
        return _result(message_id, {"tools": [t.listing() for t in TOOLS.values()]})
    if method == "tools/call":
        return _call_tool(message_id, params)
    return _error(message_id, METHOD_NOT_FOUND, f"Method not found: {method}")


@csrf_exempt
def mcp(request):
    if not _origin_allowed(request):
        return JsonResponse({"error": "forbidden", "detail": "Requests from this origin are not allowed."}, status=403)
    if request.method != "POST":
        response = HttpResponse(status=405)
        response["Allow"] = "POST"
        return response

    secret = _bearer(request)
    if not secret:
        return _unauthorized("Send a Reconciled access token as a bearer token.")
    token = usable_token(secret)
    if token is None:
        return _unauthorized("This access token doesn't work. Create a new one in Settings.")

    sent_version = request.headers.get("MCP-Protocol-Version")
    if sent_version and sent_version not in PROTOCOL_VERSIONS:
        return _error(None, INVALID_REQUEST, f"Unsupported MCP-Protocol-Version: {sent_version}", 400)

    try:
        message = json.loads(request.body)
    except (ValueError, UnicodeDecodeError):
        return _error(None, PARSE_ERROR, "The request body isn't valid JSON.", 400)
    if isinstance(message, list):
        return _error(None, INVALID_REQUEST, "Send one JSON-RPC message per request.", 400)

    mark_used(token, timezone.now())
    with household_context(token.household):
        return _handle(message)
