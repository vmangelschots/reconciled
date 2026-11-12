---
name: run-reconciled
description: Run, start, launch or screenshot the reconciled app locally (Django API + Vite React frontend) with a seeded demo household, and drive it in headless Chrome at desktop or phone width to check a page or a change in the running app.
---

# Run reconciled

Reconciled is a Django REST API (`backend/`, port 8000) plus a Vite React
frontend (`frontend/`, port 5173) on Postgres. You drive it with
`driver.mjs`. It logs in as a seeded demo user, opens the pages you name in
headless Chrome, saves full-page screenshots and reports console errors and
sideways scrolling. All paths below are relative to the repo root.

The demo data goes into its own database, `reconciled_demo`, in a throwaway
Postgres container on port 55432. It never touches the dev database.

## Prerequisites

You need Docker, Python 3, Node and Chrome at `/usr/bin/google-chrome-stable`.
Playwright only runs the system Chrome; it doesn't download a browser.

```bash
docker start reconciled-test-db >/dev/null 2>&1 || docker run -d --name reconciled-test-db -e POSTGRES_USER=reconciled -e POSTGRES_PASSWORD=reconciled -e POSTGRES_DB=reconciled -p 55432:5432 postgres:16-alpine >/dev/null
timeout 60 bash -c 'until docker exec reconciled-test-db pg_isready -h 127.0.0.1 -U reconciled -q; do sleep 1; done'
test -x /tmp/reconciled-venv/bin/python || (python3 -m venv /tmp/reconciled-venv && /tmp/reconciled-venv/bin/pip install -q -r backend/requirements.txt)
test -d /tmp/reconciled-pw/node_modules/playwright-core || npm i -q --prefix /tmp/reconciled-pw playwright-core@1.57.0
```

`frontend/node_modules` must exist (`npm ci` in `frontend/`).

## Demo database

This drops and recreates `reconciled_demo` with the current branch's
migrations. Then it seeds user `demo` / `demo-pass-123` with:
- Crelan and Revolut;
- savings;
- Bills: one paid, one late, one to come;
- a monthly and a yearly budget, and a yearly target;
- a loan paid from Crelan.

Dates follow today.

```bash
cd backend
export DJANGO_SECRET_KEY=local-dev DB_HOST=localhost DB_PORT=55432 DB_NAME=reconciled_demo DB_USER=reconciled DB_PASSWORD=reconciled
docker exec reconciled-test-db psql -U reconciled -d reconciled -c "DROP DATABASE IF EXISTS reconciled_demo" -c "CREATE DATABASE reconciled_demo"
/tmp/reconciled-venv/bin/python manage.py migrate -v 0
/tmp/reconciled-venv/bin/python manage.py shell < ../.claude/skills/run-reconciled/seed.py
```

## Start the servers

Run each one in the background with the same env vars as above:

```bash
cd backend && export DJANGO_SECRET_KEY=local-dev DB_HOST=localhost DB_PORT=55432 DB_NAME=reconciled_demo DB_USER=reconciled DB_PASSWORD=reconciled && exec /tmp/reconciled-venv/bin/python manage.py runserver 8000 > /tmp/reconciled-backend.log 2>&1
cd frontend && exec npm run dev -- --port 5173 --strictPort > /tmp/reconciled-frontend.log 2>&1
```

Wait until both answer. A `401` from `/api/auth/me/` means the API is up.

```bash
timeout 60 bash -c 'until curl -sf http://localhost:5173 >/dev/null && curl -s -o /dev/null http://localhost:8000/api/auth/me/; do sleep 1; done'
```

## Drive it (agent path)

```bash
node .claude/skills/run-reconciled/driver.mjs / /budgets /forecast
node .claude/skills/run-reconciled/driver.mjs --out /tmp/reconciled-shots/phone --phone /
```

It prints one line per page (`/forecast -> /tmp/reconciled-shots/desktop-forecast.png`),
adds `(scrolls sideways!)` when a page is wider than the viewport, and ends
with `console errors: none` or the list of errors. Look at the screenshots
with the Read tool:
- the desktop viewport is 1366×900;
- `--phone` is 390×844.

For a flow, such as filling a sheet and saving it, copy the driver's
login block into a scratch script and add Playwright steps. The labels the
app uses work with `getByLabel` and `getByRole`, for example:

```js
page.getByRole("button", { name: "Sign in" })
```

## Stop

```bash
lsof -ti:8000 -sTCP:LISTEN | xargs -r kill; lsof -ti:5173 -sTCP:LISTEN | xargs -r kill
docker exec reconciled-test-db psql -U reconciled -d reconciled -c "DROP DATABASE reconciled_demo"
```

## Tests

The checks CI runs. The backend tests use the same container and create
their own test database.

```bash
cd backend && DJANGO_SECRET_KEY=local-test DB_HOST=localhost DB_PORT=55432 DB_NAME=reconciled DB_USER=reconciled DB_PASSWORD=reconciled /tmp/reconciled-venv/bin/python manage.py test --parallel 1
cd frontend && npx vitest run && npm run lint && npm run build
```

## Gotchas

- **Waiting for a fresh Postgres container.** It runs a temporary server
  for first-time setup and then restarts. `pg_isready` on the socket says
  ready during setup, and the next `psql` fails with `the database system
  is shutting down`. Wait on TCP (`pg_isready -h 127.0.0.1`), which only the
  real server answers.
- **`manage.py test --parallel 4`** fails with `TypeError: cannot pickle
  'traceback' object` when a test errors, which hides the real failure. Run
  `--parallel 1` to see it.
- **Date order follows the browser locale.** Headless Chrome defaults to
  en-US ("Nov 25"). The driver sets `en-GB` so pages read like the app's
  own tests ("25 Nov"). Match text with a regex when it contains a date.
- **Two `401 Unauthorized` console errors on every run** come from the
  login page's own "am I signed in?" check. The driver filters them out.
- **Phone screenshots.** The bottom tab bar is fixed, so in a full-page
  phone screenshot it sits in the middle of the page, over whatever was
  there at the first screen's bottom. That isn't a layout bug.
- **The Claude in Chrome extension** is often not connected in this
  environment. Use the driver rather than waiting for it.
- **The demo DB follows the current branch.** Recreate it, using the Demo
  database section, after switching branches with different migrations.

## Troubleshooting

- `psql: ... the database system is shutting down`: see the first gotcha;
  wait on `-h 127.0.0.1`.
- `ModuleNotFoundError: No module named 'django'`: the system Python has no
  packages. Use `/tmp/reconciled-venv/bin/python`, as above.
- `Cannot find module 'playwright-core'`: run the `npm i --prefix
  /tmp/reconciled-pw ...` line, or set `PW_PREFIX` to where it is installed.
