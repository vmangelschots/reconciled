"""The MCP transport: JSON-RPC methods, version negotiation, auth, Origin and
argument checks. See openspec/specs/mcp-server."""

import json
from datetime import date, timedelta
from unittest import mock

from django.test import TestCase, override_settings
from django.utils import timezone

from households.models import Household, Membership

from . import registry
from .models import AccessToken
from .registry import Arg, ToolError
from .server import PROTOCOL_VERSIONS
from .tests_tokens import member, signed_in


class Base(TestCase):
    def setUp(self):
        self.peeters = Household.objects.create(name="The Peeters household")
        self.ann = member("ann", self.peeters)
        self.token, self.secret = AccessToken.issue(self.ann, self.peeters, "Laptop")
        self.calls = []

        def echo(month=None, count=None):
            self.calls.append((month, count))
            if count == 13:
                raise ToolError("Thirteen is unlucky.")
            if count == 666:
                raise RuntimeError("boom")
            return {"month": month.isoformat() if month else None, "count": count}

        tools = {}
        patcher = mock.patch.dict(registry.TOOLS, tools, clear=True)
        patcher.start()
        self.addCleanup(patcher.stop)
        registry.tool(
            "echo",
            "Echo",
            "Says back what it got.",
            [Arg("month", "month", "A month."), Arg("count", "integer", "A count.", minimum=0, maximum=1000)],
        )(echo)

    def post(self, body, secret=None, **headers):
        secret = self.secret if secret is None else secret
        if secret:
            headers["HTTP_AUTHORIZATION"] = f"Bearer {secret}"
        data = body if isinstance(body, (str, bytes)) else json.dumps(body)
        return self.client.post("/mcp", data, content_type="application/json", **headers)

    def rpc(self, method, params=None, message_id=1, **kwargs):
        message = {"jsonrpc": "2.0", "id": message_id, "method": method}
        if params is not None:
            message["params"] = params
        return self.post(message, **kwargs)

    def call(self, name, arguments=None):
        return self.rpc("tools/call", {"name": name, "arguments": arguments or {}}).json()


class MethodTests(Base):
    def test_initialize(self):
        body = self.rpc("initialize", {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "t"}}).json()
        result = body["result"]
        self.assertEqual(body["id"], 1)
        self.assertEqual(result["protocolVersion"], "2025-06-18")
        self.assertEqual(result["serverInfo"]["name"], "reconciled")
        self.assertIn("tools", result["capabilities"])
        self.assertNotIn("Mcp-Session-Id", self.rpc("initialize", {"protocolVersion": "2025-06-18"}).headers)

    def test_an_unknown_version_gets_the_newest(self):
        result = self.rpc("initialize", {"protocolVersion": "1999-01-01"}).json()["result"]
        self.assertEqual(result["protocolVersion"], PROTOCOL_VERSIONS[0])

    def test_ping(self):
        self.assertEqual(self.rpc("ping", message_id="a").json(), {"jsonrpc": "2.0", "id": "a", "result": {}})

    def test_a_notification_gets_202(self):
        response = self.post({"jsonrpc": "2.0", "method": "notifications/initialized"})
        self.assertEqual(response.status_code, 202)
        self.assertEqual(response.content, b"")

    def test_unknown_method(self):
        self.assertEqual(self.rpc("resources/list").json()["error"]["code"], -32601)

    def test_malformed_json(self):
        response = self.post("{nope")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["error"]["code"], -32700)

    def test_not_json_rpc(self):
        self.assertEqual(self.post({"method": "ping", "id": 1}).json()["error"]["code"], -32600)
        self.assertEqual(self.post([{"jsonrpc": "2.0", "id": 1, "method": "ping"}]).status_code, 400)

    def test_no_event_stream(self):
        response = self.client.get("/mcp", HTTP_AUTHORIZATION=f"Bearer {self.secret}", HTTP_ACCEPT="text/event-stream")
        self.assertEqual(response.status_code, 405)

    def test_an_unsupported_protocol_header(self):
        response = self.rpc("ping", HTTP_MCP_PROTOCOL_VERSION="1999-01-01")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.rpc("ping", HTTP_MCP_PROTOCOL_VERSION=PROTOCOL_VERSIONS[0]).status_code, 200)


