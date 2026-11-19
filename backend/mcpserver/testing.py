"""A test base that calls tools through the endpoint, with a real token, in
the test class's household (households.testing)."""

import json

from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from households.testing import TestCase

from .models import AccessToken


class ToolTestCase(TestCase):
    def setUp(self):
        super().setUp()
        self.user = get_user_model().objects.create_user("ann", password="correct horse battery")
        self.token, self.secret = AccessToken.issue(self.user, self.default_household, "Tests")
        self.api = APIClient()
        self.api.force_login(self.user)

    def _call(self, name, arguments):
        message = {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": name, "arguments": arguments}}
        response = self.client.post(
            "/mcp", json.dumps(message), content_type="application/json", HTTP_AUTHORIZATION=f"Bearer {self.secret}"
        )
        self.assertEqual(response.status_code, 200, response.content)
        return response.json()["result"]

    def tool(self, name, **arguments):
        result = self._call(name, arguments)
        self.assertFalse(result["isError"], result["content"][0]["text"])
        return json.loads(result["content"][0]["text"])

    def tool_error(self, name, **arguments):
        result = self._call(name, arguments)
        self.assertTrue(result["isError"], "expected an error")
        return result["content"][0]["text"]
