# Design

## Context

- `Transaction.category` is a nullable FK with no notion of where the
  value came from. `TransactionSerializer.update` already treats a
  `category` write specially: it unlinks a transfer.
- `ImportViewSet.commit` bulk-creates `Transaction` rows with no category.
  Lines that confirm a created transfer counterpart go through
  `_confirm_transfer_counterpart` instead and are not created.
- The import stores the bank's payee as-is, and its description in `notes`
  when the two differ. Bank payees carry noise such as terminal numbers,
  card fragments and dates (`CARREFOUR MARKET 1234 BRUXELLES 23/10`).
- The ledger (`TransactionsPage.jsx`) is per account. Inline category
  changes are optimistic, with a snapshot used to revert. Re-picking the
  current category in `CategoryCombobox` still calls `onSelect`, so it
  already sends a PATCH.
- Budgets and reports sum by `category_id` and ignore everything else, so
  unconfirmed categories count with no change on their side.
- The follow-up AI change adds a second guess source after history. This
  design keeps a seam for it but builds nothing for it.

## Goals / Non-Goals

**Goals:**
- One categorizer entry point, used by both import commit and the Review
  page's backfill, so the two can't drift apart.
- Payee normalization lives only in the backend. The Review page gets its
  groups from the API instead of regrouping in JavaScript.
- Bounded query cost: a single history query per categorizer run, not one
  per transaction.
- A data model the AI change can extend by adding one `category_source`
  value.

**Non-Goals:**
- Fuzzy or token-based payee matching, and bank-specific prefix stripping.
- Caching or precomputing a payee-to-category table.
- Any change to budgets, reports or the import UI.

## Decisions

### 1. Two fields on `Transaction`: `category_confirmed` and `category_source`

- `category_confirmed = BooleanField(default=True)`.
- `category_source = CharField(choices=[("manual", "Manual"), ("history", "History")], default="manual")`.

"Unconfirmed" (shown on the Review page) means `category IS NOT NULL AND category_confirmed = False`.
An uncategorized row is always `confirmed=True, source="manual"`, so it
never counts as needing review.

Defaulting to confirmed/manual makes the migration trivial: existing rows
are confirmed. It also means every existing code path that creates a
transaction (the manual form, transfers, created counterparts) gets the
right state without being touched. Only the categorizer writes `False` and
`history`.

*Alternatives:*
- A single `category_status` enum (`confirmed` / `suggested`) with no
  source. Rejected: the source is needed to tell history and AI guesses
  apart later, and to show where a guess came from.
- A separate `suggested_category` FK. Rejected in exploration: budgets
  wouldn't count guesses.

`source` keeps the value that produced the current category even after
it's confirmed. Accepting a history guess stays `source="history"`;
picking a different category sets `source="manual"`. Nothing reads this
yet, but it costs nothing and keeps the information.

### 2. Any API write of `category` confirms it

In `TransactionSerializer.update` and `create`: if `category` is in the
validated data, set `category_confirmed=True`. If the value differs from
the current one, also set `category_source="manual"`. Neither field is
writable through the serializer; both are exposed read-only.

This covers the inline picker, including re-picking the same category,
which already PATCHes, and the edit form, which always sends `category`.
The edit-form scenario in the `transactions` delta follows from this. A
PATCH without `category` (e.g. a notes-only API call) leaves the state
unchanged.

In the ledger, confirming a guess is just re-picking it in the picker,
which PATCHes `{category: <current id>}`. A single correction on the
Review page uses the same PATCH.

### 3. Categorizer module: `transactions/categorize.py`

```
normalize_payee(payee) -> str
    lowercase; replace every non-letter with a space; collapse whitespace;
    strip. "CARREFOUR MARKET 1234 BXL 23/10" -> "carrefour market bxl"

categorize(transactions) -> int        # number categorized
    candidates = [t for t in transactions
                  if t.category_id is None and t.transfer_counterpart_id is None]
    keys = {(normalize_payee(t.payee), t.amount_cents < 0) for t in candidates}
    history = one query: confirmed, categorized, non-transfer transactions
              (all accounts), ordered by date, id
              -> per key: Counter of category_id + last-seen order
    for each candidate with a winning category:
        set category, confirmed=False, source="history"
    bulk_update(changed, [category, category_confirmed, category_source, updated_at])
```

Normalization happens in Python, so the history query can't filter by
normalized payee in SQL. It loads every confirmed categorized transaction
(only `payee`, `amount_cents`, `category_id`, `date`, `id`). For a
single-household ledger this is thousands of rows at most, and it runs
once per import or button press.

Removing all digits also removes meaningful ones (`bol.com` and `bol com`
both become `bol com`, which is fine; `Q8` becomes `q`). That's an
acceptable loss next to how much card and terminal noise it removes.

The direction is part of the key, so refunds and repayments don't inherit
an outflow category.

*Alternatives:* fuzzy matching with `SequenceMatcher`, like
`flag_duplicates`. Rejected for v1: comparing every new payee against
every history key is O(n*m), and needs a threshold that's hard to choose
without real data. The AI fallback is the better answer for near misses.

