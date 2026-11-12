import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartTooltip } from "./ui/ChartTooltip";
import { Panel } from "./ui/Panel";
import { PillSwitch } from "./ui/PillSwitch";
import { formatMoneyCompact, formatMoneyWhole } from "../lib/money";
import { monthLabel } from "../lib/months";
import { tierLabel } from "../lib/tiers";

const HEIGHT = 240;
const SIDE_HEIGHT = 200;
const MAX_TICKS = 4;

const RANGES = [
  { value: "1y", label: "1Y", months: 12 },
  { value: "5y", label: "5Y", months: 60 },
  { value: "all", label: "All", months: Infinity },
];

const whole = (cents) => formatMoneyWhole(cents);

// A range that shows nothing more than a shorter one is left out, and with
// only All left there is nothing to choose. See specs/balance-history.
export function availableRanges(count) {
  const shorter = RANGES.filter((r) => r.months < count);
  return shorter.length > 0 ? [...shorter, RANGES[RANGES.length - 1]] : [];
}

function shortMonth(month) {
  const [year, m] = month.split("-").map(Number);
  return new Date(year, m - 1, 1).toLocaleString(undefined, { month: "short" });
}

// Januaries once the range spans years, otherwise evenly spaced months,
// and never more than MAX_TICKS of either.
export function xTicks(rows) {
  const months = rows.map((r) => r.month);
  const januaries = months.filter((m) => m.endsWith("-01"));
  const candidates = months.length > 24 && januaries.length > 1 ? januaries : months;
  const step = Math.ceil(candidates.length / MAX_TICKS);
  return candidates.filter((_, i) => (candidates.length - 1 - i) % step === 0);
}

export function tickLabel(month, spansYears) {
  return spansYears ? month.slice(0, 4) : shortMonth(month);
}

export function NetWorthTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  if (row.total_cents === undefined) {
    // A projected month: the total and the change, without tiers.
    return (
      <ChartTooltip title={`${monthLabel(row.month)} · Projected`}>
        <strong className="text-ink-primary">{whole(row.projected_cents)}</strong>
        <span className="text-xs text-ink-muted">{formatMoneyWhole(row.change_cents, { signed: true })}</span>
      </ChartTooltip>
    );
  }
  return (
    <ChartTooltip title={monthLabel(row.month)}>
      <strong className="text-ink-primary">{whole(row.total_cents)}</strong>
      <dl className="mt-1 flex min-w-40 flex-col gap-0.5 border-t border-border pt-1 text-xs">
        {row.tiers.map((t) => (
          <div key={t.tier} className="flex justify-between gap-4">
            <dt className="text-ink-secondary">{tierLabel(t.tier)}</dt>
            <dd className="num text-ink-primary">{whole(t.balance_cents)}</dd>
          </div>
        ))}
        {row.change_cents != null && (
          <div className="flex justify-between gap-4 text-ink-muted">
            <dt>Change</dt>
            <dd className="num">{formatMoneyWhole(row.change_cents, { signed: true })}</dd>
          </div>
        )}
      </dl>
    </ChartTooltip>
  );
}

/**
 * Net worth at each month's end (Recharts). See specs/balance-history.
 * - months: [{ month, total_cents, tiers, change_cents }], oldest first,
 *   then any projected months as { month, projected_cents, change_cents }.
 *   The current month carries both totals, so the dashed line joins it.
 * - selectedMonth: the overview's month, marked on the line.
 * - sideColumn: the narrow column, where the tooltip opens leftward over
 *   the main column so it doesn't cover the line.
 * - width: optional fixed width; tests pass one, as jsdom has no layout.
 */
