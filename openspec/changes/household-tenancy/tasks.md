# Tasks

## 1. Households and scoping foundation

- [x] 1.1 Create the `households` app with `Household` and many-to-many `Membership`, and verify with model tests that a user can belong to two households but not twice to one
- [x] 1.2 Add the household contextvar, `household_context`, the fail-closed `HouseholdScoped` manager and queryset, `all_households()`, and save and `bulk_create` stamping; verify unit tests that an unbound query raises and that the context resets
- [x] 1.3 Add the `HasHousehold` default permission, resolving the active household from session and membership, with resetting middleware; verify a user without a household is sent to sign in, a non-member can't activate a household, and a thread can't keep a household across requests
- [x] 1.4 Add the test base class that binds a household, and verify the existing suite's helpers can use it

## 2. Scope the data models

- [x] 2.1 Add nullable household fields, backfill and enforce migrations for accounts, budgets and transactions, including `household_path` on inherited models; verify with a migration test on existing data
- [x] 2.2 Do the same for forecasting, imports and banksync, and swap the category, seen-line and link constraints; verify the migration tests and that two households can both have a "Groceries" category
- [x] 2.3 Make `BudgetSettings` per household and fix frozen class-level querysets in serializers and views; verify `python manage.py test` passes
- [x] 2.4 Add the data migration for the first household, and verify an upgraded database shows the same reports as before for its first user
- [x] 2.5 Add `check_household_integrity`, and verify a test with a mismatched transaction is reported

## 3. Isolation suite

- [x] 3.1 Add the seeded suite that walks all `api/` routes as household A with household B's ids and asserts identical refusals and a byte-identical snapshot of B; verify an unseeded model or unlisted route fails the test
- [x] 3.2 Add the write-route table of foreign-key bodies and static checks for `HouseholdScoped` coverage and the `all_households` allowlist; verify removing a scope from a view makes the suite fail

## 4. Login, Household section and operator tools

- [x] 4.1 Return the active household, its members and the user's other households from the API, and the no-household message at login; verify API tests and that `LoginPage` shows the server's message
- [x] 4.2 Add the password change endpoint that keeps the session; verify tests for a correct and wrong current password
- [x] 4.3 Update `bootstrap_user`, and add `create_household` and `delete_household` commands; verify tests for an empty database, a restart, and deletion leaving another household unchanged
- [x] 4.4 Unregister finance models from admin, and verify only Household, User and Membership are registered
- [x] 4.5 Promote `SettingRow`, add `StatusBadge` and `Textarea`, move Settings to `Panel`, and add the Household section with the change-password dialog; verify component tests and `npm run lint`
- [x] 4.6 Validate the stored selected account against loaded accounts in `AccountsContext`; verify a test with a stale id

## 5. Invites and several households

- [x] 5.1 Add `Invite` with hashed tokens, and the create, list and revoke endpoints; verify tests that the token isn't stored, expires after 7 days and that revoking works
- [x] 5.2 Add the public invite lookup and accept endpoints for new and existing users; verify tests for each spec scenario, identical answers for bad tokens, and that two simultaneous accepts use a link once
- [x] 5.3 Exempt only the invite endpoints in the isolation suite, and verify an extra public route fails it
- [x] 5.4 Add the invite page and pending invites in the Household section with the copy control; verify component tests
- [x] 5.5 Add switching and leaving endpoints with `last_used_at`; verify tests for last-used on sign-in, leave rules, and moving to another household when removed
- [x] 5.6 Add the sidebar and phone switcher with a full reload on change; verify it's absent for one household and that no data from the old household remains
- [x] 5.7 Send `X-Household` from the API client and answer 409 on a mismatch, with the reload message; verify tests that a stale write and a stale restore change nothing
- [x] 5.8 Make `create_household` print an invite link; verify a test that the link works for a new person

## 6. Enable Banking per household

