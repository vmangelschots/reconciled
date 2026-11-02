import { cn } from "../../lib/cn";

const FILL = { warning: "bg-warning", positive: "bg-positive" };

/**
 * A bar for value out of max: capped at full, critical when over.
 * `marker` (0-1) draws a tick, e.g. how much of the month has passed.
 * `tone="warning"` fills it amber while it isn't over, e.g. when spending
 * runs ahead of pace. `tone="positive"` fills it green and never turns
 * critical, e.g. a target paid slightly over its amount.
 */
export function ProgressBar({ value, max, marker = null, tone, className, label }) {
  const share = max > 0 ? value / max : 0;
  const over = share > 1 && tone !== "positive";
  const width = `${Math.min(Math.max(share, 0), 1) * 100}%`;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className={cn("relative h-2 w-full overflow-visible rounded-full bg-surface-2 ring-1 ring-border", className)}
    >
      <div
        data-testid="progress-fill"
        className={cn("h-full rounded-full", over ? "bg-critical" : FILL[tone] ?? "bg-accent")}
        style={{ width }}
      />
      {marker != null && (
        <div
          data-testid="progress-marker"
          className="absolute -top-1 h-4 w-0.5 rounded-full bg-ink-primary/60"
          style={{ left: `${Math.min(Math.max(marker, 0), 1) * 100}%` }}
        />
      )}
    </div>
  );
}
