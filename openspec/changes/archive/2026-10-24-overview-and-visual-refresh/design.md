# Design

## Context

- Every page builds its own layout from `Card`/`CardHeader`/`CardTitle`
  (`components/ui/Card.jsx`, `p-6`), a `text-xl` `h1` and `Table`.
- `Layout.jsx` renders a top bar with seven `NavLink`s, collapsed to a
  hamburger below 768px.
- `index.css` holds the tokens:
  - `:root` and `.dark` define them, and `@theme` exposes them as Tailwind
    utilities;
  - the font is `system-ui`;
  - the accent is indigo `#4f46e5`;
  - `--background` and `--surface` are almost the same colour.
- White text on the accent is hard-coded in six places:
  - `Button` default;
  - the `Select` item highlight;
  - the `Layout` nav link and review pill;
  - the Budgets kind toggle;
  - the Import `file:` button.
- Hover colours: `outline`/`ghost` buttons hover with `bg-surface`, while
  rows hover with `bg-background`.
- The charts read `--chart-series-1` (blue) and `--chart-series-2`
  (orange) through `var()`, so a token change restyles them in both
  themes without re-rendering.
- The Toast viewport is `fixed bottom-0`, and `index.html` has no
  `viewport-fit=cover`.
- The overview's data already exists across several endpoints:
  - `accounts` provides `current_balance_cents`;
  - `budgets/summary` gives limits and spending per category, with N+1
    queries;
  - `reports/category-spending` and `reports/cash-flow`;
  - review count and `categorize.uncategorized()`;
  - `forecasting.utils.generate_forecast(account, horizon_days, today)`;
  - `tabs`;
  - `ImportSession` (status `committed`, `updated_at`).
- Pages that need one account pick `accounts[0]`. Budgets keeps its month
  in state, built with `toISOString()` (UTC).

## Goals / Non-Goals

**Goals:**
- One set of tokens and a few primitives every page uses, so the
  follow-up flow redesigns only rearrange content.
- An overview that loads its figures in one request, with figures that
  can't contradict the Budgets page.
- Existing behaviour and tests keep working. Only labels and navigation
  queries change.

**Non-Goals:**
- No new flows on Transactions, Budgets (other than its month switcher),
  Forecast or Import.
- No server-side "primary account".
- No new chart types.

## Decisions

### Tokens: same names, new values, three additions

The existing names stay, so every `bg-surface`/`text-ink-*` picks up
the new look.

| Token | Light | Dark |
|---|---|---|
| background | `#f4f3ef` | `#0c0c0b` |
| surface | `#ffffff` | `#161615` |
| surface-2 (new) | `#f6f5f1` | `#1f1f1d` |
| accent | `#0f766e` | `#26b5a5` |
| on-accent (new) | `#ffffff` | `#04201e` |
| positive (new) | `#15803d` | `#6cc785` |
| success | `var(--positive)` | `var(--positive)` |
| chart-series-1 | `var(--accent)` | `var(--accent)` |
| chart-series-2 | `#b5b3ab` | `#55534e` |

- **The dark accent and positive colour are pulled apart**, so teal and
  green don't merge into one mint. The accent is never used for
  amounts.
- **The in vs out chart** points "in" at `--positive` and "out" at
  `--chart-series-2` (neutral), which matches the tables. The category
  bars and the forecast line take `--chart-series-1`, which is now teal,
  so blue and orange leave the palette.
- **`--surface-2`** is used for table headers and row hover only. The
  sidebar sits on `bg-background` with `border-r`, because a surface-2
  sidebar would be the brightest thing on screen in dark mode.
- **Accent text:** every hard-coded `text-white` on the accent becomes
  `text-on-accent`, and the review pill becomes `bg-on-accent/20`.
- **Hover:** `outline`/`ghost` buttons, table rows, `OpenTabsCard` rows
  and `CategoryCombobox` items all hover with `bg-surface-2`.

### Font: `@fontsource-variable/inter`

- It is imported in `main.jsx`.
- `@theme` sets `--font-sans: "Inter Variable", system-ui, sans-serif`,
  and `body` uses `font-sans` with `font-feature-settings: "cv11"`. There
  is no `ss01`, because it changes the digits.
- `@utility num { font-variant-numeric: tabular-nums slashed-zero; }` is
  used for money and works with variants.
- Bundling keeps the self-hosted promise.

### Type scale (inside the primitives)

| Use | Classes |
|---|---|
| Labels | `text-xs font-medium uppercase tracking-wide text-ink-muted` |
| Body | `text-sm` |
| Panel title | `text-[15px] font-semibold` |
| Page title | `text-2xl font-semibold tracking-tight` |
| Tile figure | `text-3xl font-semibold num` (`text-2xl` on a phone) |

