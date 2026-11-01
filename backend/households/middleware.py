from .context import bind, unbind


class HouseholdMiddleware:
    """Starts each request with no household and puts back what was there
    afterwards, so a reused worker thread can't carry one into the next
    request."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        token = bind(None)
        try:
            return self.get_response(request)
        finally:
            unbind(token)
