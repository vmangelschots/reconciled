# Deployment Specification

## Purpose

Describes how the app is checked, built, published and run beyond a
developer machine, so self-hosting needs only published images and
cluster manifests.

## Requirements

### Requirement: Pull requests are checked before merge
Every pull request and every push SHALL run the frontend's tests, lint and
production build, the backend's test suite against PostgreSQL, and a
build of both container images. Any failure SHALL fail the run.

#### Scenario: A failing test blocks the pull request
- **WHEN** a pull request breaks a backend test
- **THEN** the pipeline run for that pull request fails and reports
  which job failed

#### Scenario: Pull requests never publish images
- **WHEN** the pipeline runs for a pull request, including one from a fork
- **THEN** both images are built but none is pushed to the registry

### Requirement: Images are published from main and release tags
A push to `main` SHALL publish the frontend and backend images to the
GitHub Container Registry, tagged with the commit SHA and `latest`. A
`vX.Y.Z` tag SHALL publish them tagged `X.Y.Z` and `X.Y`. An image SHALL
only be published after all checks for that commit have passed.

#### Scenario: Merge to main publishes latest
- **WHEN** a commit lands on `main` and its checks pass
- **THEN** `ghcr.io/vmangelschots/reconciled-frontend` and
  `ghcr.io/vmangelschots/reconciled-backend` exist tagged with that
  commit's SHA and `latest`

#### Scenario: A release tag publishes a version
- **WHEN** the tag `v1.4.0` is pushed and its checks pass
- **THEN** both images are published tagged `1.4.0` and `1.4`

#### Scenario: Failed checks publish nothing
- **WHEN** a push to `main` fails a test
- **THEN** no image is pushed for that commit

### Requirement: The frontend calls the API on its own origin when configured to
When the frontend is built with `VITE_API_BASE_URL` set to an empty
string, it SHALL send every API request to the origin it was loaded from.
When the variable is unset, it SHALL keep using `http://localhost:8000`,
so local development is unchanged. Published images SHALL be built
same-origin.

#### Scenario: Published image works on any hostname
- **WHEN** the published frontend image is served at
  `https://budget.example.com`
- **THEN** its API requests go to `https://budget.example.com/api/...`

#### Scenario: Local development is unchanged
- **WHEN** the frontend is built or run with no `VITE_API_BASE_URL`
- **THEN** its API requests go to `http://localhost:8000/api/...`

### Requirement: Kubernetes deployment manifests
The repository SHALL provide plain Kubernetes manifests that, after the
hostname, image tag and secrets are filled in, run the whole app in one
namespace with `kubectl apply -f k8s/`. They SHALL include PostgreSQL
with persistent storage, the backend, the frontend, a scheduled bank sync,
and one HTTPS hostname that serves both the frontend and the API.

#### Scenario: Fresh install
- **WHEN** a user fills in the example Secret and the Ingress hostname,
  then applies the manifests to a cluster with an nginx ingress
  controller and cert-manager
- **THEN** the app becomes reachable over HTTPS at that hostname and the
  configured user can log in

#### Scenario: Data survives restarts
- **WHEN** the database and backend pods are deleted and recreated
- **THEN** previously entered accounts and transactions are still there

#### Scenario: Requests are routed by path
- **WHEN** a browser requests `/`, `/transactions`, `/api/...`,
  `/admin/...` or `/static/...` on the app's hostname
- **THEN** app pages are served by the frontend, and API, admin and
  static-file requests by the backend

#### Scenario: Scheduled sync without credentials
- **WHEN** the manifests are applied without Enable Banking credentials
- **THEN** the scheduled sync finishes successfully and does nothing

#### Scenario: Syncs don't overlap
- **WHEN** a scheduled sync is still running at the next scheduled time
- **THEN** no second one starts

### Requirement: Backend prepares the database before serving
Before serving traffic, the backend SHALL apply pending migrations and
create the configured app user if it doesn't exist yet. It SHALL NOT
receive traffic until both have succeeded and it reports healthy.

#### Scenario: First start creates the user
- **WHEN** the backend starts against an empty database
- **THEN** migrations are applied, the user from the Secret is created,
  and only then does the pod become ready

#### Scenario: Restart keeps an existing user's password
- **WHEN** the backend restarts and the user already exists
- **THEN** the user is left unchanged, and the pod becomes ready

### Requirement: No secrets in the repository or images
Database credentials, the Django secret key, the app user's credentials
and the Enable Banking application ID and private key SHALL come from a Kubernetes Secret at runtime. The
repository SHALL ship only an example Secret with placeholder values,
and no image SHALL contain real secrets.

#### Scenario: Example secret is clearly a placeholder
- **WHEN** a user looks at the shipped example Secret
- **THEN** every value is an obvious placeholder (e.g. `change-me`), and
  the README tells them to replace it before applying
