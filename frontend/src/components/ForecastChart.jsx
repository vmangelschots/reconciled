import { useMemo } from "react";
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BelowZeroGradient, LowLabel, belowZeroStroke, showsLow } from "./chart/projection";
import { ChartTooltip } from "./ui/ChartTooltip";
import { formatMoneyCompact, formatMoneyWhole } from "../lib/money";

const HEIGHT = 240;
const GRADIENT_ID = "forecast-below-zero";
// Items listed in a day's tooltip before "+N more".
const TOOLTIP_ITEMS = 3;

function localDate(isoDate) {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function longDay(isoDate) {
  return localDate(isoDate).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

function tickLabel(isoDate, monthly) {
  return localDate(isoDate).toLocaleDateString(
    undefined,
    monthly ? { month: "short" } : { day: "numeric", month: "short" },
  );
}

// Weeks over 30 days (Mondays), months over 90 (the 1st).
function ticksFor(points, monthly) {
  return points
    .map((p) => p.date)
    .filter((d) => (monthly ? d.endsWith("-01") : localDate(d).getDay() === 1));
}

export function ForecastTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const shown = row.items.slice(0, TOOLTIP_ITEMS);
  const more = row.items.length - shown.length;
  return (
    <ChartTooltip title={longDay(row.date)}>
      <strong className="text-ink-primary">{formatMoneyWhole(row.balance_cents)}</strong>
      {shown.map((item, i) => (
        <span key={i} className="flex justify-between gap-3 text-xs text-ink-secondary">
          <span className="truncate">{item.name}</span>
          <span className="num">{formatMoneyWhole(item.amount_cents, { signed: true })}</span>
        </span>
      ))}
      {more > 0 && <span className="text-xs text-ink-muted">+{more} more</span>}
    </ChartTooltip>
  );
}

/**
 * The Everyday forecast as a solid stepped line from today (Recharts). See
 * the forecasting spec's "The forecast chart".
 * - points: [{date, balance_cents}] from today to the horizon's end.
 * - items: the forecast's items; a day's tooltip lists those dated on it,
 *   leaving out spread budgets, which show in the slope.
 * - lowest: the lowest point after today, labelled when below today.
 * - critical: false while no income is expected, so nothing turns red.
 * - width: optional fixed width; tests pass one, as jsdom has no layout.
 */
export function ForecastChart({ points, items = [], lowest, critical = true, width }) {
  const monthly = points.length > 31;
  const rows = useMemo(() => {
    const byDay = new Map();
    items
      .filter((i) => i.source !== "budget")
      .forEach((i) => byDay.set(i.date, [...(byDay.get(i.date) ?? []), i]));
    return points.map((p) => ({ ...p, items: byDay.get(p.date) ?? [] }));
  }, [points, items]);
  const ticks = useMemo(() => ticksFor(points, monthly), [points, monthly]);
  const values = points.map((p) => p.balance_cents);
  if (points.length === 0) return null;

  const today = points[0];
  const showLow = showsLow(lowest, today.balance_cents);
  const chart = (
    <ComposedChart data={rows} width={width} height={HEIGHT} margin={{ top: 24, right: 8, left: 0, bottom: 0 }}>
      <BelowZeroGradient id={GRADIENT_ID} values={values} />
      <CartesianGrid vertical={false} stroke="var(--chart-gridline)" />
      <XAxis
        dataKey="date"
        ticks={ticks}
        tickFormatter={(d) => tickLabel(d, monthly)}
        tick={{ fill: "var(--ink-muted)", fontSize: 11 }}
        axisLine={{ stroke: "var(--chart-baseline)" }}
        tickLine={false}
      />
      <YAxis
        domain={[(min) => Math.min(min, 0), (max) => Math.max(max, 0)]}
        tickFormatter={formatMoneyCompact}
        tickCount={4}
        tick={{ fill: "var(--ink-muted)", fontSize: 11 }}
        axisLine={false}
        tickLine={false}
        width={56}
      />
      <Tooltip
        content={<ForecastTooltip />}
        cursor={{ stroke: "var(--ink-muted)", strokeWidth: 1 }}
        isAnimationActive={false}
      />
      <Line
        dataKey="balance_cents"
        type="stepAfter"
        stroke={belowZeroStroke(values, GRADIENT_ID, critical)}
        strokeWidth={2}
        dot={false}
        activeDot={{ r: 4, className: "chart-hover-dot" }}
        isAnimationActive={false}
      />
      {showLow && (
        <ReferenceDot
          x={lowest.date}
          y={lowest.balance_cents}
          r={0}
          label={<LowLabel lowest={lowest} critical={critical} />}
        />
      )}
    </ComposedChart>
  );

  return (
    <div
      role="img"
      aria-label={`Forecast balance, from ${formatMoneyWhole(today.balance_cents)} today`}
      className="max-w-full rounded-lg bg-surface"
    >
      {width ? (
        chart
      ) : (
        <ResponsiveContainer width="100%" height={HEIGHT}>
          {chart}
        </ResponsiveContainer>
      )}
    </div>
  );
}
