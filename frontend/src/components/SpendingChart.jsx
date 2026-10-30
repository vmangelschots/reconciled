import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Rectangle, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartTooltip } from "./ui/ChartTooltip";
import { HatchPattern } from "./ui/HatchPattern";
import { cn } from "../lib/cn";
import { formatMoneyCompact, formatMoneyWhole } from "../lib/money";
import { monthLabel } from "../lib/months";
import { HATCH_ID, OTHER_KEY, chartRows } from "../lib/spendingReport";

const HEIGHT = 280;
const DIMMED = 0.45;

const whole = (cents) => formatMoneyWhole(cents);

function shortMonth(month) {
  const [year, m] = month.split("-").map(Number);
  return new Date(year, m - 1, 1).toLocaleString(undefined, { month: "short" });
}

export function SpendingTooltip({ active, payload, series }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const lines = series.filter((s) => row[s.key]);
  return (
    <ChartTooltip title={monthLabel(row.month)}>
      {[...lines].reverse().map((s) => (
        <span key={s.key} className="flex items-center gap-2 text-ink-primary">
          <Swatch color={s.color} />
          <span className="flex-1">{s.name}</span>
          <span className="num">{whole(row[s.key])}</span>
        </span>
      ))}
      <strong className="text-ink-primary">Total: {whole(lines.reduce((sum, s) => sum + row[s.key], 0))}</strong>
    </ChartTooltip>
  );
}

// An SVG swatch, so Uncategorized's url(#pattern) fill resolves.
function Swatch({ color }) {
  return (
    <svg className="h-2.5 w-2.5 shrink-0" viewBox="0 0 10 10" aria-hidden="true">
      <rect width="10" height="10" rx="2" fill={color} />
    </svg>
  );
}

// A segment with a surface-coloured edge for the gap between segments,
// rounded only when it tops its stack.
function Segment({ topKey, dataKey, payload, ...props }) {
  const top = topKey(payload) === dataKey;
  return <Rectangle {...props} radius={top ? [4, 4, 0, 0] : 0} stroke="var(--surface)" strokeWidth={2} />;
}

/**
 * Spending per month as stacked bars (Recharts). See specs/spending-report.
 * - report: the report; series: from buildSeries, bottom of the stack first.
 * - highlight: a series to keep undimmed, from hovering a table row.
 * - onMonthHover(month | null): the month under the pointer.
 * - onSelect(series, month): a segment was picked; left out on touch
 *   screens, where a tap only shows the tooltip.
 * - width: optional fixed width; tests pass one, as jsdom has no layout.
 */
export function SpendingChart({ report, series, highlight, onMonthHover, onSelect, width }) {
  const [isolated, setIsolated] = useState(null);
  const shown = isolated ? series.filter((s) => s.key === isolated) : series;
  const rows = useMemo(() => chartRows(report, series), [report, series]);

  const topKey = (row) => {
    const positive = shown.filter((s) => row[s.key] > 0);
    return positive[positive.length - 1]?.key;
  };

  function toggle(key) {
    setIsolated((current) => (current === key ? null : key));
  }

  const chart = (
    <BarChart
      data={rows}
      width={width}
      height={HEIGHT}
      stackOffset="sign"
      barCategoryGap="28%"
      onMouseMove={(state) => onMonthHover?.(rows[state?.activeTooltipIndex]?.month ?? null)}
      onMouseLeave={() => onMonthHover?.(null)}
    >
      <CartesianGrid vertical={false} stroke="var(--chart-gridline)" />
      <XAxis
        dataKey="month"
        tickFormatter={shortMonth}
        tick={{ fill: "var(--ink-muted)", fontSize: 11 }}
        axisLine={{ stroke: "var(--chart-baseline)" }}
        tickLine={false}
      />
      <YAxis
        tickFormatter={formatMoneyCompact}
        tick={{ fill: "var(--ink-muted)", fontSize: 11 }}
        axisLine={false}
        tickLine={false}
        width={56}
      />
      <Tooltip
        content={<SpendingTooltip series={shown} />}
        cursor={{ fill: "var(--border)" }}
        isAnimationActive={false}
      />
      {shown.map((s) => (
        <Bar
          key={s.key}
          dataKey={s.key}
          name={s.name}
          stackId="spending"
          fill={s.color}
          fillOpacity={highlight && highlight !== s.key ? DIMMED : 1}
          shape={<Segment topKey={topKey} />}
          cursor={onSelect || s.key === OTHER_KEY ? "pointer" : undefined}
          isAnimationActive={false}
          onClick={(_, index) => {
            if (s.key === OTHER_KEY) {
              if (onSelect) toggle(s.key);
            } else {
              onSelect?.(s, rows[index].month);
            }
          }}
        />
      ))}
    </BarChart>
  );

  return (
    <div className="max-w-full">
      <HatchPattern id={HATCH_ID} />
      <ul className="mb-2 flex flex-wrap gap-x-1 gap-y-1 text-sm text-ink-secondary" aria-label="Legend">
        {series.map((s) => (
          <li key={s.key}>
            <button
              type="button"
              aria-pressed={isolated === s.key}
              onClick={() => toggle(s.key)}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-1.5 py-0.5 transition-colors hover:text-ink-primary",
                isolated === s.key && "bg-surface-2 text-ink-primary",
                isolated && isolated !== s.key && "opacity-50",
              )}
            >
              <Swatch color={s.color} />
              {s.name}
            </button>
          </li>
        ))}
      </ul>
      <div role="img" aria-label="Spending per month, stacked by category" className="rounded-lg bg-surface">
        {width ? (
          chart
        ) : (
          <ResponsiveContainer width="100%" height={HEIGHT}>
            {chart}
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
