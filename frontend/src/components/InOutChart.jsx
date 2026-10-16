import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "./ui/Button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/Table";

const HEIGHT = 280;

const SERIES = [
  { key: "in_cents", name: "Money in", color: "var(--chart-series-1)" },
  { key: "out_cents", name: "Money out", color: "var(--chart-series-2)" },
];

function formatCurrency(cents) {
  return (cents / 100).toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function formatCompact(cents) {
  const dollars = cents / 100;
  if (Math.abs(dollars) >= 1000) return `$${(dollars / 1000).toFixed(1)}K`;
  return `$${Math.round(dollars)}`;
}

// "2026-03" -> Date in local time (day 1), so labels never shift a month.
function monthDate(month) {
  const [year, m] = month.split("-").map(Number);
  return new Date(year, m - 1, 1);
}

function shortLabel(month) {
  return monthDate(month).toLocaleString(undefined, { month: "short" });
}

function longLabel(month) {
  return monthDate(month).toLocaleString(undefined, { month: "long", year: "numeric" });
}

export function InOutTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="flex flex-col gap-0.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm shadow-sm">
      <span className="text-xs text-ink-secondary">{longLabel(row.month)}</span>
      {SERIES.map((s) => (
        <span key={s.key} className="flex items-center gap-2 text-ink-primary">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} aria-hidden="true" />
          {s.name}: {formatCurrency(row[s.key])}
        </span>
      ))}
      <strong className="text-ink-primary">Difference: {formatCurrency(row.in_cents - row.out_cents)}</strong>
    </div>
  );
}

/**
 * Money in vs money out, one pair of bars per month (Recharts).
 * - months: [{ month: "YYYY-MM", in_cents, out_cents }], oldest first.
 * - width: optional fixed width. Without it the chart fills its parent
 *   via ResponsiveContainer; tests pass a width because jsdom has no
 *   layout for ResponsiveContainer to measure.
 */
export function InOutChart({ months, width }) {
  const [showTable, setShowTable] = useState(false);

  const chart = (
    <BarChart data={months} width={width} height={HEIGHT} barGap={2} barCategoryGap="24%">
      <CartesianGrid vertical={false} stroke="var(--chart-gridline)" />
      <XAxis
        dataKey="month"
        tickFormatter={shortLabel}
        tick={{ fill: "var(--ink-muted)", fontSize: 11 }}
        axisLine={{ stroke: "var(--chart-baseline)" }}
        tickLine={false}
      />
      <YAxis
        tickFormatter={formatCompact}
        tick={{ fill: "var(--ink-muted)", fontSize: 11 }}
        axisLine={false}
        tickLine={false}
        width={56}
      />
      <Tooltip content={<InOutTooltip />} cursor={{ fill: "var(--border)" }} isAnimationActive={false} />
      {SERIES.map((s) => (
        <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} radius={[4, 4, 0, 0]} isAnimationActive={false} />
      ))}
    </BarChart>
  );

  const totalIn = months.reduce((sum, m) => sum + m.in_cents, 0);
  const totalOut = months.reduce((sum, m) => sum + m.out_cents, 0);

  return (
    <div className="max-w-full">
      <ul className="mb-2 flex gap-4 text-sm text-ink-secondary" aria-label="Legend">
        {SERIES.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} aria-hidden="true" />
            {s.name}
          </li>
        ))}
      </ul>

      <div
        role="img"
        aria-label={`Money in vs money out over the last ${months.length} months: ${formatCurrency(totalIn)} in, ${formatCurrency(totalOut)} out`}
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

      <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => setShowTable((v) => !v)}>
        {showTable ? "Hide table" : "Show as table"}
      </Button>

      {showTable && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Month</TableHead>
              <TableHead>Money in</TableHead>
              <TableHead>Money out</TableHead>
              <TableHead>Difference</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {months.map((m) => (
              <TableRow key={m.month}>
                <TableCell>{longLabel(m.month)}</TableCell>
                <TableCell>{formatCurrency(m.in_cents)}</TableCell>
                <TableCell>{formatCurrency(m.out_cents)}</TableCell>
                <TableCell>{formatCurrency(m.in_cents - m.out_cents)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
