import { currentMonth, isMonth, shiftMonth } from "./months";

// The Reports page's period, kept in its address: ?period=year|last-year,
// or ?from=YYYY-MM&to=YYYY-MM for a custom one. See specs/spending-report.
export const MAX_MONTHS = 24;

export const PERIOD_OPTIONS = [
  { value: "12m", label: "12 months" },
  { value: "year", label: "This year" },
  { value: "last-year", label: "Last year" },
  { value: "custom", label: "Custom" },
];

export function monthCount(start, end) {
  const [startYear, startMonth] = start.split("-").map(Number);
  const [endYear, endMonth] = end.split("-").map(Number);
  return (endYear - startYear) * 12 + endMonth - startMonth + 1;
}

export function validCustomPeriod(start, end, now = currentMonth()) {
  return (
    isMonth(start) &&
    isMonth(end) &&
    start <= end &&
    end <= now &&
    monthCount(start, end) <= MAX_MONTHS
  );
}

// The last 12 complete months.
function defaultPeriod(now) {
  return { key: "12m", start: shiftMonth(now, -12), end: shiftMonth(now, -1) };
}

export function periodFromParams(params, now = currentMonth()) {
  const year = now.slice(0, 4);
  const period = params.get("period");
  if (period === "year") return { key: "year", start: `${year}-01`, end: now };
  if (period === "last-year") return { key: "last-year", start: `${year - 1}-01`, end: `${year - 1}-12` };
  const from = params.get("from");
  const to = params.get("to");
  if (validCustomPeriod(from, to, now)) return { key: "custom", start: from, end: to };
  return defaultPeriod(now);
}

export function paramsForPeriod(key, period) {
  if (key === "custom") return { from: period.start, to: period.end };
  return key === "12m" ? {} : { period: key };
}

// The months a custom period's picker offers, newest first.
export function monthChoices(now = currentMonth(), count = 120) {
  return Array.from({ length: count }, (_, i) => shiftMonth(now, -i));
}
