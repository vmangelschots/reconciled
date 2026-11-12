# Proposal

Issue: #60

## Why

Fixed monthly costs (streaming, internet, the household's spending money)
are paid in one go early in the month. A monthly budget for them is at
100% while the month has barely started, so it is listed as "ahead of
pace" in Needs attention, its bar turns amber, and the budget headline
runs ahead of its marker. That's normal for a bill. Warnings that are
always there make people ignore the real ones. Yearly on a date already
handles one-off costs well, with paid / due / overdue states instead of
pace. Monthly bills need the same.

## What Changes

- **A fourth budget kind, Bills**, next to monthly, yearly and yearly on
  a date. A Bills category holds a list of expected bills, each with a
  day of the month, a name and an amount, for example Streaming: Netflix
  17.99 on the 5th, Disney+ 11.99 on the 8th, Spotify 10.99 on the 21st.
  Its monthly budget is the sum of its bills. A bill counts from the month
  it was added.
- **Each bill is matched to a payment.** A bill takes one outflow in its
  category within a few days of its day, closest amount first, within the
  same calendar month. There's no payee matching. The editor suggests
  entering the day a bill actually leaves the account.
- **Each bill has a state:** upcoming, due soon, paid, paid over, not
  seen, or missed (more than 5 days past its day, or the month has
  ended). Missed is shown in the critical colour.
- **No pace for Bills.** A Bills category is never "ahead of pace". It is
  over when its spending is more than its bills, including spending no
  bill accounts for, such as a one-off extra on the spending money.
- **The month's totals respect bills.** Bills count as monthly limits in
  the Overview's budget tile and the Budgets headline. The pace marker
  sits where spending is expected to be by today: bills due so far plus
  the passed share of the other limits. "Per day" leaves out bills not yet
  paid.
- **Needs attention** lists missed bills and Bills categories that are
  over. It doesn't list bills that are due soon.
- **Budgets page:**
  - A Bills row shows a segmented bar, one segment per bill sized by its
    amount and coloured by state, with "€11 to pay" or "Paid" and a
    caption such as "2 of 3 paid · Spotify due 21 Nov".
  - The sheet lists each bill with its state. Bills can be added, edited
    and removed inline there, behind a fourth option on the kind switch.
- **Backups** include the bills.

Out of scope, each its own issue:
- loans feeding bills into their payment category, and missed shown red
  for loans (#61)
- offering to update a bill paid at another amount (#62)
- suggesting bills from history (#63)
- bills in the forecast (#64)
- reminders (#65)

Also out of scope: payee text on bills, bills that aren't monthly, and
history of a bill's amount (an edit applies to every month it counts in).

## Capabilities

### New Capabilities
- `bill-budgets`: the Bills budget kind. It covers its bills, how each
  bill is matched to a payment, the bill states, when a Bills category is
  over, how Bills count in the month's totals and pace, and how Bills show
  on the Budgets page.

### Modified Capabilities
- `budgets`: a fourth budget kind.
- `overview`: Needs attention gains bill warnings. Pace warnings leave
  Bills out. The budget tile's pace marker and per-day figure take bills
  into account.
- `budget-overview`: the list includes Bills categories, and Bills rows
  have no pace marker.
- `data-backup`: a backup holds the bills.

## Impact

- Backend (`budgets`): a `Bill` model and migration, and `bills` as a
  `budget_kind`. Bill matching and states go in a new `budgets/bills.py`.
  `budget_rows` and `budget_totals` include Bills rows. `attention`
  gains bill items. `BudgetSummaryView` and the overview endpoint
  (`reports/views.py`) return them. Backup format: the bills are added as
  a backed-up model (older backups restore without bills).
- API: `PUT /api/categories/{id}/budget` accepts `kind: "bills"`, and
  `PUT /api/categories/{id}/bills` replaces a category's bills. The budget
  summary and overview responses gain bill rows, bill attention items and
  the new pace figures.
- Frontend: a fourth kind and a bill list in `BudgetEditor` and
  `BudgetSheet`, a `BillBar` component, `billsRow` in
  `lib/budgetOverview.js`, and bill items in the Overview's Needs
  attention and the Budgets page's Needs a look.
- No new dependencies.
