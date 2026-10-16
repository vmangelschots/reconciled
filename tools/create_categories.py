#!/usr/bin/env python3
"""Create the category tree on a reconciled instance through its API.

    python3 tools/create_categories.py https://reconcile.mangelschots.org <username>
    python3 tools/create_categories.py https://reconcile.mangelschots.org <username> --dry-run

Asks for the password interactively (it is never stored or printed).
Safe to run more than once: a category that already exists with the same
name under the same parent is skipped. Standard library only.
"""

import argparse
import getpass
import json
import os
import sys
import urllib.error
import urllib.request
from http.cookiejar import CookieJar

CATEGORIES = {
    "Food": ["Groceries", "Takeaway", "Restaurant"],
    "Home & household": [
        "Electricity",
        "Water",
        "Garden",
        "Chickens",
        "Jacuzzi",
        "Home Maintenance & Improvement",
    ],
    "Pets & insurance": [
        "Cats",
        "Basic Insurance",
        "Mortgage Insurance",
        "Health Insurance",
        "Legal Insurance",
    ],
    "Clothing & household supplies": ["Clothing", "Cleaning", "Household Goods"],
    "Healthcare": ["Pharmacy", "Doctor", "Physiotherapy", "Speech Therapy", "Other Healthcare"],
    "Transport": ["Car Maintenance", "Car Energy", "EV Charging Service"],
    "Sports & activities": ["Sport Equipment", "Sport Membership", "Courses", "Camps"],
    "Leisure, education & communication": [
        "TV & Streaming",
        "Travel",
        "Other Leisure",
        "Education",
        "Communication",
    ],
    "Interest & banking": ["Mortgage Interest", "Car Loan Interest", "Bank Fees"],
    "Personal & fallback": ["Spending Money", "Other", "Uncategorized"],
}

# The app already shows "no category" as Uncategorized everywhere; a real
# category with that name would appear as a second, separate
# "Personal & fallback / Uncategorized". Empty this set to create it anyway.
SKIP = {"Uncategorized"}


class Api:
    def __init__(self, base_url):
        self.base = base_url.rstrip("/")
        self.cookies = CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.cookies))

    def _csrf(self):
        return next((c.value for c in self.cookies if c.name == "csrftoken"), "")

    def request(self, method, path, body=None):
        headers = {"Content-Type": "application/json", "Accept": "application/json"}
        if method not in ("GET", "HEAD"):
            # Django checks the CSRF token and, over HTTPS, the Origin.
            headers["X-CSRFToken"] = self._csrf()
            headers["Origin"] = self.base
            headers["Referer"] = self.base + "/"
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(self.base + path, data=data, headers=headers, method=method)
        try:
            with self.opener.open(req) as resp:
                raw = resp.read()
                return json.loads(raw) if raw else None
        except urllib.error.HTTPError as e:
            detail = e.read().decode(errors="replace")[:300]
            raise SystemExit(f"{method} {path} failed: HTTP {e.code} {detail}") from None


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("base_url", help="e.g. https://reconcile.mangelschots.org")
    parser.add_argument("username")
    parser.add_argument("--dry-run", action="store_true", help="log in and show what would be created, change nothing")
    args = parser.parse_args()

    # RECONCILED_PASSWORD is only for unattended use; normally you're prompted.
    password = os.environ.get("RECONCILED_PASSWORD") or getpass.getpass(f"Password for {args.username}: ")

    api = Api(args.base_url)
    api.request("GET", "/api/auth/csrf/")
    api.request("POST", "/api/auth/login/", {"username": args.username, "password": password})

    existing = api.request("GET", "/api/categories/")
    by_key = {(c["name"], c.get("parent")): c for c in existing}

    created = skipped = 0
    for parent_name, children in CATEGORIES.items():
        parent = by_key.get((parent_name, None))
        if parent:
            print(f"  = {parent_name}")
            skipped += 1
        elif args.dry_run:
            print(f"  + {parent_name}")
            created += 1
        else:
            parent = api.request("POST", "/api/categories/", {"name": parent_name, "parent": None})
            print(f"  + {parent_name}")
            created += 1

        for child_name in children:
            if child_name in SKIP:
                print(f"  - {parent_name} / {child_name} (skipped, see SKIP)")
                continue
            label = f"{parent_name} / {child_name}"
            if parent and (child_name, parent["id"]) in by_key:
                print(f"  = {label}")
                skipped += 1
            elif args.dry_run:
                print(f"  + {label}")
                created += 1
            else:
                api.request("POST", "/api/categories/", {"name": child_name, "parent": parent["id"]})
                print(f"  + {label}")
                created += 1

    verb = "Would create" if args.dry_run else "Created"
    print(f"\n{verb} {created}, already there {skipped}.")
    api.request("POST", "/api/auth/logout/")


if __name__ == "__main__":
    sys.exit(main())
