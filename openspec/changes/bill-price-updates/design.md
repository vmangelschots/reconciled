# Design

## Context

How Bills work today (#60, #61):
- `budgets/bills.py` matches manual bills to the month's outflows with a
  4-day window, bill by bill in day order (`match`), and derives states
  (`bill_state`).
- `bill_rows` adds loan lines from `budgets/loan_bills.py`, which are
  never matched.
- `Bill` has `from_month` and no end. `PUT .../bills/` replaces the
  current list, and an edit changes every month.
- The Bills sheet (`BudgetSheet.jsx`) shows `BillList`, then
  `BudgetEditor` with the same bills as input lines, then the month's
  transactions.

The UX Architect and UI Designer designed the first version of this
change, then reviewed it honestly. That plan made the sheet several
screens long on a phone, showed the same money three times, and had two
rules for changing an amount. This design is the slimmed-down result
agreed with the user. See proposal.md for the motivation and specs/ for
the behaviour.

## Goals / Non-Goals

**Goals:**
- Matching that works when every payee is "PayPal" and payments drift
  within the month, without ever suggesting a wrong price.
- One rule for any bill change: from the viewed month on, with earlier
  months untouched.
- A Bills sheet that fits one phone screen in the common case. Prompts
  that clear themselves.

**Non-Goals:**
- One-month amounts, one-month bills, marking a payment as extra, and
  hand-linking. All were cut after the review.
- Prompts in Needs attention, or a price-history view.
- Collapsing transactions on non-Bills sheets.

## Decisions

### Global pairing in a narrower window
`match(bills, outflows, month)` builds every (bill, outflow) pair where:
- the outflow is in the month, and
- `|outflow - amount| <= amount_window(amount)`, where `amount_window` is
  the larger of 15% and 2.00 (was 30% / 5.00).

It sorts the pairs by `(|amount diff|, |date - due|, bill.day, bill.id,
outflow.id)` and takes them greedily. `MATCH_DAYS` is removed.

The narrower window is what makes Update trustworthy. Whatever is
matched is close enough to suggest as the new price, and anything
further off shows as a payment that pays no bill (Add as bill), never as
"update Spotify to €8". Greedy beats optimal assignment here: it gives
the answer a person would and is deterministic.

### Bills from the viewed month on: `until_month` and splitting
`Bill.until_month` is a nullable date, the first of the month. A bill
counts in month M when `from_month <= M` and (`until_month` is null or
`M <= until_month`).

`PUT categories/{id}/bills/` takes `{month, bills: [{id?, name, day,
amount_cents}]}`. The month is the viewed month; it defaults to the
current month. It applies the list from M on. `apply_bills(category, M,
lines)` does the following:
- A line without an id becomes a new bill with `from_month = M`.
- A line whose bill is unchanged is left alone.
- A changed bill:
  - when `from_month == M`, is updated in place;
  - otherwise, the old bill gets `until_month = M - 1`, and a new bill
    with the new values starts at M and inherits the old `until_month`.
- A bill counting in M but missing from the list:
  - is deleted when `from_month == M`;
  - otherwise gets `until_month = M - 1`.
- Bills that don't count in M are never touched.

Update in "To review" is this same call with one amount changed, so the
sheet and the editor can't disagree. The editor lists the viewed month's
bills, taken from the summary row, not `CategorySerializer.bills`.
`CategorySerializer.bills` keeps listing the current month's bills, for
the switch-kind dialog's count.

### Add as bill
`POST categories/{id}/bills/from-payment/` takes `{transaction, name}`:
- The transaction must be an outflow in the category or its
  subcategories.
- It creates `Bill(day=tx.date.day, amount=-tx.amount, from_month=first
  of tx's month)`.
- It is refused on loan categories and non-Bills categories.

### Row data
`bill_rows` adds:
- per manual line, `difference_cents` (paid − amount) when paid over or
  under, and the `paid_under` state;
- per row, `extras`: unmatched outflows `[{id, date, payee,
  amount_cents}]` by date. These are empty for loan categories.
- per row, `review`: true when the month is the current month or the
  previous one.

`month_outflows` also selects the payee.

### Over with a margin
For Bills rows, `budget_rows` sets `over_limit = spent > limit +
max(limit * 5 // 100, 100)`. `attention_categories` uses `over_limit`
for Bills rows instead of `spent > limit`, so the row, the figure, Needs
attention and the bar agree. Monthly rows are unchanged. The row figure
still shows "€N over" with the real difference once it is over, and
"Paid" or "€N to pay" otherwise.

### Sheet UI (from the review)
Top to bottom, for a manual Bills category:
- **Header:** name, figure, caption, and `BillBar`.
- **"To review":** shown only when `row.review` is set and there is
  something to list.
  - One neutral `bg-surface-2` block, with one line per item.
  - A price line reads "Netflix paid €19.99, expected €17.99", with
    `Update` as an `outline sm` button.
  - An extra reads "18 Nov · PayPal · €7.99", with `Add as bill` as a
    ghost button. That opens an inline name field (prefilled with the
    payee and selected) with Add and Cancel.
  - One button per item. Toasts confirm each action.
- **"Bills":** the list once, with chips. Paid over or under shows
  "+€2.00" / "−€2.00" in neutral tone, with `TrendingUp`/`TrendingDown`.
  - "Edit bills" (a ghost link in the section header) swaps the list for
    `BudgetEditor`'s input lines, with the kind switch, Add bill, total,
    hint, and Save/Cancel.
  - Saving sends the viewed month. A note reads "Changes apply from
    <Month> on".
  - For non-Bills categories the editor shows as today.
- **Transactions:** "N transactions in <Month> ›" toggles the existing
  `SpendingRows`.

Loan categories show the header, the bill list with loan lines, and the
transactions. They get no "To review" block and no Edit bills (they
already show the "Set by loans" note).

`BillBar` gets an over segment when `row.critical` (over):
- solid `bg-critical`, with `flexGrow = min(spent - limit, bills
  total)`, `ml-px`, `min-w-1.5`;
- title "€N beyond the bills".

After every save, the summary and the categories reload, and the editor
is re-keyed on the row's bills.

## Risks / Trade-offs

- [A narrower window means a real price rise above 15% / €2 (e.g. 17.99 →
  24.99) isn't matched] → It shows under "To review" as a payment that
  pays no bill, next to an unpaid Netflix. The user can add it, or edit
  Netflix to 24.99 from that month, after which it matches. That's
  acceptable and never writes a wrong amount.
- [Splitting leaves two bills with the same name and day] → Only one
  counts in any month. The editor shows the viewed month's bills, so the
  user never sees both.
- [Editing from a past month's sheet] → It applies from that month on,
  including today. The note "Changes apply from <Month> on" says so.
- [The margin hides a true €1 extra] → Intended: a €1 difference isn't
  worth a warning, and it still shows in "To review".

## Migration Plan

One schema migration: `Bill.until_month`, nullable. No data migration,
since existing bills simply have no end. Backups need no format change,
because older backups restore the field as null.
