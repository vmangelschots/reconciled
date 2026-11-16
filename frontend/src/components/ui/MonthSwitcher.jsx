import { currentMonth, monthLabel, shiftMonth } from "../../lib/months";
import { Stepper } from "./Stepper";

/**
 * "‹ October 2026 ›" - the one month control every month-based page
 * uses. It never moves past the current month in local time. `short`
 * renders "Oct 2026" for tight headers.
 */
export function MonthSwitcher({ month, onChange, short = false }) {
  return (
    <Stepper
      label={monthLabel(month, { short })}
      unit="month"
      onPrevious={() => onChange(shiftMonth(month, -1))}
      onNext={() => onChange(shiftMonth(month, 1))}
      nextDisabled={month >= currentMonth()}
    />
  );
}