- [x] 6.1 Add `BankCredentials` with `MultiFernet`, `HOUSEHOLD_ENCRYPTION_KEYS` and `rotate_encryption_key`; verify tests for round trip, rotation and that the key is never in an API response or log
- [x] 6.2 Make `client.py` read the current household's credentials and add the typed credentials error; verify existing bank sync tests pass with household credentials
- [x] 6.3 Add the credentials API with checks, the `credentials` state and `redirect_url`; verify a test for each state in the bank-sync spec
- [x] 6.4 Scope sync per household with the two-int lock, per-household failures and the stopped-sync state; verify tests that a second household syncs during a first's run, that one failure leaves others working, and that connections aren't marked ended
- [x] 6.5 Store the household with a bank authorization and refuse a mismatch on return, and verify with tests that switching mid-way creates no connection, `_store_session` and reconnecting leave another household's joint account alone, and each household gets the line once
- [x] 6.6 Import environment credentials in `bootstrap_user`, and verify tests for present, absent and missing-key cases
- [x] 6.7 Build `BankCredentials.jsx` with steps, key upload and paste, copy with its fallback, the state messages and the Replace key confirmation, and update `api/bankSync.js`; verify component tests for every state

## 7. Backup per household

- [x] 7.1 Bump the format, scope and strip export, and add the household name; verify a test that a file holds nothing from another household
- [x] 7.2 Implement restore's id map, reference and JSON remapping, and missing-target refusal; verify round-trip tests for transfers, splits, loans, corrections, seen lines and `product_accounts`
- [x] 7.3 Replace truncation with scoped deletes and take the sync lock; verify tests that other households stay identical, a restore during a sync is refused, and credentials and the AI choice survive
- [x] 7.4 Verify a v1 backup restores into a household, a crafted id outside the file is refused, and a failed restore changes nothing
- [x] 7.5 Update Backup wording, the confirmation and summary in `SettingsPage` and `lib/backup.js`; verify frontend tests

## 8. AI choice

- [x] 8.1 Add the household switch, with who and when, gate `get_guesser()`, and default new households off; verify tests that nothing is sent when off and the first household stays on
- [x] 8.2 Add the AI categorization section with `PillSwitch`, the consent dialog and the Review page line, and update the rejected-key message in `lib/categorizeOutcome.js`; verify `ImportPage` and `ReviewPage` tests with the new wording

## 9. First run and reminders

- [x] 9.1 Add the first-run Overview with scroll-to-hash links to Settings; verify tests for an empty and a non-empty household
- [x] 9.2 Add the "Bank sync stopped" Needs attention line; verify a test that it appears once with no reconnect line

## 10. Deployment and docs

- [ ] 10.1 Add `HOUSEHOLD_ENCRYPTION_KEYS` to the example Secret, and update the README with generating the key, rotation, adding a household, inviting people, what the operator can see, and that dumps don't hold the key; verify kubeconform passes
- [x] 10.2 Replace the single-household assumption in `openspec/config.yaml`; verify `openspec validate household-tenancy --strict` passes

## 11. Integration

- [x] 11.1 Run `npm test`, `npm run lint`, `npm run build` and `python manage.py test`, and verify all pass
- [ ] 11.2 Run the upgrade on a copy of the production database following the migration plan, and verify `check_household_integrity` is clean and reports match
- [ ] 11.3 With a real Enable Banking app, confirm `GET /application` shows each state as assumed and whether replacing the app needs a reconnect, and verify a sync with stored credentials adds lines
- [ ] 11.4 In a browser, take a new household from its invite through setup with a second household present, invite a member of it into the other, and switch between them in two tabs; verify neither household sees the other's data

## Workflow follow-up

- Archive the change on its branch before the PR is merged, and open the PR with `Fixes #41`.
- Get Enable Banking's answer before another household connects a bank.
- Remove the `ENABLE_BANKING_*` values from the Secret in the following release.
