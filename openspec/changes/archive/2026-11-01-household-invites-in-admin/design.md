# Design

## Context

`HouseholdAdmin` lets the operator add a household and its members, but creates no
invite. `Invite.issue(household, created_by)` is the one way to make an invite, and
its token exists only at that moment. Django admin is on the app's own hostname
(`/admin` through the ingress), and the login that `bootstrap_user` creates is a
superuser, so the operator can already reach it.

Settings has no `SECURE_PROXY_SSL_HEADER`, so `request.build_absolute_uri` gives
`http://` behind the TLS ingress. `banksync.views.redirect_url` already solves this
by reading the `Origin` header, then `Referer`.

## Goals / Non-Goals

**Goals:**

- The operator never needs a shell to bring in a new household.
- Links from admin behave exactly like links made in Settings.

**Non-Goals:**

- Registering `Invite` in admin. Members already see and revoke pending invites in
  Settings.
- Removing or changing `manage.py create_household`.
- Any self-service sign-up.

## Decisions

**Issue the first invite in `save_model`, only when adding.** This covers Save,
Save and add another, and Save and continue editing with one code path. Editing a
household's name never creates an invite. The alternative, overriding
`response_add`, would need each button handled.

**A new link for an existing household is an admin action limited to one
selection.** Actions need no custom URL or template, and come with CSRF protection
and a permission check (`@admin.action(permissions=["change"])`). Limiting it to one
household keeps the messages small, see the next decision. A per-household button
would need a custom view and template for no real gain with a few households.

**Show the link with `messages.success`.** After the redirect, the default
`FallbackStorage` holds a message in the operator's cookie until it is displayed,
and only spills into the session table past about 2 KB. One household's message is
far below that, so the token is never stored server-side, which keeps to "shall not
store the link in readable form". A dedicated result page would avoid the cookie
but needs a template, and refreshing it would resubmit the form and create a second
household.

**Plain text, not an anchor.** The operator's browser holds a signed-in session on
this hostname, so following the link would make the page offer to add the operator
to the household. They copy it and send it instead. Django escapes the message, so
a household name can't inject markup.

**Move the origin logic into `core`.** Extract the `Origin`/`Referer`/
`build_absolute_uri` fallback from `redirect_url` into a shared helper such as
`core.urls.public_origin(request)`, keeping `redirect_url`'s behavior. `households`
depends on the helper rather than importing from `banksync`. Adding
`SECURE_PROXY_SSL_HEADER` was the alternative, but it changes behavior across the
app and is unsafe if a deployment isn't behind a proxy that sets the header.

**`created_by` is the operator.** Admin invites record `request.user`, so Settings
shows "From <username>" and there is a record of who made the link. The command
keeps passing nothing.

**Static hint on the login page.** Plain muted text under the form, no link. The
wording covers both a household member and the operator, because a first member
has nobody in their household to ask.

## Risks / Trade-offs

- [The local dev admin runs on the backend port] → A link built there points at
  `:8000`, not the Vite server. This only affects development; change the port by
  hand.
- [The token sits in a browser cookie until the next page] → It is the operator's
  own browser, and the cookie is cleared when the message is shown.
- [A staff login with change rights can invite itself into any household] → Such a
  login can already add itself as a member through the inline, so this adds no new
  reach.
