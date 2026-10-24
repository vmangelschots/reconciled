import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "../../lib/cn";

/**
 * One line of a list: primary text, an optional second line, something
 * on the right (an amount), and a chevron when the row is a link.
 * `icon` sits on the left.
 */
export function ListRow({ to, icon, primary, secondary, end, tone, className }) {
  const content = (
    <>
      {icon && <span className="flex shrink-0 text-ink-muted">{icon}</span>}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={cn("truncate text-sm text-ink-primary", tone)}>{primary}</span>
        {secondary && <span className="truncate text-xs text-ink-muted">{secondary}</span>}
      </span>
      {end && <span className="shrink-0 text-right text-sm">{end}</span>}
      {to && <ChevronRight className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />}
    </>
  );
  const rowClass = cn("flex min-h-11 items-center gap-3 px-5 py-2", className);
  if (!to) return <li className={rowClass}>{content}</li>;
  return (
    <li>
      <Link
        to={to}
        className={cn(
          rowClass,
          "hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none",
        )}
      >
        {content}
      </Link>
    </li>
  );
}
