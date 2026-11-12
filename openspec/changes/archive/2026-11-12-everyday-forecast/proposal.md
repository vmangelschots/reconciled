# Proposal

Issue: #64

## Why

The forecast only knows the recurring transactions you type in, one account
at a time.
- **Nobody types them.** Bills already have a day and an amount, so typing
  them again is redundant. The household has no recurring transactions,
  and the Overview projection shows nothing.
- **Income is missing.** A forecast built only from bills and installments
  would only go down, and the Overview would warn about running short when
  nothing is wrong.
- **Everyday spending is missing.** Without it, any forecast looks
  thousands of euros too rosy within a few months.

## What Changes

- **One Everyday forecast, not one per account.** The Forecast page projects
  the Everyday money as one pot: the total of the active Everyday accounts,
  or the only tier in use, as on the Overview. Transfers between those
  accounts cancel out. The account choice goes away. **BREAKING**: the
  per-account forecast and the forecast of a loan account are removed. A
  loan's own schedule page already shows that.
- **Items come from where they already live:**
  - **Bills** of every Bills category other than a loan category, on their
    day.
  - **Loan installments** of loans paid from an account in the pot.
  - **Budgets.**
    - Monthly limits: what's left this month is spread over its remaining
      days, and the full limit over later months.
    - Yearly budgets: what's left is spread over the rest of the year.
    - Yearly targets: what's left lands on the due date.
    - Bills inside a budgeted parent aren't counted twice.
  - **Expected items** the user enters, such as salary: a name, in or out,
    a rough amount and a day of the month. Each is recognised by a
    category, or by an account a transfer goes to.
- **The current month knows what already happened:**
  - A paid bill, a posted installment or a received expected item is not
    expected again. An expected item counts as received from a
    transaction within 25% of its amount, AI guesses included.
  - One still due whose day has passed is expected tomorrow, until it is
    missed or the month ends.
  - Missed items stay visible, greyed and "not counted".
  - This replaces "a forecast is a projection, not a reconciliation".
- **Expected items replace recurring transactions.** **BREAKING**: they are
  monthly only, have no account, always need a category or account to be
  recognised by, and can't use a category that has a budget. Existing
  monthly recurring transactions with a usable category become expected
  items. The others are dropped.
- **A new Forecast page:**
  - Today's balance, the low point and the balance in 30 or 90 days, each
    with its date.
  - A line saying what the forecast counts.
  - A chart.
  - "Coming up": items grouped by day, with the balance after each day.
  - An "Expected" panel to add and edit items in a sheet.
  - Without expected income, a neutral note instead of a shortage in the
    critical colour.
  - The stale-import line.
  - A phone layout.
- **The Overview projection** uses the same forecast. It links to Forecast
  over 30 days.
- **Budgets can open a category's sheet from the address**, so Coming up
  can link straight to a bill or budget.

Out of scope:
- A net worth forecast per month over years (#71).
- Yearly or weekly expected items.
- Separate forecasts per account.
- Spending in categories without a budget.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `forecasting`: projects one Everyday pot from bills, loan installments,
  budgets and expected items. It knows what already happened this month,
  and gets a new Forecast page. Recurring transactions and per-account
  forecasts are removed.
- `balance-history`: the Overview projection is the Everyday forecast. Its
  empty state and "No income expected" link go to Forecast over 30 days.
- `budgets`: the Budgets address can open a category's sheet.
- `data-backup`: backups hold expected items instead of recurring
  transactions.
- `accounts`: there is no Forecast account choice to order or filter any
  more.

## Impact

- **Backend:**
  - `forecasting` app: new `ExpectedItem` model and migrations, a new
    `forecast.py`, the `/forecast/` and `/expected-items/` APIs. The
    `recurring-transactions` API is removed.
  - Reads `budgets/bills.py`, `budgets/summary.py`, `budgets/yearly.py`
    and `transactions/loans.py`.
  - `reports/views.py` `_projection` uses the new forecast.
  - Backup format version 3.
  - The household isolation tests change.
- **Frontend:**
  - `ForecastingPage.jsx` is rewritten.
  - `ForecastChart.jsx` is reworked on a chart module shared with
    `EverydayMoneyChart.jsx`.
  - `Stat` gets a compact size.
  - `BudgetsPage.jsx` reads `category` from the address.
  - `api/forecasting.js` changes.
- No new dependencies.
