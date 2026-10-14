from rest_framework.authentication import SessionAuthentication


class SessionAuthentication401(SessionAuthentication):
    """Session auth that returns 401 (not DRF's default 403) when no
    session is present, so the frontend can treat 401 uniformly as
    "not logged in, send me to the login screen" instead of having to
    special-case 403 from a session-based API.
    """

    def authenticate_header(self, request):
        return "Session"
