import json
import time
from types import SimpleNamespace
from unittest import mock

import anthropic
import httpx2
from django.test import SimpleTestCase, override_settings

from .ai import ClaudeGuesser, Guess, PayeeQuestion, get_guesser

CATEGORIES = [(1, "Eating out"), (2, "Groceries"), (3, "Transport / Train")]
REQUEST = httpx2.Request("POST", "https://api.anthropic.com/v1/messages")


def question(key="p1", payee="Bistro Lumiere 12", notes="team lunch", amount_cents=-4800):
    return PayeeQuestion(key=key, payee=payee, notes=notes, amount_cents=amount_cents, direction="out")


def answer(*guesses, stop_reason="end_turn"):
    text = json.dumps({"guesses": [{"key": k, "category_id": c, "reason": r} for k, c, r in guesses]})
    return SimpleNamespace(stop_reason=stop_reason, content=[SimpleNamespace(type="text", text=text)])


def status_error(cls, status_code):
    return cls("error", response=httpx2.Response(status_code, request=REQUEST), body=None)


class GetGuesserTests(SimpleTestCase):
    @override_settings(ANTHROPIC_API_KEY="", AI_CATEGORIZATION_ENABLED=True)
    def test_none_without_a_key(self):
        self.assertIsNone(get_guesser())

    @override_settings(ANTHROPIC_API_KEY="sk-ant-test", AI_CATEGORIZATION_ENABLED=False)
    def test_none_when_disabled(self):
        self.assertIsNone(get_guesser())

    @override_settings(ANTHROPIC_API_KEY="sk-ant-test", AI_CATEGORIZATION_ENABLED=True)
    def test_claude_with_a_key(self):
        self.assertIsInstance(get_guesser(), ClaudeGuesser)


