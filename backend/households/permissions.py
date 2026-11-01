from django.contrib.auth import logout
from rest_framework import status
from rest_framework.exceptions import APIException, NotAuthenticated
from rest_framework.permissions import IsAuthenticated

from .context import bind
from .membership import active_household

HOUSEHOLD_HEADER = "X-Household"


class HouseholdChanged(APIException):
    """This page loaded another household; the client reloads."""

    status_code = status.HTTP_409_CONFLICT
    default_detail = "Your household changed. Reloading."
    default_code = "household_changed"


class HasHousehold(IsAuthenticated):
    """The default permission: a signed-in user, in a household. Binds that
    household for the request (HouseholdMiddleware unbinds it).

    A permission class and not middleware, because only DRF knows the user:
    middleware can't see force_authenticate.

    A page tells which household it loaded in X-Household, so a tab left on
    another household can't change this one. No header, no check: scripts and
    API tests don't need one. A view that decides the household itself, like
    switching, sets `checks_household_header = False`."""

    def has_permission(self, request, view):
        if not super().has_permission(request, view):
            return False
        household = active_household(request, request.user)
        if household is None:
            if hasattr(request._request, "session"):
                logout(request._request)
            raise NotAuthenticated()
        bind(household)
        sent = request.headers.get(HOUSEHOLD_HEADER)
        if sent and getattr(view, "checks_household_header", True) and sent != str(household.pk):
            raise HouseholdChanged()
        return True
