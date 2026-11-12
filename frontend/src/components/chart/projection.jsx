// Pieces shared by the charts that project a balance forward: the Overview's
// Everyday chart and the Forecast page's chart, so the two look and behave
// alike. See openspec/specs/balance-history and forecasting.
import { formatMoneyWhole } from "../../lib/money";
import { formatDayMonth } from "../../lib/yearlyBudgets";

// A label ending at its point, so it never runs off the chart's right edge.
export function PointLabel({ viewBox, text, className }) {
  return (
    <text x={viewBox.x - 8} y={viewBox.y - 10} textAnchor="end" className={className}>
      {text}
    </text>
  );
}

// The line in the critical colour once it passes below zero: a gradient,
// with a hard stop where the line meets zero.
export function BelowZeroGradient({ id, values }) {
  const max = Math.max(...values);
  const min = Math.min(...values);
  const zero = max <= 0 ? 0 : min >= 0 ? 1 : max / (max - min);
  return (
    <defs>
      <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
        <stop offset={zero} stopColor="var(--chart-series-1)" />
        <stop offset={zero} stopColor="var(--critical)" />
      </linearGradient>
    </defs>
  );
}

/**
 * The line's stroke: the series colour, or the critical colour below zero
 * when `critical` (only once income is expected - see the forecasting
 * spec's "Forecast without expected income").
 */
export function belowZeroStroke(values, gradientId, critical = true) {
  if (!critical || Math.min(...values) >= 0) return "var(--chart-series-1)";
  return Math.max(...values) <= 0 ? "var(--critical)" : `url(#${gradientId})`;
}

/** Whether the lowest point is worth a label: after today and below it. */
export function showsLow(lowest, todayBalance) {
  return Boolean(lowest) && lowest.balance_cents < todayBalance;
}

/** "Low €312 · 27 Nov", in the critical colour below zero when `critical`. */
export function LowLabel({ viewBox, lowest, critical = true }) {
  return (
    <PointLabel
      viewBox={viewBox}
      text={`Low ${formatMoneyWhole(lowest.balance_cents)} · ${formatDayMonth(lowest.date)}`}
      className={critical && lowest.balance_cents < 0 ? "chart-low-label chart-low-label-critical" : "chart-low-label"}
    />
  );
}