@override_settings(AI_CATEGORIZATION_MODEL="claude-haiku-5-5")
class ClaudeGuesserTests(SimpleTestCase):
    def setUp(self):
        self.client = mock.Mock()
        self.create = self.client.with_options.return_value.messages.create
        self.guesser = ClaudeGuesser(client=self.client)

    def guess(self, questions, deadline_in=20):
        return self.guesser.guess(questions, CATEGORIES, time.monotonic() + deadline_in)

    def test_request_shape(self):
        self.create.return_value = answer(("p1", 1, "Restaurant name"))
        self.guess([question(), question(key="p2", payee="NMBS", notes="", amount_cents=2550)])

        timeout = self.client.with_options.call_args.kwargs["timeout"]
        self.assertTrue(0 < timeout <= 20)
        kwargs = self.create.call_args.kwargs
        self.assertEqual(kwargs["model"], "claude-haiku-5-5")
        self.assertEqual(kwargs["output_config"]["effort"], "low")
        self.assertNotIn("temperature", kwargs)
        item = kwargs["output_config"]["format"]["schema"]["properties"]["guesses"]["items"]
        self.assertEqual(item["properties"]["key"]["enum"], ["p1", "p2"])
        self.assertEqual(item["properties"]["category_id"]["anyOf"][0]["enum"], [1, 2, 3])
        self.assertFalse(item["additionalProperties"])

        payload = json.loads(kwargs["messages"][0]["content"])
        self.assertEqual(payload["categories"][2], {"id": 3, "name": "Transport / Train"})
        self.assertEqual(
            payload["payees"][0],
            {"key": "p1", "payee": "Bistro Lumiere 12", "notes": "team lunch", "amount": "48.00", "direction": "out"},
        )
        self.assertEqual(payload["payees"][1]["amount"], "25.50")
        # The system prompt is fixed text: payee data only ever goes in the
        # JSON payload.
        self.assertNotIn("Bistro", kwargs["system"])

    def test_payload_has_only_the_allowed_fields(self):
        self.create.return_value = answer()
        self.guess([question()])
        payload = json.loads(self.create.call_args.kwargs["messages"][0]["content"])
        self.assertEqual(set(payload), {"categories", "payees"})
        self.assertEqual(set(payload["payees"][0]), {"key", "payee", "notes", "amount", "direction"})

    def test_answers_parse_into_guesses(self):
        self.create.return_value = answer(("p1", 1, "Restaurant name"), ("p2", None, ""))
        guesses, status = self.guess([question(), question(key="p2", payee="PAYPAL *X123")])
        self.assertEqual(status, "ok")
        self.assertEqual(guesses, {"p1": Guess(1, "Restaurant name"), "p2": Guess(None, "")})

    def test_unknown_keys_and_ids_are_dropped(self):
        self.create.return_value = answer(("p1", 99, "Made up"), ("zz", 1, "Wrong key"), ("p2", True, "Bool id"))
        guesses, status = self.guess([question(), question(key="p2")])
        self.assertEqual(guesses, {})
        self.assertEqual(status, "ok")

    def test_unhelpful_reasons_are_stored_empty(self):
        self.create.return_value = answer(
            ("p1", 1, "  "), ("p2", 1, "eating out."), ("p3", 3, "Train"), ("p4", 2, "x" * 200)
        )
        guesses, _ = self.guess([question(key=k) for k in ("p1", "p2", "p3", "p4")])
        self.assertEqual(guesses["p1"].reason, "")
        self.assertEqual(guesses["p2"].reason, "")
        self.assertEqual(guesses["p3"].reason, "")
        self.assertEqual(len(guesses["p4"].reason), 80)

    def test_unusable_answers_fail(self):
        unusable = {
            "refusal": answer(("p1", 1, "x"), stop_reason="refusal"),
            "max_tokens": answer(("p1", 1, "x"), stop_reason="max_tokens"),
            "bad JSON": SimpleNamespace(stop_reason="end_turn", content=[SimpleNamespace(type="text", text="{nope")]),
            "no text": SimpleNamespace(stop_reason="end_turn", content=[]),
            "wrong shape": SimpleNamespace(stop_reason="end_turn", content=[SimpleNamespace(type="text", text="[]")]),
        }
        for name, response in unusable.items():
            with self.subTest(name):
                self.create.return_value = response
                with self.assertLogs("transactions.ai", "WARNING"):
                    self.assertEqual(self.guess([question()]), ({}, "failed"))

    def test_api_errors_fail(self):
        errors = {
            "timeout": anthropic.APITimeoutError(request=REQUEST),
            "connection": anthropic.APIConnectionError(request=REQUEST),
            "rate limit": status_error(anthropic.RateLimitError, 429),
            "overloaded": status_error(anthropic.InternalServerError, 529),
        }
        for name, error in errors.items():
            with self.subTest(name):
                self.create.side_effect = error
                with self.assertLogs("transactions.ai", "WARNING"):
                    self.assertEqual(self.guess([question()]), ({}, "failed"))

    def test_an_unexpected_error_fails_without_raising(self):
        self.create.side_effect = RuntimeError("boom")
        with self.assertLogs("transactions.ai", "ERROR"):
            self.assertEqual(self.guess([question()]), ({}, "failed"))

    def test_rejected_key_stops_further_chunks(self):
        for cls, code in ((anthropic.AuthenticationError, 401), (anthropic.PermissionDeniedError, 403)):
            with self.subTest(code):
                self.create.reset_mock()
                self.create.side_effect = status_error(cls, code)
                with self.assertLogs("transactions.ai", "ERROR") as logs:
                    result = self.guess([question(key=f"p{i}") for i in range(150)])
                self.assertEqual(result, ({}, "key_rejected"))
                self.assertEqual(self.create.call_count, 1)
                self.assertIn("ANTHROPIC_API_KEY", logs.output[0])

    def test_large_runs_are_chunked_and_a_failed_chunk_keeps_the_others(self):
        questions = [question(key=f"p{i}") for i in range(150)]
        self.create.side_effect = [
            anthropic.APITimeoutError(request=REQUEST),
            answer(*[(f"p{i}", 2, "Supermarket") for i in range(100, 150)]),
        ]
        with self.assertLogs("transactions.ai", "WARNING"):
            guesses, status = self.guess(questions)
        self.assertEqual(self.create.call_count, 2)
        first, second = (c.kwargs["output_config"]["format"]["schema"] for c in self.create.call_args_list)
        self.assertEqual(len(first["properties"]["guesses"]["items"]["properties"]["key"]["enum"]), 100)
        self.assertEqual(len(second["properties"]["guesses"]["items"]["properties"]["key"]["enum"]), 50)
        self.assertEqual(status, "failed")
        self.assertEqual(set(guesses), {f"p{i}" for i in range(100, 150)})

    def test_no_chunks_are_sent_past_the_deadline(self):
        questions = [question(key=f"p{i}") for i in range(150)]
        clock = iter([100.0, 125.0])
        self.create.return_value = answer(("p0", 1, "Restaurant name"))
        with mock.patch("transactions.ai.time.monotonic", lambda: next(clock)):
            with self.assertLogs("transactions.ai", "WARNING"):
                guesses, status = self.guesser.guess(questions, CATEGORIES, deadline=120.0)
        self.assertEqual(self.create.call_count, 1)
        self.assertEqual(self.client.with_options.call_args.kwargs["timeout"], 20.0)
        self.assertEqual(status, "failed")
        self.assertEqual(guesses, {"p0": Guess(1, "Restaurant name")})
