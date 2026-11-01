# Tasks

## 1. Shared origin helper

- [x] 1.1 Move the `Origin`/`Referer`/absolute-URI fallback from `banksync.views.redirect_url` into a `core` helper, and verify the existing `banksync` tests pass unchanged
- [x] 1.2 Add `core` tests for the helper covering all three sources, and verify `Origin` wins over `Referer` and the `https` scheme is kept

## 2. Django admin invites

- [x] 2.1 Issue an invite in `HouseholdAdmin.save_model` when adding, with `created_by` set to the operator, and show the plain-text link in a success message; verify with an admin client test that adding creates one usable invite and the response shows a link whose token accepts, and that editing creates none
- [x] 2.2 Add a one-household admin action, requiring change permission, that creates a new invite link; verify with tests that one selection shows a link, several selections create nothing and show a message, and a staff login without change rights isn't offered it
- [x] 2.3 Test that the household change page shows no invite link, and that a household name with markup is escaped in the message
- [x] 2.4 Update the Households section of `k8s/README.md` with the admin route (add a household, then the action for a new link), keeping the command as an alternative, and verify the documented steps match the admin labels

## 3. Sign-in page hint

- [x] 3.1 Add the hint text to `LoginPage.jsx` under the form, and verify with a new `LoginPage.test.jsx` that the text shows and no link or form for creating a login exists

## 4. Final checks

- [x] 4.1 Run `npm test`, `npm run lint` and `npm run build` in `frontend/`, and `python manage.py test` in `backend/`, and verify all pass
- [x] 4.2 Against a running instance, add a household in Django admin, open the link in a private window, create a login, and verify it lands in the new empty household

## Workflow follow-up

- Archive the change on its branch before the PR is merged.
