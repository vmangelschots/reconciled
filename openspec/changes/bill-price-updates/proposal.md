# Proposal

Issue: #62

## Why

Bills (#60) expect fixed amounts, but prices change (Netflix 17.99 → 19.99)
and some months bring a one-off (an extra 50.00 of spending money, a new
subscription). Today the only fix is editing the bill by hand, and that edit
rewrites every month it counts in, so earlier months suddenly look wrong.
Payments that pay no bill just make the category over, with no way to say
"that's a new bill" or "that's fine, it's extra".

Matching also needs to be more forgiving. Most subscriptions go through
PayPal, so the payee says nothing, and only the amount tells bills apart.
The 4-day window adds nothing once the closest day is the tiebreaker. And
matching bill by bill in day order can let an unpaid bill take another
bill's payment.

## What Changes

- **Matching pairs closest amounts first, across the whole month.**
  - Within the calendar month, the system pairs a category's bills and
    outflows: closest amount first, then closest to the bill's day,
    across all its bills at once.
  - A pair still only counts within the larger of 30% and 5.00 of the
    bill's amount.
  - The 4-day window goes.
- **A bill paid at another amount gets a prompt in its sheet:** "Paid
  19.99, expected 17.99. Update the bill?"
  - **Update** applies the new amount from that month on, while earlier
    months keep theirs.
  - **Just this month** expects the new amount in that month only.
  - Both work the same for price drops. A cheaper payment now shows as
    "paid under", with a neutral chip.
- **Payments that pay no bill are listed under "Not a bill"** in the sheet,
  each with two actions:
  - **Add as bill**: every month from then on, or only that month. The
    name is prefilled from the payee and selected. The day and amount come
    from the payment.
  - **It's extra**: hides the prompt for that one payment. It still counts
    as over, and an Undo is available.
- **Bills get a history.** A bill can end in a month. "Update" ends the old
  bill in the month before and starts a new one with the new amount.
  "Only this month" bills start and end in the same month. Editing a bill
  in the editor still changes every month that bill counts in.
- **The bill bar shows spending beyond the bills.** When a Bills category
  is over, the bar ends with a striped red segment for the amount beyond
  the bills, never wider than the bills together.
- **Loan categories** get none of the prompts or the "Not a bill" group.
  The over segment does apply to them.
- **Backups** hold the one-month amounts and the "extra" marks.

Out of scope: hand-linking a payment to a specific bill, match text or
PayPal ids, a price-history view, Needs attention entries for these
prompts, and Undo on Update or Just this month.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `bill-budgets`:
  - A bill can end, and keep a different amount for one month.
  - New matching rules.
  - A "paid under" state.
  - The over segment on the bill bar.
  - The sheet's prompts: update, just this month, add as bill, it's
    extra.
- `data-backup`: a backup holds bills' one-month amounts and the payments
  marked as extra.

## Impact

- **Backend:**
  - `Bill.until_month` and a `BillMonthAmount` model (migration).
  - `Transaction.bill_extra`, a boolean with default false (migration).
  - `budgets/bills.py`:
    - `match` becomes a global pairing.
    - Bills count while `from_month <= month <= until_month`, with
      their month amount.
    - A `paid_under` state.
    - Rows carry `extras` (unmatched outflows with payee and the extra
      flag).
  - New endpoints on `CategoryViewSet`:
    - `bills/<id>/amount` (from this month on, or this month only)
    - `bills/from-payment` (add as bill)
    - `extras` (mark or unmark a payment as extra)
  - All of them are refused on loan categories.
  - `CategorySerializer.bills` lists the bills that count this month.
  - The backup format adds the new model, and Transaction's new field
    takes its default in older backups.
- **Frontend:**
  - `BillList` in `BudgetSheet.jsx` gets the prompts, the "Not a bill"
    group and the inline add form.
  - `BillBar` gets the over segment.
  - `lib/budgetOverview.js` gets the labels and `BILL_TONE.paid_under`.
  - `api/categories.js` gets the new calls.
  - The editor reloads after a sheet action.
- No new dependencies.