The AI change will add a second pass inside `categorize()` for candidates
history didn't resolve. That is the only seam needed.

### 4. Import commit calls the categorizer on the created rows

After `bulk_create(new_rows)` in `commit()`, still inside the atomic
block, call `categorize(created)`. Postgres returns primary keys from
`bulk_create`, so `bulk_update` works. Confirmed transfer counterparts are
never in `new_rows`, so they're excluded by construction. The commit
response gains `categorized_count`, which the import summary uses for its
review line (decision 7).

### 5. API additions on `TransactionViewSet`

- Each transaction in the response gains read-only `category_confirmed`
  and `category_source`.
- `GET /api/transactions/review-groups/` returns
  `{"groups": [...], "uncategorized_count": n}`. Each group has `key`,
  `payee` (the most recent raw payee), `direction`, `category`, `source`,
  `count`, `total_cents`, `date_from`, `date_to`, `accounts` (names),
  `evidence` (`{"matching": 7, "total": 8}` for history) and
  `transactions` (id, date, account, payee, amount_cents, notes). Groups
  are built in Python with the same `normalize_payee` and sorted by
  `count` descending, then most recent date. Evidence is computed when the
  groups are read, from current confirmed history, so nothing extra is
  stored.
- `GET /api/transactions/review-count/` returns `{"count": n}`, a single
  `COUNT` the navigation can call on every route change.
- `POST /api/transactions/confirm-categories/` with
  `{"ids": [...], "category": <id, optional>}`. Without `category` it
  confirms the unconfirmed rows among the ids. With it, it sets that
  category on them (`source="manual"` when it differs) and confirms them.
  It returns `{"confirmed_count": n}`. This one endpoint handles both
  confirming and correcting a group.
- `POST /api/transactions/categorize/` with an optional
  `{"account": id}`. It runs `categorize()` over the uncategorized,
  non-transfer rows, across all accounts when no account is given, and
  returns `{"categorized_count": n, "attempted_count": m}`.

A group is confirmed by its explicit ids, never by its key. That way only
the rows the user saw are confirmed, even if an import landed in between.

*Alternative:* grouping on the frontend from a flat `needs_review` list.
Rejected: it would duplicate `normalize_payee` in JavaScript, and the two
copies would drift apart.

### 6. Review page

A new route `/review` (`ReviewPage.jsx`) and a "Review" nav item between
Transactions and Budgets.

```
  Review
  12 transactions got a category from your history. Confirm each group
  or pick the right category.

  From your history
  +--------------------------------------------------------------+
  | Carrefour Market                 -EUR 212.40  5 transactions |
  | Checking  .  2-21 Oct                                        |
  | (H) 7 of 8 earlier payments were Groceries                   |
  | [v Confirm 5] [(H) Groceries     v]              [Show 5 v]  |
  +--------------------------------------------------------------+
```

The visual details below come from the UI Designer review (task 4.1).

- **Page header:** the h1 is "Review", matching its nav label like every
  other page. Below it is a live summary line in `ink-secondary`, then an
  h2 "From your history" (`text-sm font-medium text-ink-secondary`), so
  the AI section can slot in under its own heading later.
- **Group card:** a `Card` with `p-4` (not `CardHeader`/`CardContent`,
  whose `p-6` is too airy for a list). The space between cards is padding
  on each card's wrapper, not `gap` on the list, so it collapses along
  with a leaving card.
  - Line 1: the payee (`font-semibold`, truncated) on the left; the total
    (`tabular-nums`) and "5 transactions" in `ink-secondary` on the right.
  - Line 2: accounts and the date span in `text-sm text-ink-secondary`,
    e.g. "Checking · 2–21 Oct". Short dates: "21 Oct", "28 Sep – 21 Oct",
    with the year only when it differs from this year. More than two
    accounts become "Checking, Savings +1".
  - Line 3, the evidence: an accent `History` icon, then "7 of 8 earlier
    payments were **Groceries**" ("deposits" for inflows). The category is
    in `font-medium text-ink-primary`. The payee isn't repeated, since
    it's the title right above. `ink-muted` is too faint for this text in
    the light theme, so the line uses `ink-secondary`.
  - Controls, all h-8 (`size="sm"`): [Confirm N] (default variant, `Check`
    icon), the group picker (`w-48`, guess style), and [Show N] (`ghost`,
    `ml-auto`, with a chevron that rotates when open).
  - `focus-within:border-accent/40` marks the group that Enter acts on.
  - Under 640px: the count moves to line 2, Confirm and the picker share
    the row with `flex-1`, and Show becomes an icon-only ghost button.
- **Controls, in focus order:** Confirm, the picker, then Show. Confirm
  comes first because Enter on a closed picker opens it, so the picker
  can't double as "accept".
- **Optimism and motion:** a resolved group leaves at once. Its wrapper
  animates `grid-template-rows` to `0fr` with fading opacity and a small
  `translate-x`, over 200ms, while the card border turns `success/50`. It
  becomes `inert` straight away, and is removed from state on
  `transitionend` (with a 250ms fallback). On failure it comes back at its
  old index with a short `review-return` keyframe (in `index.css`) and a
  `critical/50` border for about 1.5s, plus an error toast. The motion is
  turned off under `motion-reduce`.
