import { ChevronLeft, ChevronRight } from "lucide-react";
import { currentMonth, monthLabel, shiftMonth } from "../../lib/months";
import { Button } from "./Button";

/**
 * "‹ October 2026 ›" - the one month control every month-based page
 * uses. It never moves past the current month in local time. `short`
 * renders "Oct 2026" for tight headers.
 */
export function MonthSwitcher({ month, onChange, short = false }) {
  const atCurrent = month >= currentMonth();
  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="icon" aria-label="Previous month" onClick={() => onChange(shiftMonth(month, -1))}>
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="min-w-24 text-center text-sm font-medium text-ink-primary sm:min-w-32">
        {monthLabel(month, { short })}
      </span>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Next month"
        disabled={atCurrent}
        onClick={() => onChange(shiftMonth(month, 1))}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
