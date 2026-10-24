# Tasks

## 1. Data model and settings

- [x] 1.1 Add the `ai` choice to `Transaction.CategorySource` and the `category_reason` field (max 200 chars, blank default), with a migration. Expose `category_reason` read-only on `TransactionSerializer`, and clear it when the user writes a different category. Verify that `makemigrations --check` is clean, and with `transactions/tests.py` cases that a different category clears the reason while re-picking the same one keeps it.
- [x] 1.2 Add `anthropic` (current release, pinned: 2.3.0) to `backend/requirements.txt`, plus the `ANTHROPIC_API_KEY` (read by the SDK), `AI_CATEGORIZATION_ENABLED`, `AI_CATEGORIZATION_MODEL` (default `claude-haiku-5-5`) and `AI_CATEGORIZATION_DEADLINE` (default 20s) settings. Document them in `.env.example`, `k8s/examples/secret.example.yaml` (optional key) and `k8s/README.md`. Verify the backend suite passes with the new dependency installed, and that kubeconform still validates `k8s/`.

## 2. AI guesser

- [ ] 2.1 Implement `transactions/ai.py`: the `PayeeQuestion` / `Guess` data classes, the `CategoryGuesser` protocol, `get_guesser()`, and `ClaudeGuesser`, following design decisions 4 and 5 (per-request enum schema via `output_config.format`, effort `low`, `max_retries=0`, timeout set to the remaining deadline, chunks of 100, JSON payload, reason cleanup, typed error chain mapped to `ok` / `failed` / `key_rejected`, never raises). Verify with `transactions/tests_ai.py`, using a mocked SDK client, no network:
  - `get_guesser()` returns `None` without a key or when disabled;
  - the request has the expected model, effort, schema enums and payload, and the payload has no account name, date or balance;
  - answers parse into `Guess`es;
  - unknown keys and ids are dropped;
  - a reason that's empty or just the category name is stored empty;
  - refusal, `max_tokens`, bad JSON and timeout each give status `failed`, and an auth error gives `key_rejected` and stops further chunks;
  - 150 questions make two requests, and the failure of one keeps the other's guesses;
  - once the deadline has passed, no further chunks are sent.

## 3. Categorizer and API

- [ ] 3.1 Add the AI pass to `categorize()` (design decision 2): group the leftovers by `payee_key`, one question per key, apply valid guesses with source `ai` and the reason, save everything in one `bulk_update`, and return a `CategorizeResult` (counts per source, `ai_status`, `ai_declined`). Verify with `transactions/tests_categorize.py` cases using a fake guesser, covering every scenario added to the `auto-categorization` spec: a new payee gets an AI guess; history runs first; repeat payees are sent once; the model may decline (counted as declined); only real categories are accepted; no key means history only with status `off`; a failing guesser keeps the history guesses with status `failed`; and the questions carry only the allowed fields.
- [ ] 3.2 Move `categorize(created)` in `ImportViewSet.commit` to after the atomic block (design decision 3), and extend the API (decision 7): `categorized_by_source` and `ai` on import commit and `categorize`; `ai_enabled` on the import session and `review-groups`; `reason` and history-before-AI ordering on `review-groups`. Verify with `imports/tests.py` and `transactions/tests_review_api.py` cases:
  - a guesser that raises during commit still leaves the created transactions saved with their history guesses (the "AI slower than the deadline" scenario);
  - commit counts split by source, and the `ai` status and declined count come through;
  - an AI group sorts below a larger history group and carries its reason with `evidence` null;
  - `ai_enabled` follows `get_guesser()`;
  - the backfill reports 35 of 40 (25 history, 10 AI) with a fake guesser that answers 10 of the remaining 15;
  - a rejected key is reported as `key_rejected`.

## 4. Frontend

- [ ] 4.1 Review page AI section and focus (design decision 8): the "AI guesses" heading with its subline, outline Confirm on AI cards, the evidence line ("AI guess: **category** · reason", with the reason cleanup, `truncate` and `title`), focus going to an AI group's picker instead of its Confirm, and the mixed-source summary line. Verify with `ReviewPage.test.jsx` cases: AI groups render below history groups under "AI guesses" with the subline and evidence; an AI-only page focuses the first group's picker; after the last history group is confirmed, focus moves to the AI group's picker and Enter opens it instead of confirming; the existing keyboard tests still pass.
- [ ] 4.2 Review page empty state and backfill with AI: the "Guess categories" button with the `Tags` icon, the hint and the running state when `ai_enabled`; the toast split by source; the AI outcome lines (didn't respond, key rejected, N payees couldn't be guessed); the no-match copy with **Try again** when AI is on. Verify with page tests for each copy variant, and that Try again reruns the backfill.
- [ ] 4.3 Import page: the commit button's running state (spinner, "Importing…", Cancel and checkboxes disabled, the delayed hint only with `ai_enabled`); the result card's two lines with the one summary template; the AI outcome line; error-style toast on AI failure. Verify with `ImportPage.test.jsx` cases: history only ("14 got a category (14 from your history)."), mixed ("… (10 from your history, 4 by AI)."), AI only, AI failed, key rejected and declined payees; the hint appears after the delay only when `ai_enabled`; inputs are disabled while committing.
- [ ] 4.4 Ledger tooltip: add the reason to the AI marker's tooltip in `CategoryCombobox` (passed from the row's `category_reason`). Verify with a `CategoryCombobox.test.jsx` case for the tooltip with and without a reason.

## 5. Integration check

- [ ] 5.1 Run the backend and frontend suites, lint, build and kubeconform. Then, on the local docker stack with a real `ANTHROPIC_API_KEY` in `.env` (ask the user to add it; never paste it in chat), import a throwaway CSV with known and unknown payees and check:
  - the commit button's running state;
  - the result card's split line;
  - the AI section with sensible reasons;
  - focus stopping on the AI group's picker;
  - confirming and correcting an AI group by keyboard;
  - the backend logs show one request per import.

  Then set a bad key, restart, and check that an import still commits with history guesses and says the key was rejected. Remove the key and check that an import works with history only. Delete the throwaway data afterwards.

## Workflow follow-up

- Archive the change on its branch with `/opsx:archive` before the PR is merged.
- Open the PR into `main`, referencing issue #2 as the async follow-up.
