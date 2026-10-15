from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient


class HealthCheckTests(TestCase):
    def test_health_returns_200_without_auth(self):
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})


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
        self.assertEqual(me_response.json(), {"username": self.username})

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
