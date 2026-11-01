# Tasks

## 1. Reading the file

- [x] 1.1 Add a made-up sample export at `backend/accounts/testdata/portfolio_sample.xml` covering references, an account defined as `accountTo`, a portfolio inside `crossEntry`, `latest` and `prices`, and every known transaction type. Verify no real names or figures from `my.xml` are in it. Also keep them out of tests, specs and commit messages.
- [x] 1.2 Add `accounts/portfolio_file.py`: safe parsing, reference resolving, owners found by shape, shares and cash from the sign tables, per-holding rounding. Verify in `accounts/tests_portfolio_file.py` with the "Value worked out from the file" scenarios.
- [x] 1.3 Add the refusals: not XML or not a `client` root (encrypted, binary), DOCTYPE, version below 70, unknown type, unknown reference form, transaction reached twice or not at all, negative shares, held security without a price, non-euro base, holding or non-zero cash balance. Verify each with a test, including the external entity scenario.
- [x] 1.4 Run the parser on `my.xml` locally without committing it, and verify the total equals the one Portfolio Performance shows, to the cent.

## 2. API

- [x] 2.1 Add `portfolio_excluded_cash` to `Account` with a migration, and verify in `backup/tests.py` that it round-trips and that an older backup restores with the default.
- [x] 2.2 Add the `portfolio-preview` action: investment and active only, 25 MB limit, value date rule, later-value flag, remembered exclusions applied, zero-balance cash left out. Verify with API tests for each scenario of "Preview before saving", and that a refused file answers 400 with its reason.
- [x] 2.3 Add the `portfolio-import` action calling `set_value` and saving the exclusions in one transaction. Verify with tests for "Saving sets the account's value" and "Cash accounts left out are remembered", including the uuid surviving a rename.
- [x] 2.4 Verify with tests that both actions answer 404 for another household's account, and that nothing from the file is stored after a save.

## 3. Screen

- [ ] 3.1 Add `previewPortfolio` and `importPortfolio` to `api/accounts.js`, and `PortfolioImportDialog.jsx` with the file step, the preview, live total from the ticks, the later-value note, inline refusals and the reminder to delete the export. Verify in `PortfolioImportDialog.test.jsx`, including unticking and a refusal.
- [ ] 3.2 Add "Import portfolio" to the `TransactionsPage` header for active investment accounts, refreshing the balance and ledger after a save. Verify in `TransactionsPage.test.jsx` for investment, property and archived accounts.

## 4. Final checks

- [ ] 4.1 Run `python manage.py test`, `npm test`, `npm run lint` and `npm run build`, and verify they pass.
- [ ] 4.2 In the running app, import `my.xml` into an investment account, untick the cash account tracked elsewhere, and verify the value equals Portfolio Performance's total minus that account, dated by the newest price, in the ledger and in net worth.

## Workflow follow-up

- Commit the `.gitignore` entry for `/my.xml` on this branch.
- Archive the change on its branch before the PR is merged.
