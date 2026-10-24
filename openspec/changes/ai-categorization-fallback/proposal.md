# Proposal

## Why

History-based categorization only helps with payees the user has already
categorized, so a new user (or a new shop) still starts with every row
uncategorized. An AI guess for those leftover payees makes categorizing
almost automatic from the first import. Each guess the user confirms then
becomes history, so the AI is needed less over time.

Related: issue #2 (running the AI step in the background) is a follow-up
and out of scope here.

## What Changes

- **AI fallback after history:** when the categorizer runs (on import
  commit and from the Review page's backfill), transactions that history
  couldn't categorize go to Claude through the Anthropic API. Each one gets
  one of the user's existing categories, or stays uncategorized when the
  model isn't confident.
  - Payees are batched: one request covers the distinct normalized payees
    of a run, never one request per transaction.
  - The answer is constrained to the user's real category ids, so a
    made-up category can't slip through.
- **AI guesses work like history guesses:**
  - they're unconfirmed, with source `ai`, and count toward budgets;
  - they never count as history until the user confirms them;
  - the categorizer still only fills empty categories.
- **Minimal data leaves the server:** each payee is sent with its notes,
  amount and direction, along with the category names. No account names,
  balances or dates.
- **Optional and failure-tolerant:**
  - with no API key configured, the app behaves exactly as today (history
    only);
  - imported rows are saved before any guessing starts, and the AI step
    stops at a 20s deadline, so a slow API can never roll back an import;
  - if the API call fails or times out, the rows stay uncategorized, the
    import still commits, and the backfill still reports its result;
  - the import summary and the backfill say when AI didn't respond, when
    the key was rejected, and how many new payees couldn't be guessed.
- **Model:** Claude Haiku 5.5 (`claude-haiku-5-5`) by default, changeable
  through a setting.
- **Review page:**
  - AI guesses appear in their own "AI guesses" section below the history
    groups, with a "worth a closer look" subline;
  - the evidence line reads "AI guess: **Eating out** · restaurant name";
  - accepting an AI guess takes a deliberate step: focus lands on its
    picker, not its Confirm button, and Confirm is an outline button;
  - the empty state's button guesses from history and AI when AI is
    configured, reports results split by source, and offers to try again
    when AI guessed nothing.
- **Import:**
  - while the commit runs, the button shows that it's working, with a
    "can take up to a minute" hint when AI is on;
  - the summary reads "14 got a category (10 from your history, 4 by
    AI)".
- **Configuration:** `ANTHROPIC_API_KEY` (a secret, optional), plus
  settings for the model and for turning AI off. These are added to
  `.env.example` and the k8s secret example.

Not in scope:
- Running the AI call in the background (issue #2).
- Other providers or local models: the code goes through a small provider
  interface so one can be added later, but only Claude is built.
- AI guesses for manually added transactions, and re-guessing transactions
  that already have a category.
- Learning or fine-tuning from corrections beyond the existing history
  mechanism.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `auto-categorization`:
  - AI fallback after history, with the data it may send, its behavior
    without a key, on failure or past the deadline, and how its outcome is
    reported;
  - guesses can come from `ai`;
  - the Review page shows an AI section with the model's reason as
    evidence, and keyboard focus never lands on an AI group's Confirm;
  - the backfill uses AI when it's configured.
- `transaction-import`: the import summary distinguishes history and AI
  guesses, and reports the AI outcome.

## Impact

- **Backend:**
  - adds the `anthropic` Python SDK dependency;
  - a new `transactions/ai.py` (provider interface plus the Claude
    implementation);
  - `categorize()` gains an AI pass and now runs after the import's
    database transaction commits;
  - a migration adds the `ai` source choice and a short `category_reason`
    field;
  - the import commit and the review endpoints report AI counts, the
    reason, and whether AI is enabled;
  - new settings: `ANTHROPIC_API_KEY`, `AI_CATEGORIZATION_MODEL`,
    `AI_CATEGORIZATION_ENABLED`, `AI_CATEGORIZATION_DEADLINE`.
- **Frontend:**
  - the Review page's AI section, evidence and focus rule;
  - the empty-state and backfill copy;
  - the import button's running state and the summary card;
  - the reason in the ledger's AI tooltip (the Sparkles marker is already
    reserved in `CategoryCombobox`).
- **Deployment:** an optional `ANTHROPIC_API_KEY` in `.env.example`,
  `k8s/examples/secret.example.yaml` and `k8s/README.md`. No other
  manifest changes.
- **Cost and privacy:** with Haiku 5.5, an import costs well under a cent.
  Payee names, notes and amounts are sent to Anthropic.
