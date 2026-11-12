# Proposal

Issue: #64

## Why

The forecast only knows the recurring transactions you type in, one account
at a time. Bills already have a day and an amount, so typing them twice is
redundant, and nobody has done it: the household has no recurring
transactions, and the Overview projection shows nothing. Income is also
missing. A forecast built only from bills and installments would only go
down, and the Overview would warn about running short when nothing is wrong.

## What Changes

- **One Everyday forecast, not one per account.** The Forecast page projects
  the Everyday money as one pot: the total of the active Everyday accounts,
  or the only tier in use, as on the Overview. Transfers between those
  accounts cancel out. The account choice goes away. **BREAKING**: the
  per-account forecast and the forecast of a loan account are removed. A
  loan's own schedule page already shows that.
- **Three sources of upcoming items, read where they live:**
  - **Bills** of every Bills category other than a loan category, on their day.
  - **Loan installments** of loans paid from an Everyday account.
  - **Expected items** the user enters, such as salary: a name, in or out, a
    rough amount and a day of the month. Optionally a category, or an
    account a transfer goes to, to recognise it by.
- **The current month knows what already happened:**
  - A paid bill, a posted installment or a received expected item is not
    expected again this month.
  - One still due whose day has passed is expected tomorrow, until it is
    missed or the month ends.
  - This replaces "a forecast is a projection, not a reconciliation".
- **Expected items replace recurring transactions.** **BREAKING**: they are
  monthly only, with no account. Existing monthly recurring transactions
  become expected items. Weekly, biweekly and yearly ones are dropped.
- **A new Forecast page:**
  - Today's balance, the low point and the end balance.
  - A 30 or 90 day chart.
  - "Coming up": every item grouped by day, with the balance after each day.
  - A short "Expected" list to add and edit expected items in a sheet.
  - Without expected income, the page says so instead of painting a
    shortage in the critical colour.
- **The Overview projection** uses the same Everyday forecast. Its empty
  state and its "no income" note point to the Forecast page.

Out of scope:
- A net worth forecast per month over years (#71).
- Yearly or weekly expected items.
- Separate forecasts per account.
- An expected amount learned from history.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `forecasting`: projects one Everyday pot from bills, loan installments and
  expected items. It knows what already happened this month, and gets a new
  Forecast page. Recurring transactions and per-account forecasts are removed.
- `balance-history`: the Overview projection is the Everyday forecast. Its
  empty state and the "no income expected" note are worded for expected
  items.
- `data-backup`: backups hold expected items instead of recurring
  transactions.
- `accounts`: there is no Forecast account choice to order or filter any more.

## Impact

- **Backend:**
  - `forecasting` app: new `ExpectedItem` model, and a migration that
    converts monthly recurring transactions and drops `RecurringTransaction`.
  - New Everyday forecast endpoint, replacing `/forecast/?account=`, and an
    `expected-items` API replacing `recurring-transactions`.
  - Reads bills (`budgets/bills.py`) and loan installment states
    (`transactions/loans.py`).
  - `reports/views.py` `_projection` uses it.
  - Backup format and household isolation tests change.
- **Frontend:**
  - `ForecastingPage.jsx` is rewritten.
  - `ForecastChart.jsx` is reworked.
  - `api/forecasting.js` changes.
  - `EverydayMoneyChart.jsx` gets the new empty and no-income states.
- No new dependencies.
