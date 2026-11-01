from urllib.parse import urlsplit


def public_origin(request):
    """The address the person is on. Behind the ingress Django can't see that
    it's https, so trust what the browser sent. A same-origin GET has no Origin
    header, so fall back on the page it came from."""
    origin = request.headers.get("Origin")
    if origin:
        return origin
    page = urlsplit(request.headers.get("Referer", ""))
    return f"{page.scheme}://{page.netloc}" if page.netloc else request.build_absolute_uri("/").rstrip("/")
