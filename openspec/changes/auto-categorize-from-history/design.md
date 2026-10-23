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
  Review guesses
  12 transactions in 4 groups. Confirm or correct each group.

  +------------------------------------------------------------------+
  | Carrefour Market            5 txns   -EUR 212.40   2-21 Oct      |
  | Checking                                                         |
  | (H) 7 of 8 earlier payments to Carrefour Market were Groceries   |
  | [ Confirm 5 ]  [ (H) Groceries      v ]  [ Show 5 ]              |
  +------------------------------------------------------------------+
```

- **Cards, not a table.** Each group is a `Card`: the payee in the
  primary ink, the count/total/date span right-aligned, accounts and
  evidence underneath in `ink-secondary`. `ink-muted` is too faint for
  text people need to read in the light theme. The cards stack, so the
  page already works at phone width; under 640px the buttons wrap below
  the evidence line.
- **Controls, in focus order:** [Confirm N] (the primary button), then the
  group's `CategoryCombobox` preset to the guess, then [Show N]. Confirm
  comes first because Enter on a closed picker opens it, so the picker
  can't double as "accept".
- **Optimism:** a resolved group is removed at once. On failure it's put
  back where it was, and an error toast is shown.
- **Focus:** on load, focus goes to the first group's Confirm. After a
  group resolves, focus goes to the Confirm of the group now at the same
  index, or the previous one if it was the last. With no groups left,
  focus goes to the empty-state heading. A success toast confirms each
  group ("Confirmed 5 Carrefour Market as Groceries").
- **Group picker:** picking a category calls `confirm-categories` with the
  ids and that category. Picking the guessed category is the same as
  Confirm. Because the group (and with it the picker) disappears, the
  focus rule above replaces the picker's usual return-to-trigger.
- **Expanded rows:** [Show N] reveals a compact list (date, account, raw
  payee, amount, notes), each row with its own picker. A row correction
  PATCHes that transaction, removes the row from the group, and updates
  the group's count and total. Focus moves to the next row's picker, or to
  the group's Confirm after the last row.
- **Empty state:**
  - "Nothing to review."
  - With `uncategorized_count > 0`, it adds "40 transactions are
    uncategorized" and a [Guess categories from history] button. That
    calls `categorize` with no account, toasts "Guessed 25 of 40", and
    reloads the groups. If nothing matched, it says "No matches in your
    history for 40 uncategorized transactions" and keeps the button.
  - With nothing uncategorized: "Every transaction has a category."
- **Section for AI:** groups are rendered from `source`, so the follow-up
  AI change only adds a second "AI guesses" section below the history
  groups. It needs no layout changes.

The visual details (card density, spacing, the look of a guess in both
themes, the empty state) get a UI Designer review before the page is
built (task 4.1).

### 7. Guesses elsewhere: ledger marker, navigation count, import summary

- **Ledger marker:** inside the existing `CategoryCombobox` trigger, so the
  column doesn't widen. For a guess, the trigger gets a dashed border, an
  italic label in `ink-secondary`, and a leading source icon: lucide
  `History` for history guesses, with `Sparkles` reserved for AI. The
  combobox gets a `suggestion` prop (`null | "history" | "ai"`). The
  row's optimistic snapshot gains `category_confirmed`, so re-picking
  shows the confirmed state at once and reverts on failure.
- **Navigation count:** `Layout` fetches `review-count` on every route
  change. The Review page triggers a refetch after each confirm, via a
  small shared hook or context. The count is a pill next to "Review",
  hidden at 0.
- **Import summary:** `importSummary` adds "14 were categorized from your
  history." and a "Review them" link to `/review` when
  `categorized_count > 0`.

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
