# Proposal

## Why

The app works end to end (all five v1 capabilities are built and verified)
but looks like what it is: bare HTML forms and tables with no design
system. Now that the functional MVP is done, this is the right moment for
a dedicated visual pass - restyling once, holistically, across every page,
rather than piecemeal per future change.

Direction (chosen by the user from concrete options, not assumed): a
calm, minimal aesthetic - generous whitespace, thin hairlines, a single
accent color, in the vein of Linear/Notion/Vercel dashboards - built with
Tailwind CSS and a small set of accessible, pre-styled component
primitives (shadcn/ui-style, on Radix UI underneath), so the app looks
professionally designed without requiring further design decisions from
the user page by page.

## What Changes

- Add Tailwind CSS as the styling foundation (replacing the current
  hand-written `index.css`), with a small shared set of accessible UI
  primitives (button, input, select, dialog, toast, card, table) built on
  Radix UI, styled to the calm-and-minimal direction, and `lucide-react`
  for icons.
- Restyle every existing page (login, dashboard, accounts, transactions,
  budgets, import, forecast) and the shared app shell (nav/layout) using
  these primitives - a full visual pass, not a partial one.
- Replace the inline `role="alert"` error paragraphs scattered across
  every form with a consistent toast notification pattern for both
  success and error feedback.
- Make the primary navigation responsive: collapse into a toggleable menu
  below a standard tablet/mobile breakpoint instead of overflowing.
- Add a light/dark theme toggle, defaulting to the OS preference until
  the user chooses explicitly, with the choice persisted across sessions.
  (This wasn't explicitly requested - a calm-and-minimal aesthetic
  conventionally ships both modes, and the forecast chart already has
  light/dark tokens in place from the dataviz skill - so this folds
  naturally into the same pass rather than becoming a second change
  later. Flagging it as an addition, not hiding it.)
- Re-theme `ForecastChart` (added in `budget-tracking-mvp`) to the new
  shared token system - same structure and behavior (hover, crosshair,
  table fallback), restyled palette values only.

## Capabilities

### New Capabilities
- `ui-shell`: the testable cross-cutting UI behaviors this redesign
  introduces - theme switching with persistence, responsive navigation,
  and consistent success/error feedback via toasts. The aesthetic choices
  themselves (palette, spacing, which components, the Tailwind/Radix
  stack) are implementation detail captured in design.md, not here -
  specs describe behavior, not visual appearance.

### Modified Capabilities
(none - this redesign doesn't change what `accounts`, `transactions`,
`budgets`, `transaction-import`, or `forecasting` do, only how their
existing behavior is presented)

## Impact

- Frontend only (`frontend/`) - no backend/API changes.
- New frontend dependencies: `tailwindcss` + its PostCSS tooling,
  `@radix-ui/*` primitives, `class-variance-authority`, `clsx`,
  `tailwind-merge`, `lucide-react`.
- Every existing page component is restyled. `index.css` is replaced by
  Tailwind's base/utility layers plus a small set of design tokens.
- `ForecastChart.jsx` keeps its existing structure/behavior; only its
  color values change to match the new shared tokens.