- **Focus:** on load, focus goes to the first group's Confirm. When a group
  resolves, focus moves immediately (not after the animation) to the
  Confirm of the next group that isn't leaving, or the previous one if it
  was the last. That keeps fast Enter presses working. With no groups
  left, focus goes to the empty-state heading (`tabIndex={-1}`).
- **No success toasts on this page.** The card leaving, the summary line
  and the nav count already confirm the action, and three quick Enters
  would stack three toasts. Errors still toast.
- **Group picker:** picking a category calls `confirm-categories` with the
  ids and that category. Picking the guessed category is the same as
  Confirm. Because the group (and with it the picker) disappears, the
  focus rule above replaces the picker's usual return-to-trigger.
- **Expanded rows:** [Show N] reveals a list under the controls
  (`border-t`, `divide-y`). Each row is a grid: the short date, a middle
  column (the raw payee over "Checking · notes" in `text-xs`, full text in
  `title`), the amount and a `w-40` picker in guess style. Under 640px
  the picker wraps onto its own line. A row correction PATCHes that
  transaction, collapses the row the same way a group leaves, and updates
  the group's count and total. Focus moves to the next row's picker, or to
  the group's Confirm after the last row.
- **Empty state:** a single centered `Card` with a `success`
  `CheckCircle2` and the heading "Nothing to review".
  - With `uncategorized_count > 0`: "40 transactions still have no
    category.", a [Guess categories from history] button (`History` icon;
    "Guessing…" with a spinner while it runs), and the hint "Only payees
    you've categorized before get a guess." When the run finds matches, a
    toast reports "Guessed 25 of 40" (the one success toast on this page,
    because the spec requires the report and the backfill isn't
    repeated), their groups appear, and focus goes to the first Confirm.
  - When a run matched nothing: "None of the 40 uncategorized transactions
    match a payee you've categorized before." The button is replaced by a
    link to Transactions, since running it again would give the same
    answer.
  - With nothing uncategorized: "Every transaction has a category."
- **Section for AI:** groups are rendered from `source`, so the follow-up
  AI change only adds a second "AI guesses" section below the history
  groups. It needs no layout changes.

### 7. Guesses elsewhere: ledger marker, navigation count, import summary

- **Ledger marker:** inside the existing `CategoryCombobox` trigger, so the
  column doesn't widen. The combobox gets a `suggestion` prop
  (`null | "history" | "ai"`). For a guess, the trigger:
  - keeps its solid `bg-surface`, but gets
    `border-dashed border-ink-muted/60` (solid on hover). The `border`
    token is too faint dashed, especially in dark mode;
  - shows the label in `italic text-ink-secondary`;
  - shows a leading source icon in `text-accent`: lucide `History`, with
    `Sparkles` reserved for AI. The accent color is what keeps it reading
    as deliberate rather than disabled;
  - has the tooltip "Guessed from history. Pick a category to confirm."

  The row's optimistic snapshot gains `category_confirmed`, so re-picking
  drops the guess style at once and brings it back on failure.
- **Navigation count:** `Layout` fetches `review-count` on every route
  change. The Review page triggers a refetch after each confirm, via a
  small shared context. The pill is `rounded-full`, 18px high,
  `text-[11px] font-semibold tabular-nums`, with "99+" above 99, and
  hidden at 0. Inactive it's `bg-accent/15 text-accent`; on the active
  link (`bg-accent text-white`) it's `bg-white/25 text-white`.
- **Import summary:** when `categorized_count > 0`, the result card reads
  "Created 52 transactions. 14 got a category from your history." The
  primary button becomes a [Review 14 guesses] link to `/review`, and
  "Import another file" becomes `outline`. With nothing categorized the
  card stays as it is.

## Risks / Trade-offs

- [Mixed-use payee, e.g. a supermarket for both groceries and household
  goods] → The guess is the most frequent category. It's unconfirmed and
  visibly marked, so the user sees and corrects it.
- [Normalization over-merges different payees, e.g. two shops whose names
  differ only in digits] → Rare. A guess is still only unconfirmed.
- [Normalization under-merges the same payee written differently by the
  bank] → History misses it and the row stays uncategorized. The AI
  follow-up targets these.
- [A whole-history scan per run gets slow as data grows] → Fine at
  household scale. If it ever matters, persist `normalized_payee` in an
  indexed column. That's an internal change.
- [Accepting through the edit form is implicit: saving a notes edit
  confirms the guess] → That's intended. The user had the category in
  front of them, as stated in the `transactions` delta.

## Migration Plan

- A single schema migration adds both fields with defaults (`True`,
  `"manual"`). No data migration is needed, because existing rows are
  confirmed by default.
- Rollback: reverse the migration. The categories themselves are
  untouched, so no data is lost; only the confirmed/source information
  goes.
- No new settings or dependencies. The k8s manifests don't change.
