import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { cn } from "../lib/cn";
import { Button } from "./ui/Button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/Table";

const UNCATEGORIZED_KEY = "uncategorized";

function formatCurrency(cents) {
  return (cents / 100).toLocaleString(undefined, { style: "currency", currency: "USD" });
}

// Flattens the API payload into top-level rows (Uncategorized included),
// largest first. Each expandable row carries its child rows: subcategories
// plus "<Parent> (direct)" for spending booked on the parent itself.
function buildRows(data) {
  const rows = data.categories.map((c) => {
    const children = c.subcategories.map((s) => ({ key: `c${s.category_id}`, name: s.name, cents: s.spent_cents }));
    if (children.length > 0 && c.direct_cents > 0) {
      children.push({ key: `d${c.category_id}`, name: `${c.name} (direct)`, cents: c.direct_cents });
    }
    children.sort((a, b) => b.cents - a.cents);
    return { key: `c${c.category_id}`, name: c.name, cents: c.spent_cents, children };
  });
  if (data.uncategorized_cents > 0) {
    rows.push({ key: UNCATEGORIZED_KEY, name: "Uncategorized", cents: data.uncategorized_cents, children: [] });
  }
  return rows.sort((a, b) => b.cents - a.cents);
}

function BarRow({ row, max, total, depth = 0, expanded, onToggle }) {
  const [hovered, setHovered] = useState(false);
  const expandable = row.children?.length > 0;
  const share = total > 0 ? Math.round((row.cents / total) * 100) : 0;

  const label = (
    <span className={cn("flex min-w-0 items-center gap-1 text-sm", depth > 0 ? "pl-5 text-ink-secondary" : "text-ink-primary")}>
      {expandable && (
        <ChevronRight
          className={cn("h-3.5 w-3.5 shrink-0 transition-transform", expanded && "rotate-90")}
          aria-hidden="true"
        />
      )}
      <span className="break-words">{row.name}</span>
    </span>
  );

  return (
    <li
      className="grid grid-cols-[minmax(6rem,12rem)_1fr] items-center gap-3 py-1"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {expandable ? (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={onToggle}
          className="rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {label}
        </button>
      ) : (
        label
      )}
      <div className="relative flex items-center gap-2">
        <div
          className={cn("h-4 rounded-r-[4px]", depth > 0 && "opacity-70")}
          style={{ width: `${Math.max((row.cents / max) * 100, 0.5)}%`, background: "var(--chart-series-1)" }}
          aria-hidden="true"
        />
        <span className="shrink-0 text-sm tabular-nums text-ink-primary">{formatCurrency(row.cents)}</span>
        {hovered && (
          <span
            role="tooltip"
            className="pointer-events-none absolute -top-7 left-0 rounded-md border border-border bg-surface px-2 py-0.5 text-xs text-ink-secondary shadow-sm"
          >
            {row.name}: {formatCurrency(row.cents)} · {share}% of the month&apos;s spending
          </span>
        )}
      </div>
    </li>
  );
}

/**
 * Horizontal spending bars for one month, largest first. Plain HTML
 * rather than SVG/Recharts: rows expand into subcategories and long
 * names wrap, which an SVG layout handles poorly.
 * - data: the /api/reports/category-spending/ payload.
 * - monthLabel: e.g. "March 2026", used in the empty state.
 */
export function CategorySpendingChart({ data, monthLabel }) {
  const [expanded, setExpanded] = useState(() => new Set());
  const [showTable, setShowTable] = useState(false);
  const rows = buildRows(data);

  if (rows.length === 0) {
    return <p className="py-6 text-sm text-ink-secondary">No spending in {monthLabel}.</p>;
  }

  const total = rows.reduce((sum, r) => sum + r.cents, 0);
  const max = rows[0].cents;

  function toggle(key) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="max-w-full">
      <ul aria-label={`Spending per category in ${monthLabel}`}>
        {rows.flatMap((row) => [
          <BarRow
            key={row.key}
            row={row}
            max={max}
            total={total}
            expanded={expanded.has(row.key)}
            onToggle={() => toggle(row.key)}
          />,
          ...(expanded.has(row.key)
            ? row.children.map((child) => <BarRow key={child.key} row={child} max={max} total={total} depth={1} />)
            : []),
        ])}
      </ul>

      <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => setShowTable((v) => !v)}>
        {showTable ? "Hide table" : "Show as table"}
      </Button>

      {showTable && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Category</TableHead>
              <TableHead>Spent</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.flatMap((row) => [
              <TableRow key={row.key}>
                <TableCell>{row.name}</TableCell>
                <TableCell>{formatCurrency(row.cents)}</TableCell>
              </TableRow>,
              ...row.children.map((child) => (
                <TableRow key={child.key}>
                  <TableCell className="pl-8 text-ink-secondary">{child.name}</TableCell>
                  <TableCell>{formatCurrency(child.cents)}</TableCell>
                </TableRow>
              )),
            ])}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
