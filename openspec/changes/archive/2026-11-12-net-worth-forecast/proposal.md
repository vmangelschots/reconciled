# Proposal

Issue: #71

## Why

The Everyday forecast answers "will I make it to payday?". It doesn't
answer "am I getting richer?". Over years, the picture changes:
- a mortgage payment mostly lowers the debt and only its interest is gone;
- money moved to savings is still yours;
- loans get paid off along the way.

The app already knows every item that tells this story, from the Everyday
forecast (#64). It only needs to count them the net worth way.

## What Changes

- **A net worth forecast**, month by month over 1, 3 or 5 years, starting
  from today's net worth. It is built from the same items as the Everyday
  forecast, counted differently:
  - expected items in a category, bills, budgets and targets count in full;
  - a loan installment counts as its interest only, for every active loan,
    whichever account pays it;
  - an expected item recognised by an account is a transfer between your
    own accounts, so it counts as 0;
  - investments and property stay at today's value, and the page says so.
- **The current month knows what already happened**, as in the Everyday
  forecast: paid, posted and received items aren't counted again.
- **The Forecast page gets an Everyday | Net worth switch:**
  - The Net worth view has a 1 year / 3 years / 5 years switch.
  - Its figures are today's net worth, the change over the period, and net
    worth at the end, with its month.
  - Below them come a caption on what counts and a monthly chart, with
    nothing under the chart.
  - The Expected panel stays beside it.
  - The view and horizon are kept in the address.
- **The Overview's net worth chart** continues as a dashed line over the
  next 12 months, marked "Projected" in its tooltip.

Out of scope:
- Expected returns on investments, or changes in property value.
- Inflation, raises, and changes to bills or budgets in future years.
- A month-by-month table or list under the net worth chart.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `forecasting`: adds the net worth forecast and its rules. The Forecast
  page gets the Everyday | Net worth switch, and its horizon switch
  depends on the view.
- `balance-history`: the Overview's net worth chart shows a 12-month
  projection after its history.

## Impact

- **Backend:**
  - `forecasting/forecast.py`: the item collectors take a mode, and there's
    a new `net_worth_forecast`.
  - New `GET /api/forecast/net-worth/?years=1|3|5`.
  - `reports/views.py` `NetWorthView` adds `projection`.
- **Frontend:**
  - `ForecastingPage.jsx`: the view switch and the net worth figures and
    chart.
  - A new monthly `NetWorthForecastChart`, or a mode of `ForecastChart`.
  - `NetWorthChart.jsx`: the dashed projection and "Projected" tooltips.
  - `api/forecasting.js` changes.
- No data model changes, no migrations, no new dependencies.
