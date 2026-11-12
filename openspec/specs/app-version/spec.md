# app-version Specification

## Purpose
Lets the operator see which build of the frontend and the backend is running, in
the pod logs and in the app, so they can confirm that a deploy actually landed.

## Requirements

### Requirement: Every build has a version
Each frontend and backend build SHALL carry a version, the commit it was built from
and the time it was built. The version SHALL be the 7-character short commit SHA,
or `X.Y.Z` when built from a `vX.Y.Z` release tag. A build without this information
SHALL report the version `dev`, with no commit or build time.

#### Scenario: Build from main
- **WHEN** commit `a1b2c3d…` on `main` is built by CI
- **THEN** both images report version `a1b2c3d`, commit `a1b2c3d` and the time
  of that build

#### Scenario: Build from a release tag
- **WHEN** the tag `v1.4.0` on commit `a1b2c3d…` is built by CI
- **THEN** both images report version `1.4.0` and commit `a1b2c3d`

#### Scenario: Local development
- **WHEN** the app runs from a local checkout or a local `docker build` with
  no version supplied
- **THEN** both frontend and backend report version `dev`

### Requirement: Containers log their version at startup
When the backend server starts, it SHALL log one line with its version, commit and
build time. The frontend container SHALL do the same before it starts serving.

#### Scenario: Checking a backend pod
- **WHEN** the operator runs `kubectl logs` on a freshly started backend pod
- **THEN** the output includes a line naming the backend's version, commit and
  build time

#### Scenario: Checking a frontend pod
- **WHEN** the operator runs `kubectl logs` on a freshly started frontend pod
- **THEN** the output includes a line naming the frontend's version, commit and
  build time

### Requirement: The backend reports its version
A signed-in user SHALL be able to fetch the backend's version, commit and build
time from the API. The unauthenticated health check SHALL include the version too,
so it can be checked from inside the cluster.

#### Scenario: Signed-in request
- **WHEN** a signed-in user requests the backend version
- **THEN** the response holds the version, the commit and the build time

#### Scenario: Not signed in
- **WHEN** a request for the version through the API has no session
- **THEN** it is refused like any other signed-in-only API request

#### Scenario: Health check
- **WHEN** the health check is requested
- **THEN** it still reports ok, and also gives the backend's version

### Requirement: Settings shows both versions
Settings SHALL have an About section that shows the app (frontend) version and the
server (backend) version. Each SHALL show its commit and when it was built, and
`dev` builds SHALL show only `dev`.

#### Scenario: Normal deploy
- **WHEN** the user opens Settings after a deploy of commit `a1b2c3d`
- **THEN** the About section shows app version `a1b2c3d` and server version
  `a1b2c3d`, each with its build time

#### Scenario: Release build
- **WHEN** the running images were built from `v1.4.0`
- **THEN** each version reads `1.4.0` with its commit `a1b2c3d` next to it

#### Scenario: Server version can't be loaded
- **WHEN** the backend version request fails
- **THEN** the app version is still shown, and the server version shows that it
  couldn't be loaded, without an error toast

### Requirement: Settings flags a version mismatch
When the app and server versions differ, and neither is `dev`, the About section
SHALL say that they differ and that one of them may not have updated.

#### Scenario: Frontend didn't update
- **WHEN** the app version is `a1b2c3d` and the server version is `f9e8d7c`
- **THEN** the About section notes that the versions differ and that one of them
  may not have updated

#### Scenario: Local development
- **WHEN** either version is `dev`
- **THEN** no mismatch is shown
