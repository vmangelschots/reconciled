import { cn } from "../../lib/cn";

/**
 * A bar for value out of max: capped at full, critical when over.
 * `marker` (0-1) draws a tick, e.g. how much of the month has passed.
 */
export function ProgressBar({ value, max, marker = null, className, label }) {
  const share = max > 0 ? value / max : 0;
  const over = share > 1;
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
        className={cn("h-full rounded-full", over ? "bg-critical" : "bg-accent")}
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
