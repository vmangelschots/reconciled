/** The card a chart's tooltip sits in: a muted title, then its lines. */
export function ChartTooltip({ title, children }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm shadow-sm">
      <span className="text-xs text-ink-secondary">{title}</span>
      {children}
    </div>
  );
}
