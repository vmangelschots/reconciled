# Agent instructions

## Spec-driven development with OpenSpec

This repo is built spec-first with [OpenSpec](https://github.com/Fission-AI/OpenSpec)
(`schema: spec-driven`, see `openspec/config.yaml` for project context and constraints).

- `openspec/specs/<capability>/` is the source of truth for how the app behaves.
  Read the relevant specs before changing a feature.
- `openspec/changes/<change>/` holds in-flight changes: `proposal.md`, `design.md`,
  `tasks.md` and delta specs. Finished changes move to `openspec/changes/archive/`.

### When a change is required

Any work that adds or changes behavior goes through an OpenSpec change:

1. **Explore** (optional) — `/opsx:explore` to think it through.
2. **Propose** — `/opsx:propose` creates the change and its artifacts. Get the
   user's agreement on the proposal before implementing.
3. **Apply** — `/opsx:apply` works through `tasks.md`, ticking tasks off as they
   are done. If the plan turns out wrong, revise it with `/opsx:update` rather
   than drifting from it silently.
4. **Archive** — `/opsx:archive` once all tasks are done, which syncs the delta
   specs into `openspec/specs/`.

Don't write feature code without a change, and don't change behavior that a
spec describes without updating that spec through a change.

### When a change is not required

Trivial bug fixes skip OpenSpec: the code doesn't do what the spec (or obvious
intent) already says, and the fix doesn't alter specified behavior — e.g. a
long label overflowing its button. These still get a GitHub issue and go through
a PR (see below). If a "bug" turns out to need new or changed behavior, stop and
propose a change instead.

## Issue tracking

Bugs and feature requests are GitHub issues on `vmangelschots/reconciled`,
tracked on the "Reconciled" project board
(https://github.com/users/vmangelschots/projects/4). Use the `bug` / `enhancement`
labels and add new issues to the project (`gh issue create --project Reconciled`).

Link issues and changes both ways:

- A change that comes from an issue references it in `proposal.md`
  (e.g. "Issue: #12").
- The PR description includes `Fixes #N`, so merging closes the issue and moves
  it to Done on the board.

## Git workflow

Every change and every trivial fix gets its own branch and a pull request into
`main`. Don't commit directly to `main`.

- Branch names: `change/<change-name>` for OpenSpec changes,
  `fix/<issue-number>-<short-slug>` for trivial fixes.
- Commit messages follow the existing history:
  - `Propose <change-name>: <one-line summary>` for the proposal artifacts
  - `Apply <change-name> tasks 1.1-1.3: <what they do>` per task group
  - `Archive <change-name>` for the archive step
  - plain imperative summaries for trivial fixes
- Archive the change on its branch before the PR is merged, so the PR carries
  the code, the ticked tasks and the updated specs together.
- Open the PR with `gh pr create`. Merge only after CI passes, and only when the
  user asks.

## Checks

CI (`.github/workflows/ci.yml`) runs these; run the relevant ones before pushing:

- Frontend (`frontend/`): `npm test`, `npm run lint`, `npm run build`
- Backend (`backend/`): `python manage.py test` (needs Postgres; see the CI env)
- Kubernetes manifests (`k8s/`): validated with kubeconform