class ToolCallTests(Base):
    def test_list_marks_every_tool_read_only(self):
        tools = self.rpc("tools/list").json()["result"]["tools"]
        self.assertEqual([t["name"] for t in tools], ["echo"])
        echo = tools[0]
        self.assertTrue(echo["annotations"]["readOnlyHint"])
        self.assertEqual(echo["inputSchema"]["properties"]["month"]["pattern"], r"^\d{4}-\d{2}$")
        self.assertEqual(echo["inputSchema"]["required"], [])

    def test_a_call(self):
        result = self.call("echo", {"month": "2026-11", "count": 3})["result"]
        self.assertFalse(result["isError"])
        self.assertEqual(json.loads(result["content"][0]["text"]), {"month": "2026-11-01", "count": 3})
        self.assertEqual(result["structuredContent"], {"month": "2026-11-01", "count": 3})

    def test_a_bad_month_reads_nothing(self):
        result = self.call("echo", {"month": "2026-13"})["result"]
        self.assertTrue(result["isError"])
        self.assertIn("valid month written as YYYY-MM", result["content"][0]["text"])
        self.assertEqual(self.calls, [])

    def test_bad_arguments(self):
        for arguments, message in [
            ({"count": "three"}, "whole number"),
            ({"count": -1}, "at least 0"),
            ({"count": True}, "whole number"),
            ({"colour": "red"}, "Unknown argument 'colour'"),
        ]:
            with self.subTest(arguments=arguments):
                result = self.call("echo", arguments)["result"]
                self.assertTrue(result["isError"])
                self.assertIn(message, result["content"][0]["text"])
        self.assertEqual(self.calls, [])

    def test_unknown_tool(self):
        error = self.call("delete_everything")["error"]
        self.assertEqual(error["code"], -32602)
        self.assertIn("Unknown tool", error["message"])

    def test_tool_errors_are_results(self):
        result = self.call("echo", {"count": 13})["result"]
        self.assertEqual((result["isError"], result["content"][0]["text"]), (True, "Thirteen is unlucky."))

    def test_a_crash_says_little(self):
        with self.assertLogs("mcpserver.server", "ERROR"):
            result = self.call("echo", {"count": 666})["result"]
        self.assertTrue(result["isError"])
        self.assertNotIn("boom", result["content"][0]["text"])

    def test_loans_catch_up_first(self):
        with mock.patch("mcpserver.server.sync_loans") as sync:
            self.call("echo")
        sync.assert_called_once()


class AuthTests(Base):
    def test_no_token(self):
        response = self.rpc("ping", secret="")
        self.assertEqual(response.status_code, 401)
        self.assertTrue(response["WWW-Authenticate"].startswith("Bearer"))

    def test_unknown_or_revoked(self):
        self.assertEqual(self.rpc("ping", secret="rcn_nope").status_code, 401)
        self.token.revoked_at = timezone.now()
        self.token.save()
        self.assertEqual(self.rpc("ping").status_code, 401)

    def test_a_session_isnt_enough(self):
        self.client.force_login(self.ann)
        self.assertEqual(self.rpc("ping", secret="").status_code, 401)

    def test_left_the_household(self):
        Membership.objects.filter(user=self.ann).delete()
        self.assertEqual(self.rpc("ping").status_code, 401)

    def test_last_used_once_a_minute(self):
        self.rpc("ping")
        self.token.refresh_from_db()
        first = self.token.last_used_at
        self.assertIsNotNone(first)
        self.rpc("ping")
        self.token.refresh_from_db()
        self.assertEqual(self.token.last_used_at, first)

    def test_last_used_shows_in_settings(self):
        self.rpc("ping")
        listed = signed_in(self.ann).get("/api/mcp-tokens/").json()
        self.assertIsNotNone(listed[0]["last_used_at"])

    def test_the_tool_runs_in_the_tokens_household(self):
        from households.context import current_household

        seen = []
        registry.TOOLS["echo"].handler = lambda **kw: seen.append(current_household()) or {}
        self.call("echo")
        self.assertEqual(seen, [self.peeters])


@override_settings(CORS_ALLOWED_ORIGINS=["http://localhost:5173"], CSRF_TRUSTED_ORIGINS=["http://localhost:5173"])
class OriginTests(Base):
    def test_another_site(self):
        response = self.rpc("ping", HTTP_ORIGIN="https://evil.example")
        self.assertEqual(response.status_code, 403)

    def test_another_site_without_a_token_is_still_forbidden(self):
        self.assertEqual(self.rpc("ping", secret="", HTTP_ORIGIN="https://evil.example").status_code, 403)

    def test_own_origins(self):
        self.assertEqual(self.rpc("ping", HTTP_ORIGIN="http://localhost:5173").status_code, 200)
        self.assertEqual(self.rpc("ping", HTTP_ORIGIN="http://testserver").status_code, 200)
        self.assertEqual(self.rpc("ping").status_code, 200)
