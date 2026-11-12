# Tasks

## 1. Backend version

- [x] 1.1 Add `core/version.py` with `version_info()` reading `APP_VERSION`/`APP_COMMIT`/`APP_BUILT` (default `dev`/`None`/`None`); verify with a unit test using `override env` for both set and unset cases
- [x] 1.2 Add `GET /api/version/` (`IsAuthenticated`) and add `version` to `/health`; verify with tests in `core/tests.py`: signed-in returns all three fields, anonymous gets 401, health still returns 200 with `status: ok` and a `version`
- [x] 1.3 Add `backend/gunicorn.conf.py` with a `when_ready` hook logging `reconciled-backend version <v> (commit <c>, built <b>)`; verify by running `APP_VERSION=test gunicorn config.wsgi:application` locally and seeing the line once
- [x] 1.4 In `backend/Dockerfile`, add `ARG`/`ENV` for the three values after `collectstatic`; verify `docker build --build-arg APP_VERSION=abc1234 backend` and `docker run … python -c` print the value, and a build without args reports `dev`

## 2. Frontend version

- [ ] 2.1 Add `src/lib/version.js` (frontend `{version, commit, built}` from `VITE_APP_*`, default `dev`; `versionsDiffer`) with unit tests for the `dev` and mismatch cases
- [ ] 2.2 Add `src/api/version.js` (`fetchServerVersion`) and `src/components/AboutSection.jsx` (App and Server rows, loading "…", "Couldn't load" on failure without a toast, mismatch warning); render it last on `SettingsPage`; verify with `AboutSection.test.jsx` covering normal, release (commit shown), failure and mismatch, and run `npm test`, `npm run lint`
- [ ] 2.3 In `frontend/Dockerfile`, pass the build args as `VITE_APP_*` to `npm run build` and as `ENV` in the nginx stage; add `docker-entrypoint.d/05-version.sh` logging `reconciled-frontend version …`; verify `docker build --build-arg APP_VERSION=abc1234 frontend` then `docker run` prints the line and the built bundle contains `abc1234`
- [ ] 2.4 In `nginx.conf`, serve `/index.html` with `Cache-Control: no-cache`; verify `curl -I` against the running container shows the header for `/` and for a client route like `/transactions`, and not for `/assets/*`

## 3. CI and deploy docs

- [ ] 3.1 In `.github/workflows/ci.yml` `images` job, add a step computing `APP_VERSION` (`X.Y.Z` for `v*` tags, else 7-char SHA), `APP_COMMIT` and `APP_BUILT`, and pass them as build args to both images; verify the PR's CI run passes and its build logs show the args
- [ ] 3.2 Update `k8s/README.md`: recommend `sha-<commit>` tags in "Edit these"; in the upgrade section, list the three image fields and `kubectl rollout restart` for `latest`; add "Check what's running" (pod logs and Settings → About); verify kubeconform still passes and the commands are correct

## 4. Integration check

- [ ] 4.1 Build both images locally with the same `APP_VERSION`, run them with docker compose or by hand, and confirm: both logs show the version, Settings → About shows matching versions, and rebuilding only the frontend with a different version shows the mismatch warning

## Workflow follow-up

- Archive the change on its branch before the PR is merged.
- After merging, deploy and confirm the new version in pod logs and in Settings.
