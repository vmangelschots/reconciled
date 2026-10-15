# Tasks

## 1. Tailwind & dependencies

- [x] 1.1 Add Tailwind CSS and its PostCSS tooling to the frontend, configured with `darkMode: 'class'` and the palette/radius tokens from design.md, and verify `npm run build` succeeds with Tailwind's base styles present in the output CSS (Tailwind v4 is current - no JS config file or separate PostCSS config needed; used its `@tailwindcss/vite` plugin and CSS-first `@theme`/`@custom-variant dark (&:where(.dark, .dark *))` instead of a `darkMode: 'class'` key, same class-based effect. Verified: preflight rules and our `--color-*` tokens both present in the built CSS)
- [x] 1.2 Add `@radix-ui/react-dialog`, `@radix-ui/react-toast`, `@radix-ui/react-select`, `class-variance-authority`, `clsx`, `tailwind-merge`, and `lucide-react` as dependencies, and verify `npm run build` still succeeds with them imported (installed and build still succeeds; module resolution verified directly - real usage/import arrives with the components in task group 2)

## 2. Shared UI primitives

- [x] 2.1 Build `Button` (variants: default/accent, outline, ghost, destructive) and `Input` primitives per design.md's token table, and verify a small manual smoke page (or Storybook-free visual check in the running app) shows every variant in both light and dark mode (no browser/screenshot tool available in this session, so verified via component tests instead - render/click/variant-class/disabled behavior all pass - plus a successful Tailwind build; pulled task 3.1's Vitest+Testing-Library setup forward since it's needed starting here, not just at theme-system time; a real visual glance is still worth doing once pages are wired up - see group 10 note)
- [x] 2.2 Build `Select` (Radix-based) and `Card` primitives, and verify the same visual check in both themes (verified via tests: Select opens/lists/reports a chosen value, Card renders its composed parts - required polyfilling jsdom's missing `hasPointerCapture`/`scrollIntoView` for Radix, a known, well-documented gap, not a bug in our code)
- [x] 2.3 Build `Dialog` (Radix-based) and a styled `Table` wrapper (header/row/cell components), and verify both render correctly and the dialog traps focus and closes on Escape (tests confirm focus moves inside the dialog on open and Escape closes it; Table renders its composed parts)
- [x] 2.4 Build the `ToastProvider` + `useToast()` hook (Radix Toast-based, success/error variants, auto-dismiss on success, persists until dismissed on error per the `ui-shell` spec), and verify a test confirming a success toast auto-dismisses after its delay and an error toast does not (3 tests: success auto-dismisses, error persists through a long delay, error dismisses manually - directly verifies the ui-shell spec's feedback scenarios, not just that the component renders)

## 3. Theme system

- [x] 3.1 Set up a minimal frontend test runner (Vitest + @testing-library/react) if not already present, and verify a trivial test runs (done in task 2.1, pulled forward - Vitest + Testing Library + jsdom + user-event configured, `npm test` runs via `vitest run`)
- [x] 3.2 Build `ThemeProvider` (resolves explicit localStorage choice > OS `prefers-color-scheme`, applies/removes the `dark` class on `<html>`, subscribes to OS preference changes via `matchMedia`) and a theme toggle control, and verify tests for every `ui-shell` theme scenario: no stored choice follows the OS preference, an explicit choice overrides the OS preference, and the choice persists across a simulated reload (3/3 passing, one test per scenario)

## 4. App shell

- [x] 4.1 Restyle `Layout` (nav, header, session controls) with the new primitives and the theme toggle, and implement the responsive collapse below the `md` breakpoint into a toggleable menu, and verify tests for the `ui-shell` navigation scenarios: links visible inline at wide width, links hidden behind a toggle below `md` with the toggle revealing them (2/2 passing; also mounted ThemeProvider + ToastProvider at the app root in main.jsx here, since the shell is the natural place for app-wide providers and later page tasks need useToast() already wired up)
- [x] 4.2 Restyle the login page with the new primitives, and verify manually that login still succeeds and failure now surfaces via a toast instead of inline text
- [x] 4.3 Restyle the dashboard page with the new primitives (gap in the original task breakdown - `proposal.md` listed "dashboard" as in scope but no task existed for it; adding and completing it here since it belongs with the rest of the shell work, not a later page group), and verify manually that it still shows the logged-in user

## 5. Restyle: Accounts

- [ ] 5.1 Restyle the accounts list/create/edit UI with the new primitives (table, form, buttons), replace its inline error paragraph with toast feedback, and verify manually in both themes that creating, editing, and archiving an account still works exactly as before and surfaces success/error via toast

## 6. Restyle: Transactions

- [ ] 6.1 Restyle the transaction ledger UI (filters, table, add/edit form) with the new primitives, replace inline errors with toasts, and verify manually in both themes that add/edit/delete and filtering still work exactly as before

## 7. Restyle: Budgets

- [ ] 7.1 Restyle the categories list and monthly summary UI with the new primitives, replace inline errors with toasts, and verify manually in both themes that category add/rename/delete and the budget summary still work exactly as before

## 8. Restyle: Import

- [ ] 8.1 Restyle the upload/mapping/preview/confirm import flow with the new primitives, replace inline errors with toasts, and verify manually in both themes that a full CSV import still completes exactly as before

## 9. Restyle: Forecasting

- [ ] 9.1 Restyle the recurring-transactions management UI and horizon controls with the new primitives, replace inline errors with toasts, and verify manually in both themes that add/edit/delete and horizon selection still work exactly as before
- [ ] 9.2 Re-theme `ForecastChart`'s color values onto the new shared design tokens (same structure/behavior - hover, crosshair, table fallback - untouched), and verify manually in both themes that the chart renders correctly and matches the rest of the app

## 10. Cross-cutting verification & cleanup

- [ ] 10.1 Verify a full pass over every page in both light and dark mode (toggle, don't just rely on OS setting) with no leftover hard-coded colors from the old `index.css`
- [ ] 10.2 Verify a full pass over every page at a narrow (mobile) viewport width, confirming the collapsed nav and that no page's layout overflows or clips content
- [ ] 10.3 Verify a keyboard-only pass over the app shell and at least one full page (tab order, visible focus rings, dialog focus trap, toggle operable via keyboard)
- [ ] 10.4 Remove the old `index.css` once nothing references it, and verify `npm run build` succeeds with it gone

## Workflow follow-up

- Archive this change (`/opsx:archive` or `openspec archive ui-redesign`) once the tasks above are complete and reviewed.
