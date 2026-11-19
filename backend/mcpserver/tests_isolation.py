"""mcp-server, "One household per request": every tool, called with a token
for household A, never shows household B's rows - B is seeded with a row of
everything by households.tests_isolation."""

import json

from django.contrib.auth import get_user_model

from households.tests_isolation import MARKER, Case

from .models import AccessToken
from .registry import TOOLS

# Arguments that make each tool read as much as it can. A new tool must be
# added here, or the test below fails.
ARGUMENTS = {
    "list_accounts": {"include_archived": True},
    "list_categories": {},
    "search_transactions": {"limit": 200},
    "get_transaction": None,  # by id: see test_a_foreign_id_answers_like_a_missing_one
    "get_budget": {"month": "2026-01"},
    "get_overview": {"month": "2026-01"},
    "get_spending_report": {"start": "2025-12", "end": "2026-11"},
    "get_forecast": {"days": 365},
    "get_year_plan": {"year": 2027},
    "get_net_worth_history": {"months": 600},
    "list_loans": {},
    "list_tabs": {},
}


class ToolIsolationTests(Case):
    def setUp(self):
        super().setUp()
        user = get_user_model().objects.get(username="attacker")
        _, self.secret = AccessToken.issue(user, self.a, "Attacker")

    def call(self, name, arguments):
        message = {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": name, "arguments": arguments}}
        response = self.client.post(
            "/mcp", json.dumps(message), content_type="application/json", HTTP_AUTHORIZATION=f"Bearer {self.secret}"
        )
        self.assertEqual(response.status_code, 200)
        return response.content.decode()

    def test_every_tool_is_covered(self):
        self.assertEqual(set(TOOLS), set(ARGUMENTS), "Add the new tool to ARGUMENTS")

    def test_no_tool_shows_the_other_household(self):
        for name, arguments in ARGUMENTS.items():
            if arguments is None:
                continue
            with self.subTest(tool=name):
                body = self.call(name, arguments)
                self.assertFalse(json.loads(body)["result"]["isError"], body)
                self.assertNotIn(MARKER, body)
        self.assertUntouched("MCP tools")

    def test_a_foreign_id_answers_like_a_missing_one(self):
        foreign = self.call("get_transaction", {"id": self.theirs["txn"].pk})
        missing_id = 10**9
        missing = self.call("get_transaction", {"id": missing_id})
        self.assertNotIn(MARKER, foreign)
        self.assertEqual(foreign.replace(str(self.theirs["txn"].pk), "N"), missing.replace(str(missing_id), "N"))

    def test_a_foreign_category_in_search(self):
        body = self.call("search_transactions", {"category_id": self.theirs["category"].pk})
        self.assertIn("no category with id", body)
        self.assertNotIn(MARKER, body)
