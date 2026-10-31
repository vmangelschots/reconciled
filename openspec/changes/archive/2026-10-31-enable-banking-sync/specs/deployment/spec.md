# Spec Delta

## MODIFIED Requirements

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

### Requirement: No secrets in the repository or images
Database credentials, the Django secret key, the app user's credentials
and the Enable Banking application ID and private key SHALL come from a Kubernetes Secret at runtime. The
repository SHALL ship only an example Secret with placeholder values,
and no image SHALL contain real secrets.

#### Scenario: Example secret is clearly a placeholder
- **WHEN** a user looks at the shipped example Secret
- **THEN** every value is an obvious placeholder (e.g. `change-me`), and
  the README tells them to replace it before applying
