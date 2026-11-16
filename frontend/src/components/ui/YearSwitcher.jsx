import { Stepper } from "./Stepper";

/**
 * "‹ 2027 ›" for the Budgets page's Year view: back to `first`, forward to
 * `last` (next year) - see specs/year-plans, "Year view".
 */
export function YearSwitcher({ year, first, last, onChange }) {
  return (
    <Stepper
      label={String(year)}
      unit="year"
      wide={false}
      onPrevious={() => onChange(year - 1)}
      onNext={() => onChange(year + 1)}
      previousDisabled={first != null && year <= first}
      nextDisabled={year >= last}
    />
  );
}
