import { useMemo } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { tickLabel, xTicks } from "./NetWorthChart";
import { ChartTooltip } from "./ui/ChartTooltip";
import { formatMoneyCompact, formatMoneyWhole } from "../lib/money";
import { monthLabel } from "../lib/months";

const HEIGHT = 240;

export function NetWorthForecastTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <ChartTooltip title={monthLabel(row.month)}>
      <strong className="text-ink-primary">{formatMoneyWhole(row.total_cents)}</strong>
      <span className="text-xs text-ink-muted">{formatMoneyWhole(row.change_cents, { signed: true })}</span>
    </ChartTooltip>
  );
}

/**
 * Net worth forecast at each month's end, from today (Recharts). See the
 * forecasting spec's "The net worth chart on Forecast". Negative net worth
 * keeps the normal colours.
 * - months: [{ month, total_cents, change_cents }], this month first.
 * - width: optional fixed width; tests pass one, as jsdom has no layout.
 */
export function NetWorthForecastChart({ months, width }) {
  const ticks = useMemo(() => xTicks(months), [months]);
  const spansYears = months.length > 24;
  const values = months.map((m) => m.total_cents);
  const zeroInRange = Math.min(...values) <= 0 && Math.max(...values) >= 0;
  const chart = (
    <LineChart data={months} width={width} height={HEIGHT} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
      <CartesianGrid vertical={false} stroke="var(--chart-gridline)" />
      <XAxis
        dataKey="month"
        ticks={ticks}
        tickFormatter={(m) => tickLabel(m, spansYears)}
        tick={{ fill: "var(--ink-muted)", fontSize: 11 }}
        axisLine={{ stroke: "var(--chart-baseline)" }}
        tickLine={false}
      />
      <YAxis
        domain={["auto", "auto"]}
        tickFormatter={formatMoneyCompact}
        tickCount={4}
        tick={{ fill: "var(--ink-muted)", fontSize: 11 }}
        axisLine={false}
        tickLine={false}
        width={56}
      />
      <Tooltip content={<NetWorthForecastTooltip />} cursor={{ stroke: "var(--ink-muted)", strokeWidth: 1 }} isAnimationActive={false} />
      {zeroInRange && <ReferenceLine y={0} stroke="var(--chart-baseline)" />}
      <Line
        dataKey="total_cents"
        type="linear"
        stroke="var(--chart-series-1)"
        strokeWidth={2}
        dot={false}
        activeDot={{ r: 4, className: "chart-hover-dot" }}
        isAnimationActive={false}
      />
    </LineChart>
  );
  return (
    <div role="img" aria-label="Net worth forecast" className="max-w-full rounded-lg bg-surface">
      {width ? chart : <ResponsiveContainer width="100%" height={HEIGHT}>{chart}</ResponsiveContainer>}
    </div>
  );
}
