from django.contrib.auth import authenticate, login as django_login, logout as django_logout
from django.http import JsonResponse
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from households.membership import SESSION_KEY, last_used
from households.views import NO_HOUSEHOLD, describe_user

from .version import version_info


@require_GET
def health(request):
    """Unauthenticated liveness check for container healthchecks. Also says
    which build is running, for checks from inside the cluster."""
    return JsonResponse({"status": "ok", "version": version_info()["version"]})


class VersionView(APIView):
    """The running backend build, for Settings → About. Any signed-in user,
    with or without a household."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(version_info())


class CsrfView(APIView):
    """GET this first to receive a csrftoken cookie before logging in."""

    permission_classes = [AllowAny]
    authentication_classes = []

    # @ensure_csrf_cookie is written for plain view functions, where the
    # request is the first positional argument. Applied directly to a
    # bound instance method like this one, `self` lands in that slot
    # instead, so it must go through method_decorator to rebind it
    # correctly against the real request.
    @method_decorator(ensure_csrf_cookie)
    def get(self, request):
        return Response({"detail": "CSRF cookie set"})


class LoginView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        username = request.data.get("username")
        password = request.data.get("password")
        user = authenticate(request, username=username, password=password)
        if user is None:
            return Response({"detail": "Invalid credentials"}, status=401)
        membership = last_used(user)
        if membership is None:
            return Response({"detail": NO_HOUSEHOLD}, status=403)
        django_login(request, user)
        request.session[SESSION_KEY] = membership.household_id
        return Response({"username": user.username})


class LogoutView(APIView):
    def post(self, request):
        django_logout(request)
        return Response(status=204)


class MeView(APIView):
    # This is how a page learns its household.
    checks_household_header = False

    def get(self, request):
        return Response(describe_user(request))
