import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartTooltip } from "./ui/ChartTooltip";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/Table";
import { BelowZeroGradient, LowLabel, PointLabel, belowZeroStroke, showsLow } from "./chart/projection";
import { staleImports } from "../lib/importFreshness";
import { formatMoneyCompact, formatMoneyWhole } from "../lib/money";
import { formatDayMonth } from "../lib/yearlyBudgets";

const HEIGHT = 240;
// Below this many days there's no line worth drawing.
const MIN_POINTS = 3;
const GRADIENT_ID = "everyday-projection-stroke";

const whole = (cents) => formatMoneyWhole(cents);

function localDate(isoDate) {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function longDay(isoDate) {
  return localDate(isoDate).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

function shortMonth(isoDate) {
  return localDate(isoDate).toLocaleDateString(undefined, { month: "short" });
}

// One row per day: history in `balance_cents`, the projection in
// `projected_cents`. Today carries both, so the two lines join.
function buildRows(points, projection) {
  const rows = new Map();
  points.forEach((p, i) => {
    const previous = points[i - 1];
    rows.set(p.date, {
      date: p.date,
      balance_cents: p.balance_cents,
      change_cents: previous ? p.balance_cents - previous.balance_cents : null,
    });
  });
  (projection ?? []).forEach((p, i) => {
    const previous = projection[i - 1];
    const row = rows.get(p.date) ?? { date: p.date };
    rows.set(p.date, {
      ...row,
      projected_cents: p.balance_cents,
      change_cents: row.balance_cents === undefined && previous ? p.balance_cents - previous.balance_cents : row.change_cents,
    });
  });
  return [...rows.values()];
}

export function EverydayTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const projected = row.balance_cents === undefined;
  return (
    <ChartTooltip title={`${longDay(row.date)}${projected ? " · Projected" : ""}`}>
      <strong className="text-ink-primary">{whole(projected ? row.projected_cents : row.balance_cents)}</strong>
      {row.change_cents != null && (
        <span className="text-xs text-ink-muted">{formatMoneyWhole(row.change_cents, { signed: true })}</span>
      )}
    </ChartTooltip>
  );
}

function Caption({ data, stale }) {
  const { projection, end, current } = data;
  return (
    <div className="-mt-2 mb-3 flex flex-wrap gap-x-3 text-xs text-ink-muted">
      {current ? (
        <>
          <span>Last 90 days</span>
          {projection ? (
            <>
              {data.has_income === false && (
                <Link to="/forecast?days=30" className="text-ink-muted underline-offset-2 hover:text-accent hover:underline">
                  No income expected
                </Link>
              )}
              {stale && <span className="text-warning">{stale}</span>}
            </>
          ) : (
            <Link to="/forecast?days=30" className="text-accent hover:underline">
              Add expected income
            </Link>
          )}
        </>
      ) : (
        <span>To {formatDayMonth(end)}</span>
      )}
    </div>
  );
}

/**
 * The everyday balance per day with its dashed projection (Recharts). See
 * specs/balance-history.
 * - data: { tier, current, end, points, projection, lowest, has_income }
 *   from the report; a projection only comes with the current month. Without
 *   expected income it isn't painted in the critical colour.
 * - accounts: the overview's accounts, for the stale-import note.
 * - showTable: the table view, toggled from the panel's header.
 * - width: optional fixed width; tests pass one, as jsdom has no layout.
 */
export function EverydayMoneyChart({ data, accounts = [], showTable = false, width }) {
  const { points, projection, lowest, end, tier, current } = data;
  const rows = useMemo(() => buildRows(points, projection), [points, projection]);
  const ticks = useMemo(() => rows.filter((r) => r.date.endsWith("-01")).map((r) => r.date), [rows]);
  const stale = staleImports(accounts.filter((a) => a.tier === tier))?.text;

  if (points.length === 0 && !projection) {
    return <p className="text-sm text-ink-muted">No history yet.</p>;
  }

  const tooShort = points.length < MIN_POINTS;
  const last = points[points.length - 1];
  const todayBalance = projection?.[0].balance_cents ?? last?.balance_cents;
  const showLow = projection && showsLow(lowest, todayBalance);
  const critical = data.has_income !== false;
  const projectionValues = projection?.map((p) => p.balance_cents) ?? [];
  const drawn = tooShort ? rows.filter((r) => r.projected_cents !== undefined) : rows;

  const chart = (
    <ComposedChart data={drawn} width={width} height={HEIGHT} margin={{ top: 24, right: 8, left: 0, bottom: 0 }}>
      {projection && <BelowZeroGradient id={GRADIENT_ID} values={projectionValues} />}
      <CartesianGrid vertical={false} stroke="var(--chart-gridline)" />
      <XAxis
        dataKey="date"
        ticks={ticks}
        tickFormatter={shortMonth}
        tick={{ fill: "var(--ink-muted)", fontSize: 11 }}
        axisLine={{ stroke: "var(--chart-baseline)" }}
        tickLine={false}
      />
      <YAxis
        domain={[(min) => Math.min(min, 0), "auto"]}
        tickFormatter={formatMoneyCompact}
        tickCount={4}
        tick={{ fill: "var(--ink-muted)", fontSize: 11 }}
        axisLine={false}
        tickLine={false}
        width={56}
      />
      <Tooltip
        content={<EverydayTooltip />}
        cursor={{ stroke: "var(--ink-muted)", strokeWidth: 1 }}
        isAnimationActive={false}
      />
      {!tooShort && (
        <Area
          dataKey="balance_cents"
          type="linear"
          stroke="var(--chart-series-1)"
          strokeWidth={2}
          fill="var(--chart-area)"
          fillOpacity={1}
          dot={false}
          activeDot={{ r: 4, className: "chart-hover-dot" }}
          isAnimationActive={false}
        />
      )}
      {projection && (
        <Line
          dataKey="projected_cents"
          type="stepAfter"
          stroke={belowZeroStroke(projectionValues, GRADIENT_ID, critical)}
          strokeWidth={2}
          strokeDasharray="5 5"
          dot={false}
          activeDot={{ r: 4, className: "chart-hover-dot" }}
          isAnimationActive={false}
        />
      )}
      {projection && (
        <ReferenceLine
          x={projection[0].date}
          stroke="var(--chart-baseline)"
          label={{ value: "Today", position: "top", fill: "var(--ink-muted)", fontSize: 11 }}
        />
      )}
      {current && todayBalance !== undefined && (
        <ReferenceDot
          x={end}
          y={todayBalance}
          r={4}
          fill="var(--chart-series-1)"
          stroke="var(--surface)"
          strokeWidth={2}
          label={<PointLabel text={whole(todayBalance)} className="chart-end-label" />}
        />
      )}
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
    <div className="max-w-full">
      <Caption data={data} stale={stale} />
      {tooShort && points.length > 0 && (
        <p className="mb-2 text-sm text-ink-muted">History starts {formatDayMonth(points[0].date)}.</p>
      )}
      {(!tooShort || projection) && (
        <div
          role="img"
          aria-label={`Everyday balance over time${last ? `, ending at ${whole(last.balance_cents)}` : ""}`}
          className="rounded-lg bg-surface"
        >
          {width ? (
            chart
          ) : (
            <ResponsiveContainer width="100%" height={HEIGHT}>
              {chart}
            </ResponsiveContainer>
          )}
        </div>
      )}
      {showTable && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Day</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead className="text-right">Change</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const projected = r.balance_cents === undefined;
              return (
                <TableRow key={r.date}>
                  <TableCell>
                    {longDay(r.date)}
                    {projected && <span className="text-ink-muted"> · Projected</span>}
                  </TableCell>
                  <TableCell className="num text-right">{whole(projected ? r.projected_cents : r.balance_cents)}</TableCell>
                  <TableCell className="num text-right">
                    {r.change_cents != null ? formatMoneyWhole(r.change_cents, { signed: true }) : ""}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
