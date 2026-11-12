"""Which build this is. CI bakes the values into the image as environment
variables (see the Dockerfile); a build without them reports `dev`.
See openspec/specs/app-version."""

import os


def version_info():
    return {
        "version": os.environ.get("APP_VERSION") or "dev",
        "commit": os.environ.get("APP_COMMIT") or None,
        "built": os.environ.get("APP_BUILT") or None,
    }


def version_line(component):
    info = version_info()
    return (
        f"reconciled-{component} version {info['version']} "
        f"(commit {info['commit'] or '-'}, built {info['built'] or '-'})"
    )
