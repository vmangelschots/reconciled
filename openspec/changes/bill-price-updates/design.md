# Design

## Context

How Bills work today (#60, #61):
- `budgets/bills.py` matches manual bills to the month's outflows with a
  4-day window, bill by bill in day order (`match`), and derives states
  (`bill_state`).
- `bill_rows` adds the loan lines from `budgets/loan_bills.py`, which are
  never matched.
- `Bill` has `from_month` and no end. The editor (`PUT .../bills/`)
  replaces the whole list, and an edit changes every month.
- The sheet's `BillList` (`BudgetSheet.jsx`) shows lines with
  `StatusBadge` chips. `BillBar` draws one segment per bill.

The UX Architect and UI Designer reviewed the sheet for this change. Their
recommendations are folded into the decisions below. See proposal.md for
the motivation and specs/ for the behaviour.

## Goals / Non-Goals

**Goals:**
- Matching that works when every payee is "PayPal" and payments drift
  within the month.
- Fix a price change or a new bill from the sheet in one click, without
  rewriting earlier months.
- Quiet, neutral prompts. Red only for money that is actually over.

**Non-Goals:**
- Hand-linking a payment to a bill, payee or PayPal-id matching.
- A price-history view. "Earlier months keep 17.99" has to be true, not
  shown.
- Prompts in Needs attention, or Undo on Update and Just this month.

## Decisions

### Global pairing within the month
`match(bills, outflows, month)` builds every (bill, outflow) pair where:
- the outflow is in the month, and
- `|outflow - expected| <= amount_window(expected)`, where `expected` is
  the bill's amount for that month.

It sorts the pairs by `(|amount diff|, |outflow.date - due|, bill.day,
bill.id, outflow.id)` and takes them greedily, skipping a bill or an
outflow once it's used. `MATCH_DAYS` is removed.

*Why greedy, not optimal assignment:* with a handful of bills per
category, greedy-by-closest-amount gives the answer a person would.
Optimal assignment (Hungarian) can trade an exact match for two near ones,
which would surprise people. It's also deterministic and easy to test.

### Bill history: an end month plus one-month amounts
- `Bill.until_month` (nullable date, first of month): a bill counts in
  month M when `from_month <= M` and (`until_month` is null or
  `M <= until_month`).
- `BillMonthAmount(bill, month, amount_cents)` holds a bill's amount for
  one month, unique per `(bill, month)`. Its household path is
  `bill__category__household`.
- **Update from month M:**
  - When `bill.from_month == M`, just set the amount and drop any one-month
    amount for M.
  - Otherwise, set `until_month = M - 1` on the old bill and create a new
    bill with the same name and day, the new amount, `from_month = M`, and
    the old `until_month`. One-month amounts in M and later move to the
    new bill.
- **Just this month in M:** upsert a `BillMonthAmount(bill, M)`.
- **Add as bill:** create a `Bill` with the payment's day and absolute
  amount, `from_month = M`, and `until_month = M` for "only this month".
- **The editor:** `CategorySerializer.bills` lists only the bills that
  count in the current month. `PUT .../bills/` still updates those in
  place, so an editor edit changes every month that bill counts in. Bills
  that ended earlier are left alone: the replace only deletes current
  bills that are missing from the request.

*Alternative:* a versioned amount table per bill. That's more general, but
an end month plus one-month amounts covers both prompts with the least
schema, and keeps the editor's model ("today's bills") unchanged.

### "It's extra" is a transaction flag
`Transaction.bill_extra` is a `BooleanField(default=False)`. It only
changes whether the sheet offers Add as bill. Spending and matching ignore
it.
- A field avoids another household-scoped model.
- Older backups restore with the default.
- It follows the row through split and category edits.

*Alternative:* a `budgets` model keyed by transaction. That keeps
budgeting out of `transactions`, but costs another model, another backup
entry and a join.

### Row data
`bill_rows` adds, per manual line:
- `expected_cents`: the month's amount. `amount_cents` becomes this, so
  totals use it.
- `month_only`: whether a one-month amount applies.
- `difference_cents`: paid minus expected, when paid over or under.
- the `paid_under` state.

Per row it adds `extras`: the month's outflows that pay no bill, as
`[{id, date, payee, amount_cents, extra}]`, ordered by date. Loan
categories get `extras: []`. `month_outflows` also selects the payee.

### API (on `CategoryViewSet`, all refused on loan categories)
- `POST categories/{id}/bills/{bill_id}/amount/` with `{month, amount_cents,
  scope: "from_month" | "month"}`.
- `POST categories/{id}/bills/from-payment/` with `{transaction, name,
  scope: "every_month" | "month"}`. The transaction must be an outflow in
  the category or its subcategories. The month is the transaction's.
- `POST categories/{id}/extras/` with `{transaction, extra: bool}`.

Each returns the category, and the client then reloads the summary.

### Sheet UI (UX Architect + UI Designer)
- **Price prompt.** A neutral inset below the bill's line, inside the
  same `<li>`: `ml-9 mt-1 mb-1.5 flex flex-wrap items-center gap-x-3
  gap-y-2 rounded-lg bg-surface-2 px-3 py-2`.
  - A `TrendingUp`/`TrendingDown` icon in muted ink.
  - Text: "Paid €19.99, expected €17.99. Update the bill?", with the
    amounts in `num font-medium`.
  - Buttons are `size="sm" h-7`: Update is `outline`, Just this month is
    `ghost`. They wrap to their own line on a phone.
  - No amber: it's a suggestion, not a problem.
- **Chips.** Paid over shows "€2.00 over" (positive, as now). Paid under
  shows "€2.00 under" (neutral).
- **"Not a bill".** A muted uppercase label row, then one row per extra,
  in the bill grid (day, payee in `text-ink-secondary`, amount):
  - The chip column holds a ghost `Plus` "Add as bill" (just "Add" on a
    phone), plus "It's extra" as a small text link.
  - Marked rows are muted, with an "Undo" link and no Add.
- **Add form.** It opens in place, in the same inset style:
  - The name input is prefilled with the payee and selected on focus.
  - Day and amount are plain text from the payment.
  - A `SegmentedControl` offers "Every month" / "Only <Month>".
  - Cancel is ghost, Add bill is the default button. Enter saves.
- **After any action:** a toast ("Netflix is €19.99 from November",
  "Added Apple TV", "Marked as extra"), then reload the summary and the
  categories. `BudgetEditor` is re-keyed on the category's bills, so its
  local lines don't write old amounts back.
- **`BillBar` over segment.** It's added when `spent > limit`:
  - `flexGrow = min(over, bills total)`, with `ml-px` and `min-w-1.5`.
  - A striped critical fill: `repeating-linear-gradient(-45deg,
    var(--critical) 0 3px, color-mix(in srgb, var(--critical) 55%,
    transparent) 3px 6px)`.
  - The title is "€50.00 beyond the bills".
  - It appears in the row and the sheet header, loan categories included.
- **Past months** show the prompts too. Update there applies from that
  month on. Future months have nothing to match, so no prompts.

## Risks / Trade-offs

- [Whole-month pairing can pair a bill with a different payment of a
  similar amount when the real one hasn't arrived] → Only within the
  30% / €5 window, and closest amount wins globally. The label may swap,
  but totals stay right. Hand-linking is the fix if it ever matters
  (non-goal).
- [Update from a past month splits a bill, and a later editor edit only
  changes the current part] → Intended: the editor edits today's bills.
- [Two bills with the same name and day after an Update (old part ended,
  new one started)] → Harmless. Only one counts in any month.
- [A payment marked extra and then re-categorized keeps its flag] → It
  only hides a prompt. The flag is shown and can be undone wherever the
  payment appears under "Not a bill".

## Migration Plan

Two schema migrations: `budgets` adds `Bill.until_month` and
`BillMonthAmount`, and `transactions` adds `Transaction.bill_extra`
(default false). There's no data migration, since existing bills simply
have no end. Backups add `budgets.BillMonthAmount` to `BACKED_UP_MODELS`
and the clear order. Older backups restore without it, and
`bill_extra` takes its default.