export function NetWorthChart({ months, selectedMonth, sideColumn = false, width }) {
  const height = sideColumn ? SIDE_HEIGHT : HEIGHT;
  const ticks = useMemo(() => xTicks(months), [months]);
  const spansYears = months.length > 24;
  const history = months.filter((m) => m.total_cents !== undefined);
  const last = history[history.length - 1];
  const selected = history.find((m) => m.month === selectedMonth);
  const values = months.map((m) => m.total_cents ?? m.projected_cents);
  const zeroInRange = Math.min(...values) <= 0 && Math.max(...values) >= 0;

  const chart = (
    <LineChart data={months} width={width} height={height} margin={{ top: 24, right: 8, left: 0, bottom: 0 }}>
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
        width={sideColumn ? 44 : 56}
      />
      <Tooltip
        content={<NetWorthTooltip />}
        cursor={{ stroke: "var(--ink-muted)", strokeWidth: 1 }}
        isAnimationActive={false}
        allowEscapeViewBox={sideColumn ? { x: true } : undefined}
        reverseDirection={sideColumn ? { x: true } : undefined}
      />
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
      <Line
        dataKey="projected_cents"
        type="linear"
        stroke="var(--chart-series-1)"
        strokeWidth={2}
        strokeDasharray="5 5"
        dot={false}
        activeDot={{ r: 4, className: "chart-hover-dot" }}
        isAnimationActive={false}
        connectNulls={false}
      />
      <ReferenceDot
        x={last.month}
        y={last.total_cents}
        r={4}
        fill="var(--chart-series-1)"
        stroke="var(--surface)"
        strokeWidth={2}
        label={{
          value: whole(last.total_cents),
          position: "insideBottomRight",
          dy: -8,
          className: "chart-end-label",
        }}
      />
      {selected && selected !== last && (
        <ReferenceDot
          x={selected.month}
          y={selected.total_cents}
          r={4}
          fill="var(--surface)"
          stroke="var(--chart-series-1)"
          strokeWidth={2}
          data-testid="net-worth-selected"
        />
      )}
    </LineChart>
  );

  return (
    <div
      role="img"
      aria-label={`Net worth over ${history.length} months, ending at ${whole(last.total_cents)}`}
      className="rounded-lg bg-surface"
    >
      {width ? (
        chart
      ) : (
        <ResponsiveContainer width="100%" height={height}>
          {chart}
        </ResponsiveContainer>
      )}
    </div>
  );
}

function withChanges(months) {
  return months.map((m, i) => ({ ...m, change_cents: i > 0 ? m.total_cents - months[i - 1].total_cents : null }));
}

// The history, then the projection, joined at the current month.
function withProjection(history, projection) {
  if (!projection?.length || history.length === 0) return history;
  const current = history[history.length - 1];
  return [
    ...history.slice(0, -1),
    { ...current, projected_cents: current.total_cents },
    ...projection.map((p) => ({ month: p.month, projected_cents: p.total_cents, change_cents: p.change_cents })),
  ];
}

/**
 * The Net worth panel: its range buttons, the chart, and its empty state.
 * The range chooses how much history shows; the projection (the next 12
 * months, from the net worth forecast) always follows it.
 */
export function NetWorthPanel({ months, projection, loading, error, selectedMonth, sideColumn, width }) {
  const [range, setRange] = useState("all");
  const rows = useMemo(() => withChanges(months ?? []), [months]);
  const ranges = availableRanges(rows.length);
  const shown = ranges.find((r) => r.value === range) ?? RANGES[RANGES.length - 1];
  const visible = withProjection(shown.months === Infinity ? rows : rows.slice(-shown.months), projection);

  return (
    <Panel
      title="Net worth"
      loading={loading}
      error={error}
      actions={
        !error &&
        ranges.length > 0 && <PillSwitch label="Range" options={ranges} value={shown.value} onChange={setRange} />
      }
    >
      {months &&
        (rows.length < 2 ? (
          <p className="text-sm text-ink-muted">Your net worth shows here after your first month end.</p>
        ) : (
          <NetWorthChart months={visible} selectedMonth={selectedMonth} sideColumn={sideColumn} width={width} />
        ))}
    </Panel>
  );
}