### Primitives in `components/ui`

**`PageHeader`** `{title, actions, children}`:
- `actions` (the primary action, such as Import or "Add account") stays
  beside the title.
- `children` (month switcher, account picker) sit between them on wide
  screens and take their own row on a phone.

**`Panel`** `{title, actions?, flush?, loading?, error?, children}`:
- Styling: `rounded-xl bg-surface ring-1 ring-border`, `p-5`.
- `actions` is any node, such as "View all →" or the charts' "Show as
  table" as a small header button.
- `flush` removes the body padding so tables and lists run edge to
  edge. Cells then use `px-5`.
- `loading` shows a skeleton; `error` shows "Couldn't load …".
- `Card`, `CardHeader` and `CardContent` move to the same surface and
  `p-5`, so untouched pages match.

**`Stat`** `{label, value, detail?, tone?, note?, loading?}`:
- `note` is the small "Today" / "From today" label.

**`ProgressBar`** `{value, max, marker?, tone}`:
- It is capped at 100%, and drawn critical when over.
- `marker` is a tick at a share of the bar.

**`MonthSwitcher`** `{month, onChange, short?}`:
- Months are "YYYY-MM" in local time, with helpers in `lib/months.js`.
- `short` renders "‹ Oct 2026 ›" for phones.

**`Amount`** `{cents, signed?, className}`:
- It uses `Intl.NumberFormat(undefined, {style: "currency", currency, signDisplay: signed ? "exceptZero" : "auto"})`,
  so "+" works in every locale, with `num`.
- When signed and positive it is `text-positive`.
- **`formatMoneyWhole`** (no cents) is used by tiles and attention items.

**`ListRow`** `{to?, primary, secondary?, end?, tone?}`:
- A row with a chevron when it is a link.
- Needs attention, recent transactions, tab rows and the More sheet all
  use it.

**`EmptyState`** `{icon, children, action?}`:
- Used for no accounts, no budgets, nothing recurring and "all in
  order", the last as a compact one-liner.

**`Skeleton`**: grey blocks, `animate-pulse`.

### Navigation

- One `NAV` list has `group` (`main` | `more`) and `inTabBar`.

**Sidebar (`lg`+):**
- `w-56`, fixed, on `bg-background` with `border-r`.
- It shows the wordmark, the main group, a divider and the second group.
- The footer holds the account name and its balance (`Amount`), then one
  row with the username, a theme icon button and a sign-out icon button.
- Content: `lg:pl-56` inside `max-w-6xl mx-auto px-4 lg:px-8`.

**Tab bar (below `lg`):**
- Fixed to the bottom, 56px tall plus the safe area.
- The items sit in a `max-w-md mx-auto` row, so tablets don't spread
  them out.
- Content gets `pb-[calc(4.5rem+env(safe-area-inset-bottom))]`.
- `index.html` gets `viewport-fit=cover`.
- The Toast viewport moves to `bottom-16` plus the safe area below `lg`.

**More sheet:**
- The existing Radix `Dialog`, with `DialogContent` overridden through
  `cn`/twMerge: `top-auto bottom-0 left-0 translate-x-0 translate-y-0
  max-w-none rounded-b-none`.
- It contains `ListRow` links, the theme toggle and sign out.

**Icons** (lucide): `LayoutDashboard`, `ArrowLeftRight`, `Inbox`,
`PiggyBank`, `TrendingUp`, `Upload`, `Landmark`, `Ellipsis`.

### Overview account

- `OverviewAccountProvider` sits inside `Layout`.
  - It loads `listAccounts()` again on route change.
  - It keeps the id under `reconciled.overviewAccount` in
    `localStorage`, wrapped in try/catch.
  - It falls back to the first active account when the stored id is
    missing, archived or deleted.
- The sidebar footer and the overview read it.
- Other pages keep their own selects until the follow-up change.

### Budgets month in the address

- `BudgetsPage` reads `month` from `useSearchParams`, defaulting to
  `currentMonth()` from `lib/months.js`, which uses local time.
- It uses `MonthSwitcher`, which replaces `<input type=month>`, and
  writes the month back with `replace`.

### `GET /api/reports/overview/?month=YYYY-MM&account=<id>`

