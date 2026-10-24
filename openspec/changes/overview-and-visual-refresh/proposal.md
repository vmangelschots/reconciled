# Proposal

## Why

The app works but feels plain, generic and a bit clunky, and there is no
place that answers "how are we doing this month?". Every page has the
same shape: a small title, a stack of identical cards and a bare table.
Setup forms sit above the data the page is opened for. Money uses
default type with almost no colour or hierarchy. The balance appears only
in an Accounts table cell, and budget status only on the Budgets page.

This change lays a visual foundation the rest of the app can build on,
and replaces the Dashboard with a real overview. A UI review of every
page shaped it; redesigning the Transactions, Budgets, Forecast and
Import flows follows as a separate change.

## What Changes

- **Visual foundation ("quiet ledger"):**
  - The Inter font, bundled with the app so a self-hosted install makes
    no request to Google, with tabular figures.
  - A type scale with a display size for money and uppercase labels.
  - A deep-teal accent, in place of the default indigo.
  - Cards clearly lighter than the page, bordered rather than shadowed.
  - A "positive" green for money in, used by the charts too: money in is
    green and money out a neutral grey, instead of blue and orange.
  - The same tokens redefined for dark mode, tuned so the teal accent
    and the green stay apart.
- **Shared building blocks:**
  - `PageHeader`: title, an optional month switcher and the primary
    action.
  - `Panel`: a titled section with an optional "View all →" link.
  - `Stat`: a label, a big figure and a detail line.
  - `ProgressBar`.
  - `MonthSwitcher`: "‹ October 2026 ›", which can't go past the current
    month.
  - `ListRow`, `EmptyState` and loading skeletons.
  - Panels whose tables run edge to edge and that carry header actions
    such as "Show as table".
- **Navigation:**
  - On desktop, a left sidebar in two groups: Overview, Transactions,
    Review (with its count), Budgets and Forecast, then Import and
    Accounts. The footer holds the overview account's balance, the theme
    toggle and sign out.
  - On a phone, a bottom tab bar (Overview, Transactions, Review,
    Budgets, More), with the rest under "More". On a tablet the tab
    bar's items stay centred in a phone-width row, and notifications
    appear above the bar.
  - "Dashboard" is renamed "Overview".
- **Every page gets the new look, without changing any flow:**
  - a `PageHeader`;
  - panels instead of plain cards;
  - amounts right-aligned in tabular figures, with money in shown as
    "+€…" in the positive colour;
  - short dates ("23 Oct") instead of ISO dates.

  Budgets also gets the shared month switcher, with the month kept in
  its address (`?month=`) so links can open a given month. That fixes
  the page picking the month in UTC instead of local time.
- **Overview** (the home page), for one account and one month:
  - **Balance:** the account's balance today, and its net change in the
    month.
  - **Budget:**
    - spending in budgeted categories against the total of their limits,
      with a progress bar and what's left or how much over;
    - spending outside budgets and uncategorized spending, shown below
      it, so an unbudgeted car repair never makes the budget look over;
    - for the current month, the room per day and a marker for how much
      of the month has passed.
  - **Needs attention:**
    - guesses to review;
    - uncategorized transactions (with this month's amount);
    - categories over their limit, then, in the current month, those at
      85% or more that are ahead of the month's pace;
    - a reminder when the last import is more than a week old.

    Each item links to where it is fixed. Category items open Budgets
    on the right month.
  - **Forecast:** the lowest projected balance in the next 90 days with
    its date (red below zero), and the next recurring transaction.
  - **Open tabs:** the existing card, made compact.
  - **Recent transactions:** the account's last 8.
  - **Charts:** spending per category and the 12-month in vs out chart,
    both following the page's month.

  When there is more than one active account, a picker in the header
  chooses the account, and the browser remembers it. The sidebar's
  balance shows the same account. The header also has an Import action.
  For a past month, balance and forecast are labelled "Today" and
  "From today".
- **One overview endpoint** (`GET /api/reports/overview/?month=&account=`)
  returns all the figures in one request. It counts the account's own
  money in and out, leaving out transfers and tabs.

Not in scope (follow-up change):
- Redesigning the Transactions flow: the toolbar, rows grouped by day,
  an add/edit sheet and row action menus.
- Splitting the Budgets page into a status view and a "Manage
  categories" sheet, with a popover for editing limits.
- Putting the Forecast chart first and the import result hand-off.
- A "primary account" setting stored on the server.

## Capabilities

### New Capabilities
- `overview`: the home page that sums up one account's month and what
  needs attention, and the endpoint behind it.

### Modified Capabilities
- `ui-shell`: sidebar and phone tab bar navigation instead of the top
  bar and hamburger, a shared month switcher, how amounts and dates are
  shown everywhere, and the bundled font.
- `dashboard`: the in vs out and category spending charts move into the
  overview and follow its month, instead of each having its own.
- `repayment-tabs`: the open tabs card sits in the overview's side
  column instead of first on the page.
- `budgets`: the Budgets page uses the shared month switcher and keeps
  its month in the address.

## Impact

- **Frontend:**
  - `index.css` tokens.
  - A new `components/ui` set: `PageHeader`, `Panel`, `Stat`,
    `ProgressBar`, `MonthSwitcher`.
  - `Layout` rewritten with the sidebar and the tab bar.
  - Every page's header, panels and tables restyled.
  - White text hard-coded on the accent replaced with the new
    on-accent colour.
  - `DashboardPage` replaced by `OverviewPage`.
  - Existing tests updated for the new navigation and labels.
- **Backend:** `reports/views.py` gets `OverviewView`, reusing the budget
  summary, categorize, forecast and tabs code.
- **Dependencies:** `@fontsource-variable/inter` (the bundled font).
