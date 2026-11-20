# Spec Delta

## ADDED Requirements

### Requirement: Published main images reach the demo environment automatically

After the pipeline publishes images for a push to `main`, the demo environment
SHALL roll them out without a manual step, starting within 15 minutes. It SHALL
apply pending migrations before the new version serves traffic and SHALL NOT
restart when `latest` has not changed. A production instance SHALL keep its
manual rollout.

#### Scenario: A merge reaches the demo environment
- **WHEN** commit `a1b2c3d…` lands on `main`, its checks pass and the images are
  published
- **THEN** within 15 minutes the demo backend and frontend report version
  `a1b2c3d`, with migrations applied first

#### Scenario: Nothing new means no restart
- **WHEN** the check runs and the published `latest` image is the one already
  running
- **THEN** the demo pods are left alone

#### Scenario: Production is not touched
- **WHEN** the demo environment rolls out a new image
- **THEN** no production pod is restarted or replaced

### Requirement: A failed demo rollout does not block later builds

When a rolled-out image does not become ready, the update job SHALL report the
failure, and a later published image SHALL be rolled out without an operator
resetting the environment first.

#### Scenario: A later build recovers the environment
- **WHEN** a broken build leaves the demo backend unready, and a newer image is
  published
- **THEN** the newer image is rolled out and the demo environment becomes ready
  again without manual intervention

#### Scenario: The failure is visible
- **WHEN** a rollout does not become ready within its timeout
- **THEN** the update job's status shows that the rollout failed and names the
  image it tried