- It lives in `reports/views.py` as `OverviewView`.
- Shared code:
  - `budgets.summary.budget_rows(month)`: one row per budgeted category
    (not tabs), with `limit_cents`, `spent_cents` and `parent_id`. It
    uses two grouped queries (limits, spending) instead of N+1.
    `BudgetSummaryView` uses it too.
  - `reports.spending.month_spending(month)`: category net outflows plus
    uncategorized outflows, as `CategorySpendingView` computes them
    today, and used by it.
- Response fields:
  - **`account`:** `{id, name, balance_cents, last_import_date | null}`.
    The date is the latest committed `ImportSession.updated_at` for the
    account.
  - **`month`:** `{in_cents, out_cents}` for this account, using
    `_active_transactions()` filtered by account.
  - **`budget`:**
    `{has_limits, limit_cents, spent_cents, outside_cents, uncategorized_cents, pace | null, days_left | null}`.
    - `spent_cents` is the spending of the categories that have a limit
      that month.
    - `outside_cents` is category spending without a limit, and
      `uncategorized_cents` the uncategorized outflows. Both are
      household-wide, matching the Budgets page.
    - `pace` (day ÷ days in month) and `days_left` (including today) are
      set only for the current month.
  - **`attention`:**
    `{review_count, uncategorized_count, categories: [{id, name, parent_name, spent_cents, limit_cents, over}]}`.
    - Over-limit categories come first, sorted by euros over.
    - For the current month only, they are followed by categories with
      `floor(share) >= 85` and `share > pace`, sorted by share.
  - **`forecast`:**
    `{low_cents, low_date, next: {payee, amount_cents, date} | null, has_recurring}`.
    It comes from `generate_forecast(account, 90, today)`.
  - **`recent`:** the last 8 `ledger_rows()` of the account. Each row is
    `{id, date, payee, amount_cents, category_label, is_tab, transfer_account_name, part_count}`.
- Errors: 400 for a missing or malformed month, 404 for an unknown
  account.
- The frontend works out "N days ago" and whether the import is stale
  (more than 7 days), so that "today" is the browser's local date.

### Overview page

- `OverviewPage` replaces `DashboardPage` at `/`.
- Data:
  - `getOverview(month, accountId)` feeds the tiles, needs attention and
    recent transactions;
  - the charts keep `cash-flow?end=month` and `category-spending?month=`;
  - the tabs panel uses `listTabs()`.
  - Each panel has its own loading and error state.
- The DOM order is the phone order: balance, budget, forecast,
  attention, tabs, category chart, recent, in vs out.
- On `lg` and up, `grid-template-areas` with `self-start` panels place
  them in the desktop layout:
  ```
  "bal  bud  fc"
  "cat  cat  att"
  "cat  cat  tabs"
  "rec  rec  ."
  "io   io   io"
  ```
  A missing tabs panel just leaves its area empty below needs attention.
- `OpenTabsCard` gets a `compact` prop (rows as `ListRow`, no outer
  card).
- Needs attention links:
  - review and uncategorized go to `/review`;
  - categories go to `/budgets?month=YYYY-MM`;
  - a stale import goes to `/import`.
- The in vs out panel's subtitle says "All active accounts".

### Mechanical restyle of the other pages

- Each page gets a `PageHeader`, with its primary action in the header
  when it has a single button:
  - Accounts: "Add account" moves into the header, opening the existing
    form in place;
  - Import: none;
  - Transactions keeps its inline add form, exempt until the follow-up
    change.
- `Card` sections become `Panel`s, and tables sit in `flush` panels.
- Amount cells use `Amount` (signed where in and out are mixed),
  right-aligned. Date cells use `formatShortDate`. Empty lists use
  `EmptyState`.
- Nothing else moves.

## Risks / Trade-offs

- [Restyling touches every page, and tests query by headings and
  labels.] → Keep visible texts, except "Dashboard" becoming "Overview".
  Update the navigation tests, and run the full suite after each page.
- [Household-wide budget figures sit next to per-account figures.] →
  The budget tile and the in vs out chart say "All accounts" when more
  than one active account exists. With one account nothing changes.
- [It will still feel clunky in places until the follow-up change.] →
  These are known and listed in the proposal:
  - forms above the data on Accounts, Budgets and Forecast;
  - the inline Transactions form, which scrolls sideways on a phone;
  - Forecast chart labels shrinking to about 5px at 390px, because the
    chart is a 760px viewBox;
  - a dense Review page.
- [The fixed tab bar covers content or notifications.] → Bottom padding
  with the safe area, and the toast lifted above the bar. The browser
  check covers both at 390px.
- [The bundled font adds about 300 KB.] → Variable Latin subset; it is
  cached after the first load.

## Migration Plan

Frontend and backend ship together, with no data migration. To roll
back, revert the merge.
