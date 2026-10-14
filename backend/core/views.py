from django.contrib.auth import authenticate, login as django_login, logout as django_logout
from django.http import JsonResponse
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView


@require_GET
def health(request):
    """Unauthenticated liveness check for container healthchecks."""
    return JsonResponse({"status": "ok"})


class CsrfView(APIView):
    """GET this first to receive a csrftoken cookie before logging in."""

    permission_classes = [AllowAny]
    authentication_classes = []

    @ensure_csrf_cookie
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
        django_login(request, user)
        return Response({"username": user.username})


class LogoutView(APIView):
    def post(self, request):
        django_logout(request)
        return Response(status=204)


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({"username": request.user.username})
