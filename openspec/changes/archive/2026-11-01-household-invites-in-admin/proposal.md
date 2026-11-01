# Proposal

## Why

Reconciled is invite-only on purpose, but nothing in the app says so: the login
page has no hint of how to get a login, and starting a household takes a shell on
the server (`manage.py create_household`). Django admin can already add a
household, but that household gets no invite link, so nobody can join it without
a login that already exists.

## What Changes

- Adding a household in Django admin creates its first invite and shows the link
  to the operator, once.
- A Django admin action creates a new invite link for an existing household, for
  when the first link expired, was lost or was used.
- The login page says logins come from invite links and who to ask.
- Open sign-up stays out: a login is still only created through an invite or by
  the operator. `manage.py create_household` stays as it is.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `households`: the operator can create a household and invite links from Django
  admin, and the sign-in page explains how to get a login.

## Impact

- `backend/households/admin.py`: invite creation on add, and the new admin action.
- `backend/banksync/views.py`: the logic that works out the app's public origin
  moves somewhere both it and the admin can use.
- `frontend/src/pages/LoginPage.jsx`: the hint.
- `k8s/README.md`: the Households section gains the admin route.
- No migrations, new API endpoints or dependencies.
