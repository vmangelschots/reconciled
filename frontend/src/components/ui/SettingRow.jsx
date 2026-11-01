/** One setting: its name and explanation, with its control on the right. */
export function SettingRow({ title, text, children }) {
  return (
    <div className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium text-ink-primary">{title}</span>
        <span className="text-sm text-ink-secondary">{text}</span>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
