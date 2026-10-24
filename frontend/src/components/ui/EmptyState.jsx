import { cn } from "../../lib/cn";

/**
 * What a section shows when there is nothing in it: an icon, a line of
 * text and, optionally, the action that fills it. `compact` is a single
 * line, for "all in order" style messages.
 */
export function EmptyState({ icon, children, action, compact = false, className }) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 text-sm text-ink-secondary",
        compact ? "py-1" : "flex-col py-6 text-center",
        className,
      )}
    >
      {icon && <span className="text-ink-muted">{icon}</span>}
      <span>{children}</span>
      {action}
    </div>
  );
}
