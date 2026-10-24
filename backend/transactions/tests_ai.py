import json
import time
from types import SimpleNamespace
from unittest import mock

import httpx2
import openai
from django.test import SimpleTestCase, override_settings

from .ai import OpenAIGuesser, Guess, PayeeQuestion, get_guesser

CATEGORIES = [(1, "Eating out"), (2, "Groceries"), (3, "Transport / Train")]
REQUEST = httpx2.Request("POST", "https://api.openai.com/v1/responses")


def question(key="p1", payee="Bistro Lumiere 12", notes="team lunch", amount_cents=-4800):
    return PayeeQuestion(key=key, payee=payee, notes=notes, amount_cents=amount_cents, direction="out")


def response(text, status="completed", content_type="output_text"):
    """A Responses API result: one message holding one content item.
    output_text is the SDK's own join of the message's output_text items."""
    part = SimpleNamespace(type=content_type, text=text)
    return SimpleNamespace(
        status=status,
        incomplete_details=SimpleNamespace(reason="max_output_tokens") if status == "incomplete" else None,
        output=[SimpleNamespace(type="message", content=[part])],
        output_text=text if content_type == "output_text" else "",
    )


def answer(*guesses, **kwargs):
    text = json.dumps({"guesses": [{"key": k, "category_id": c, "reason": r} for k, c, r in guesses]})
    return response(text, **kwargs)


def status_error(cls, status_code):
    return cls("error", response=httpx2.Response(status_code, request=REQUEST), body=None)


class GetGuesserTests(SimpleTestCase):
    @override_settings(OPENAI_API_KEY="", AI_CATEGORIZATION_ENABLED=True)
    def test_none_without_a_key(self):
        self.assertIsNone(get_guesser())

    @override_settings(OPENAI_API_KEY="sk-test", AI_CATEGORIZATION_ENABLED=False)
    def test_none_when_disabled(self):
        self.assertIsNone(get_guesser())

    @override_settings(OPENAI_API_KEY="sk-test", AI_CATEGORIZATION_ENABLED=True)
    def test_openai_with_a_key(self):
        self.assertIsInstance(get_guesser(), OpenAIGuesser)


@override_settings(AI_CATEGORIZATION_MODEL="gpt-6-luna")
class OpenAIGuesserTests(SimpleTestCase):
    def setUp(self):
        self.client = mock.Mock()
        self.create = self.client.with_options.return_value.responses.create
        self.guesser = OpenAIGuesser(client=self.client)

    def guess(self, questions, deadline_in=20):
        return self.guesser.guess(questions, CATEGORIES, time.monotonic() + deadline_in)

    def test_request_shape(self):
        self.create.return_value = answer(("p1", 1, "Restaurant name"))
        self.guess([question(), question(key="p2", payee="NMBS", notes="", amount_cents=2550)])

        timeout = self.client.with_options.call_args.kwargs["timeout"]
        self.assertTrue(0 < timeout <= 20)
        kwargs = self.create.call_args.kwargs
        self.assertEqual(kwargs["model"], "gpt-6-luna")
        self.assertEqual(kwargs["reasoning"], {"effort": "low"})
        self.assertNotIn("temperature", kwargs)
        output_format = kwargs["text"]["format"]
        self.assertEqual(output_format["type"], "json_schema")
        self.assertTrue(output_format["strict"])
        item = output_format["schema"]["properties"]["guesses"]["items"]
        self.assertEqual(item["properties"]["key"]["enum"], ["p1", "p2"])
        self.assertEqual(item["properties"]["category_id"]["enum"], [1, 2, 3, None])
        self.assertFalse(item["additionalProperties"])

        payload = json.loads(kwargs["input"])
        self.assertEqual(payload["categories"][2], {"id": 3, "name": "Transport / Train"})
        self.assertEqual(
            payload["payees"][0],
            {"key": "p1", "payee": "Bistro Lumiere 12", "notes": "team lunch", "amount": "48.00", "direction": "out"},
        )
        self.assertEqual(payload["payees"][1]["amount"], "25.50")
        # The system prompt is fixed text: payee data only ever goes in the
        # JSON payload.
        self.assertNotIn("Bistro", kwargs["instructions"])

    def test_payload_has_only_the_allowed_fields(self):
        self.create.return_value = answer()
        self.guess([question()])
        payload = json.loads(self.create.call_args.kwargs["input"])
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
            "refusal": response("I can't help with that.", content_type="refusal"),
            "incomplete": answer(("p1", 1, "x"), status="incomplete"),
            "bad JSON": response("{nope"),
            "no text": response(""),
            "wrong shape": response("[]"),
        }
        for name, result in unusable.items():
            with self.subTest(name):
                self.create.return_value = result
                with self.assertLogs("transactions.ai", "WARNING"):
                    self.assertEqual(self.guess([question()]), ({}, "failed"))

    def test_api_errors_fail(self):
        errors = {
            "timeout": openai.APITimeoutError(request=REQUEST),
            "connection": openai.APIConnectionError(request=REQUEST),
            "rate limit": status_error(openai.RateLimitError, 429),
            "server error": status_error(openai.InternalServerError, 500),
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
        for cls, code in ((openai.AuthenticationError, 401), (openai.PermissionDeniedError, 403)):
            with self.subTest(code):
                self.create.reset_mock()
                self.create.side_effect = status_error(cls, code)
                with self.assertLogs("transactions.ai", "ERROR") as logs:
                    result = self.guess([question(key=f"p{i}") for i in range(150)])
                self.assertEqual(result, ({}, "key_rejected"))
                self.assertEqual(self.create.call_count, 1)
                self.assertIn("OPENAI_API_KEY", logs.output[0])

    def test_large_runs_are_chunked_and_a_failed_chunk_keeps_the_others(self):
        questions = [question(key=f"p{i}") for i in range(150)]
        self.create.side_effect = [
            openai.APITimeoutError(request=REQUEST),
            answer(*[(f"p{i}", 2, "Supermarket") for i in range(100, 150)]),
        ]
        with self.assertLogs("transactions.ai", "WARNING"):
            guesses, status = self.guess(questions)
        self.assertEqual(self.create.call_count, 2)
        first, second = (c.kwargs["text"]["format"]["schema"] for c in self.create.call_args_list)
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
