# Proposal

Issue: #62

## Why

Bills (#60) expect fixed amounts, but prices change (Netflix 17.99 → 19.99)
and new subscriptions appear. Today the only fix is editing the bill by
hand, and that edit rewrites every month it counts in, so earlier months
suddenly look wrong. A payment that pays no bill just makes the category
over, with no quick way to say "that's a new bill".

Matching also needs to be more forgiving. Most subscriptions go through
PayPal, so the payee says nothing, and only the amount tells bills apart.
The 4-day window adds nothing once the closest day is the tiebreaker. And
matching bill by bill in day order can let an unpaid bill take another
bill's payment.

A UX/UI review of the first plan for this change found the budget sheet
would grow to several screens on a phone. It would show the same money
three times and use two different rules for changing an amount. This
proposal is the slimmed-down result.

## What Changes

- **Matching pairs closest amounts first, across the whole month.**
  - Within the calendar month, the system pairs a category's bills and
    outflows: closest amount first, then closest to the bill's day,
    across all its bills at once.
  - A pair counts only within the larger of 15% and 2.00 of the bill's
    amount, so a doubtful match never leads to a wrong price. The payment
    is listed as paying no bill instead.
  - The 4-day window goes.
- **One rule for changing bills: from the viewed month on.**
  - Adding, editing or removing a bill applies from the viewed month on,
    whether it happens in the editor or from a prompt.
  - Earlier months keep what they had.
  - A bill gets an end month to make that possible.
- **A "To review" block under the sheet's header**, only in the current
  month and the month before, so you can still close out last month on
  the 2nd:
  - "Netflix paid €19.99, expected €17.99" with **Update**.
  - Payments that pay no bill, with **Add as bill**. It asks for the name
    (starting from the payee, which is often just "PayPal") and uses the
    payment's day and amount.
  - It disappears when there's nothing to review.
- **Calmer chips and "over".**
  - A paid bill's difference reads "+€2.00" or "−€2.00", so "over" is
    only ever red.
  - A Bills category counts as over only beyond the larger of 5% of its
    budget and 1.00, so a small price rise doesn't land in Needs
    attention.
  - When it is over, the bill bar ends with a solid red segment for the
    amount beyond the bills.
- **A shorter Bills sheet.**
  - The bills are listed once. "Edit bills" turns that list into
    editable lines, with the kind switch.
  - The month's transactions collapse to "N transactions in <Month>".
- **Loan categories** get no prompts and no Edit bills. The over segment
  does apply to them.

Out of scope (cut after review): "just this month" amounts, one-month
bills, marking a payment as extra, hand-linking a payment to a bill, match
text or PayPal ids, a price-history view, and prompts in Needs attention.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `bill-budgets`:
  - Bills can end, and changes apply from the viewed month on.
  - New matching rules.
  - A "paid under" state, with signed differences.
  - A margin before a Bills category counts as over.
  - The over segment on the bill bar.
  - "To review" with Update and Add as bill.
  - A single bill list with Edit bills.
- `budget-overview`: a Bills sheet shows its bill list instead of the
  editor, and collapses its transactions.
- `data-backup`: a backup keeps the months a bill counts in.

## Impact

- **Backend:**
  - `Bill.until_month` (migration).
  - `budgets/bills.py`:
    - `match` becomes a global pairing in a 15% / €2 window.
    - Bills count while `from_month <= month <= until_month`.
    - A `paid_under` state and `difference_cents`.
    - Rows carry the unmatched outflows (`extras`, with payee).
    - A `review` flag for the current and previous month.
    - Bills `over_limit` uses the margin.
  - `attention_categories` uses the same over rule for Bills rows.
  - `PUT .../bills/` takes the viewed `month` and applies changes from it
    on (start, end or split bills).
  - New `POST .../bills/from-payment/`.
  - Update is an editor save with one changed amount, so it needs no
    endpoint of its own.
  - Loan categories are refused.
  - Backups: `until_month` is a new field with a default, so there's no
    format change.
- **Frontend:**
  - `BudgetSheet` gets the "To review" block, the bill list with Edit
    bills (the editor moves into it for Bills), and the collapsed
    transactions.
  - `BillBar` gets the solid over segment.
  - `lib/budgetOverview.js` gets the signed chips, `paid_under` and the
    prompt text.
  - `api/categories.js` gets the new calls.
- No new dependencies.
