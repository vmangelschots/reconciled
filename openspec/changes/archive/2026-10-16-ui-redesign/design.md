# Design

## Context

The frontend is a Vite + React 19 app with seven pages (login, dashboard,
accounts, transactions, budgets, import, forecast) built incrementally
across the `budget-tracking-mvp` change, styled with one hand-written
`index.css`: plain HTML forms/tables, no component library, no design
tokens beyond the chart-specific CSS variables added for `ForecastChart`
(itself built per the dataviz skill's method - single-hue line, hover
crosshair/tooltip, table-view fallback, light/dark tokens from the
skill's reference palette). See `proposal.md` - Why for the direction
chosen (calm & minimal; Tailwind + shadcn/ui-style components) and why
now.

## Goals / Non-Goals

**Goals:**
- One consistent, calm-and-minimal design system across every existing
  page - not a partial restyle.
- Light/dark theme switching with persistence (the `ui-shell` spec).
- Responsive navigation that collapses on narrow viewports (the
  `ui-shell` spec).
- Consistent success/error feedback via toasts, replacing the scattered
  inline `role="alert"` paragraphs (the `ui-shell` spec).
- Every existing behavioral contract (the five `budget-tracking-mvp`
  specs) stays exactly as it is - this is a reskin, not a rewrite.

**Non-Goals:**
- No new product capability or business logic.
- No confirm-before-destructive-action dialogs (delete transaction,
  archive account, etc. stay immediate, just better-styled - adding a
  confirmation step is a real UX/behavior change the user didn't ask
  for here; good candidate for its own future change, not bundled in).
- No native mobile app - responsive web only.
- No dependency on the official `shadcn` CLI tool (see Decisions) -
  only a small hand-built primitive set in its style.
- No change to `ForecastChart`'s structure or interaction behavior -
  only its color values move onto the new shared tokens.

## Decisions

### Tailwind CSS replaces `index.css`
Utility-first styling is both the natural pairing for the chosen
component approach and meaningfully faster to keep consistent across
seven pages than continuing to hand-write CSS. `darkMode: 'class'`
(Tailwind's standard class-based strategy - see the theme decision
below).

### Hand-built shadcn/ui-style primitives, not the official CLI
The real `shadcn` CLI vendors component source via network pulls at
dev-time and assumes specific project conventions (path aliases, a
particular folder layout). For a small, fixed set of primitives -
Button, Input, Select, Dialog, Toast, Card, a Table wrapper - hand-building
them once on top of Radix UI primitives (accessibility/keyboard behavior)
plus `class-variance-authority` (variant styling) and `clsx` +
`tailwind-merge` (class composition) gets the same accessible, polished
result without that extra tool dependency, and keeps every line editable.
Prop names and variant conventions deliberately mirror shadcn/ui's own,
so adopting the real CLI later - if ever wanted - is closer to a drop-in
swap than a rewrite.

### `lucide-react` for icons
Pairs naturally with this component style, tree-shakeable, and covers
everything this app needs (nav icons, a hamburger toggle, toast
status icons) without hand-authoring SVGs.

### Theme mechanism: a `ThemeProvider` driving Tailwind's `dark` class
A small React context resolves the active theme as **explicit
`localStorage` choice > OS `prefers-color-scheme`**, applying or removing
a `dark` class on `<html>` accordingly (Tailwind's standard class
strategy, which every `dark:` utility and every primitive relies on). It
also subscribes to the OS preference via `matchMedia` so the app updates
live if the OS theme changes and the user hasn't made an explicit choice
yet - matching the `ui-shell` spec's scenario literally.

This **replaces** the `--chart-*` CSS-variable / `data-theme` attribute /
`prefers-color-scheme` media-query trio introduced for the forecast chart
in the prior change, so there is one dark-mode mechanism for the whole
app, not two running in parallel. The chart keeps its exact behavior;
only where its color values come from changes.

### Palette: the dataviz skill's reference tokens, extended with one accent
Reusing the same surface/ink/status tokens already validated for the
chart - rather than inventing a second, unrelated palette - keeps the
chart and the rest of the app looking like one system instead of two.
One new accent (indigo) is added for interactive elements, which the
chart had no need for.

| Token | Light | Dark | Used for |
|---|---|---|---|
| Page background | `#f9f9f7` | `#0d0d0d` | `<body>` |
| Surface (cards, inputs, popovers) | `#fcfcfb` | `#1a1a19` | raised elements |
| Primary ink | `#0b0b0b` | `#f0efec` | body text, headings |
| Secondary ink | `#52514e` | `#c3c2b7` | supporting text |
| Muted ink | `#898781` | `#898781` | placeholders, disabled |
| Border (hairline) | `rgba(11,11,11,0.10)` | `rgba(255,255,255,0.10)` | card/input borders |
| Accent (new) | `#4f46e5` | `#818cf8` | buttons, links, focus ring, active nav |
| Success | `#0ca30c` | `#0ca30c` | success toast |
| Critical | `#d03b3b` | `#e66767` | error toast, destructive button |

Typography and spacing use Tailwind's default scale unmodified - inventing
a bespoke scale would be one more thing to document and maintain for no
real benefit at this app's size. Standard control radius: `rounded-md`;
cards/dialogs: `rounded-lg` - the subtle, not-fully-rounded corner the
calm-and-minimal direction calls for.

### Responsive breakpoint
Nav collapses below Tailwind's default `md` (768px) - the conventional
tablet boundary - into a single hamburger toggle revealing the same
links in a dropdown, not a full off-canvas drawer. Simplest mechanism
that satisfies the `ui-shell` spec's scenario.

### Toast via Radix Toast
A `ToastProvider` mounted once at the app root plus a `useToast()` hook,
backed by `@radix-ui/react-toast`. Every page's existing local
`error`/success state and inline alert paragraph is replaced by a call to
this hook - a reduction in repeated boilerplate across pages as a side
benefit of satisfying the spec, not just a new dependency for its own
sake.

### Rollout order
Shared primitives and the app shell (layout, nav, theme toggle, login
page) first, so every page restyle after that reuses already-built,
already-verified pieces instead of each page re-deciding how a button or
input should look. Pages then follow the same order they were originally
built in (accounts → transactions → budgets → import → forecasting), so
each one can reuse patterns the previous one already established.

## Risks / Trade-offs

- [New dependencies add bundle size and another thing to keep updated] →
  Every library chosen (Radix, Tailwind, lucide-react, cva) is small,
  widely used, and actively maintained; no heavier UI framework (e.g.
  MUI, Ant) was considered necessary for this app's scope.
- [Replacing `index.css` wholesale touches every page at once] →
  Mitigated by the rollout order: primitives and the shell are built and
  checked in isolation first, so a mistake surfaces once, not seven
  times.
- [Hand-built primitives could drift from the real shadcn/ui if the user
  later wants the official CLI/registry] → Prop and variant names
  deliberately mirror shadcn/ui's own conventions, so that swap stays
  close to drop-in.
- [Dark mode is new and untested against every page's actual content,
  including the chart] → `tasks.md` includes an explicit cross-page
  light/dark verification pass as its own task, not an assumption that
  per-page checks already covered it.

## Migration Plan

Frontend-only; no data migration. Rollout is the order above: (1) add
Tailwind + dependencies, (2) build the shared primitives, (3) restyle the
app shell (layout/nav/theme toggle) and login page, (4) restyle each
existing page in turn, reusing the primitives, (5) a cross-cutting
verification pass (both themes, both the wide and collapsed nav, a
keyboard-only pass over focus states) across the whole app, (6) delete
the old `index.css` once nothing references it anymore.

## Open Questions

- The exact accent shade (`#4f46e5` / `#818cf8`) and how closely toast
  colors should lean on the dataviz status palette vs. a softer variant
  are safely tunable during implementation without changing anything
  structural above - visual taste, not a design decision that affects
  scope, the chosen approach, or the task breakdown.
