import { TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { fetchServerVersion } from "../api/version";
import { appVersion, versionDetail, versionsDiffer } from "../lib/version";
import { Panel } from "./ui/Panel";
import { SettingRow } from "./ui/SettingRow";

function VersionRow({ title, info, failed }) {
  let value = <span className="text-ink-muted">…</span>;
  if (failed) value = <span className="text-ink-muted">Couldn't load</span>;
  else if (info) value = <span className="font-mono text-sm text-ink-primary">{info.version}</span>;
  return (
    <SettingRow title={title} text={info ? versionDetail(info) : null}>
      {value}
    </SettingRow>
  );
}

// Which builds are running, so a deploy can be confirmed from the app. See
// specs/app-version. A failed lookup stays in the row: no toast.
export function AboutSection() {
  const [server, setServer] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetchServerVersion()
      .then(setServer)
      .catch(() => setFailed(true));
  }, []);

  return (
    <Panel id="about" title="About">
      <div className="divide-y divide-border">
        <VersionRow title="App" info={appVersion} />
        <VersionRow title="Server" info={server} failed={failed} />
      </div>
      {versionsDiffer(appVersion, server) && (
        <div className="mt-4 flex gap-3 rounded-lg bg-warning/10 p-3 text-sm text-ink-primary">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <p>
            The app and server are on different versions, so one of them may not have updated. Reload the page; if it
            stays, check the pods.
          </p>
        </div>
      )}
    </Panel>
  );
}
