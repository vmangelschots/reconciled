import os
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import RequestFactory, SimpleTestCase
from households.testing import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from core.origin import public_origin
from core.version import version_info, version_line


class HealthCheckTests(TestCase):
    def test_health_returns_200_without_auth(self):
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok", "version": "dev"})

    @patch.dict(os.environ, {"APP_VERSION": "a1b2c3d"})
    def test_health_reports_the_version(self):
        self.assertEqual(self.client.get("/health").json()["version"], "a1b2c3d")


@patch.dict(os.environ, {"APP_VERSION": "", "APP_COMMIT": "", "APP_BUILT": ""})
class VersionInfoTests(SimpleTestCase):
    def test_unset_is_dev(self):
        self.assertEqual(version_info(), {"version": "dev", "commit": None, "built": None})

    @patch.dict(
        os.environ,
        {"APP_VERSION": "1.4.0", "APP_COMMIT": "a1b2c3d", "APP_BUILT": "2026-11-12T14:03:00Z"},
    )
    def test_reads_the_build_values(self):
        self.assertEqual(
            version_info(),
            {"version": "1.4.0", "commit": "a1b2c3d", "built": "2026-11-12T14:03:00Z"},
        )
        self.assertEqual(
            version_line("backend"),
            "reconciled-backend version 1.4.0 (commit a1b2c3d, built 2026-11-12T14:03:00Z)",
        )


class VersionViewTests(TestCase):
    def test_requires_sign_in(self):
        self.assertEqual(APIClient().get("/api/version/").status_code, 401)

    @patch.dict(
        os.environ,
        {"APP_VERSION": "a1b2c3d", "APP_COMMIT": "a1b2c3d", "APP_BUILT": "2026-11-12T14:03:00Z"},
    )
    def test_signed_in_user_without_household_gets_the_version(self):
        client = APIClient()
        client.force_authenticate(get_user_model().objects.create_user(username="v", password="x"))
        response = client.get("/api/version/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {"version": "a1b2c3d", "commit": "a1b2c3d", "built": "2026-11-12T14:03:00Z"},
        )


class CsrfViewTests(TestCase):
    def test_csrf_endpoint_returns_200_and_sets_cookie(self):
        # Regression test: @ensure_csrf_cookie was once applied directly to
        # the instance method instead of via method_decorator, which passed
        # `self` where Django expected the real request and crashed with a
        # 500 on every call. DRF's APIClient (used by the other tests in
        # this file) disables CSRF enforcement by default, so this endpoint
        # was never actually exercised by the rest of the suite - use
        # Django's plain test Client here instead, which does.
        response = self.client.get(reverse("auth-csrf"))
        self.assertEqual(response.status_code, 200)
        self.assertIn("csrftoken", response.cookies)


class AuthTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.username = "budgeter"
        self.password = "a-strong-test-password"
        get_user_model().objects.create_user(
            username=self.username, password=self.password
        )

    def test_protected_route_requires_auth(self):
        response = self.client.get(reverse("auth-me"))
        self.assertEqual(response.status_code, 401)

    def test_login_then_protected_route_succeeds(self):
        login_response = self.client.post(
            reverse("auth-login"),
            {"username": self.username, "password": self.password},
            format="json",
        )
        self.assertEqual(login_response.status_code, 200)
        self.assertEqual(login_response.json(), {"username": self.username})

        me_response = self.client.get(reverse("auth-me"))
        self.assertEqual(me_response.status_code, 200)
        self.assertEqual(me_response.json()["username"], self.username)

    def test_login_with_wrong_password_is_rejected(self):
        response = self.client.post(
            reverse("auth-login"),
            {"username": self.username, "password": "wrong"},
            format="json",
        )
        self.assertEqual(response.status_code, 401)

    def test_logout_ends_the_session(self):
        self.client.post(
            reverse("auth-login"),
            {"username": self.username, "password": self.password},
            format="json",
        )
        self.client.post(reverse("auth-logout"))
        response = self.client.get(reverse("auth-me"))
        self.assertEqual(response.status_code, 401)


class PublicOriginTests(SimpleTestCase):
    def origin(self, **headers):
        return public_origin(RequestFactory().get("/", headers=headers))

    def test_the_origin_header_wins(self):
        origin = self.origin(Origin="https://budget.example.org", Referer="https://other.example.org/page")
        self.assertEqual(origin, "https://budget.example.org")

    def test_falls_back_on_the_page_it_came_from(self):
        self.assertEqual(self.origin(Referer="https://budget.example.org/page?x=1"), "https://budget.example.org")

    def test_falls_back_on_the_request_itself(self):
        self.assertEqual(self.origin(), "http://testserver")
