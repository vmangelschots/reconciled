// Which build of the app this is, baked in by the image build (see
// frontend/Dockerfile and openspec/specs/app-version). `dev` without it.
export const appVersion = {
  version: import.meta.env.VITE_APP_VERSION || "dev",
  commit: import.meta.env.VITE_APP_COMMIT || null,
  built: import.meta.env.VITE_APP_BUILT || null,
};

/** True when app and server are on different builds; `dev` never counts. */
export function versionsDiffer(app, server) {
  if (!app || !server || app.version === "dev" || server.version === "dev") return false;
  return app.version !== server.version;
}

/** "a1b2c3d · built 12 Nov 2026, 14:03", or "1.4.0" alone gains its commit. */
export function versionDetail({ version, commit, built }) {
  const parts = [];
  if (commit && commit !== version) parts.push(`commit ${commit}`);
  if (built) {
    const date = new Date(built);
    if (!Number.isNaN(date.getTime())) {
      parts.push(`built ${date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`);
    }
  }
  return parts.join(" · ");
}
