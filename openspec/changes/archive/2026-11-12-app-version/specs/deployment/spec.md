# Spec Delta

## ADDED Requirements

### Requirement: CI stamps the version into published images
When the pipeline builds the images, it SHALL supply both with the same version,
commit and build time (see `app-version`), with no manual step. The version SHALL
match the image's commit tag: version `a1b2c3d` is in the image tagged
`sha-a1b2c3d`.

#### Scenario: Merge to main
- **WHEN** commit `a1b2c3d…` lands on `main` and its images are published
- **THEN** the images tagged `sha-a1b2c3d` and `latest` both report version
  `a1b2c3d`

#### Scenario: Release tag
- **WHEN** the tag `v1.4.0` is pushed and its images are published
- **THEN** the images tagged `1.4.0` and `1.4` report version `1.4.0`

### Requirement: The browser loads the newest frontend after a deploy
The frontend SHALL serve its entry page so that browsers revalidate it on every
load, while fingerprinted assets stay cacheable. Reloading the page after a deploy
SHALL load the new build.

#### Scenario: Reload after a deploy
- **WHEN** a user who had the app open reloads it after a new frontend image
  is running
- **THEN** the page runs the new build, and Settings shows its version
