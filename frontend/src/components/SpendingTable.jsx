import { ChevronRight } from "lucide-react";
import { Fragment, useLayoutEffect, useRef, useState } from "react";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/Table";
import { cn } from "../lib/cn";
import { formatMoneyWhole } from "../lib/money";
import { UNCATEGORIZED_KEY, rowKey, seriesKeyFor } from "../lib/spendingReport";

const whole = (cents) => formatMoneyWhole(cents);

const NAME_CELL = "sticky left-0 z-10 w-32 min-w-32 bg-surface pl-5 pr-2.5 lg:w-auto lg:min-w-44";
const CELL = "num h-9 px-2.5 py-1 text-right whitespace-nowrap";
const TOTAL = "bg-surface-2/60 font-medium";
const AVG = "bg-surface-2/60 text-ink-secondary";

function shortMonth(month) {
  const [year, m] = month.split("-").map(Number);
  return new Date(year, m - 1, 1).toLocaleString(undefined, { month: "short" });
}

function Dash() {
  return <span className="text-ink-muted">–</span>;
}

function Figure({ cents }) {
  return cents == null || cents === 0 ? <Dash /> : whole(cents);
}

// Total and Avg sit after the months on a wide screen, and first on a
// phone, so the first screen answers the question.
function columns(report, wide) {
  const months = report.months.map((month, i) => ({ kind: "month", month, index: i }));
  const summary = [{ kind: "total" }, { kind: "avg" }];
  return wide ? [...months, ...summary] : [...summary, ...[...months].reverse()];
}

function summaryClass(column, wide) {
  if (column.kind === "total") return cn(TOTAL, wide ? "border-l border-border" : "");
  if (column.kind === "avg") return cn(AVG, wide ? "pr-5" : "border-r border-border");
  return null;
}

function cellValue(column, figures) {
  if (column.kind === "total") return figures.total_cents;
  if (column.kind === "avg") return figures.avg_cents;
  return figures.cents[column.index];
}

function CategoryRow({ figures, name, swatch, depth = 0, cols, wide, hoverMonth, onHover, onSelect, expanded, onToggle }) {
  const expandable = Boolean(onToggle);
  const label = (
    <>
      {expandable && (
        <ChevronRight
          className={cn("h-3.5 w-3.5 shrink-0 transition-transform", expanded && "rotate-90")}
          aria-hidden="true"
        />
      )}
      {swatch && (
        <svg className="h-2.5 w-2.5 shrink-0" viewBox="0 0 10 10" aria-hidden="true">
          <rect width="10" height="10" rx="2" fill={swatch} />
        </svg>
      )}
      <span className="min-w-0 truncate" title={name}>
        {name}
      </span>
    </>
  );
  return (
    <TableRow className={cn("group", depth > 0 && "border-0")} onMouseEnter={onHover}>
      <TableCell
        className={cn(
          NAME_CELL,
          "group-hover:bg-surface-2",
          depth > 0 ? "h-8 py-1 pl-10 text-ink-secondary" : "h-9 py-1 font-medium",
        )}
      >
        {expandable ? (
          <button
            type="button"
            aria-expanded={expanded}
            onClick={onToggle}
            className="flex w-full min-w-0 items-center gap-1.5 text-left"
          >
            {label}
          </button>
        ) : (
          <span className={cn("flex min-w-0 items-center gap-1.5", depth === 0 && "pl-5")}>{label}</span>
        )}
      </TableCell>
      {cols.map((column) => {
        const cents = cellValue(column, figures);
        const clickable = column.kind === "month" && cents !== 0;
        return (
          <TableCell
            key={column.kind === "month" ? column.month : column.kind}
            className={cn(
              CELL,
              depth > 0 && "h-8 text-ink-secondary",
              summaryClass(column, wide),
              column.kind === "month" && column.month === hoverMonth && "bg-surface-2",
            )}
          >
            {clickable ? (
              <button
                type="button"
                className="num rounded-sm hover:text-accent hover:underline"
                onClick={() => onSelect(column.month)}
              >
                <Figure cents={cents} />
              </button>
            ) : (
              <Figure cents={cents} />
            )}
          </TableCell>
        );
      })}
    </TableRow>
  );
}

function SectionRow({ name, span }) {
  return (
    <tr>
      <td
        colSpan={span}
        className="bg-surface pt-4 pb-1 pl-5 text-xs font-medium tracking-wide text-ink-muted uppercase"
      >
        <span className="sticky left-5">{name}</span>
      </td>
    </tr>
  );
}

function SummaryRow({ name, cols, wide, value, tone, strong }) {
  return (
    <tr className={cn("bg-surface-2/60", strong && "font-semibold")}>
      <td className={cn(NAME_CELL, "bg-surface-2 py-1.5 align-middle text-ink-primary")}>{name}</td>
      {cols.map((column) => (
        <td
          key={column.kind === "month" ? column.month : column.kind}
          className={cn(CELL, "text-ink-primary", tone?.(column), column.kind !== "month" && summaryClass(column, wide))}
        >
          {value(column)}
        </td>
      ))}
    </tr>
  );
}

// One section's category rows, closed by the uncategorized row, if any.
function CategoryRows({ rows, loose, looseName, income, colors, open, onToggle, series, onHoverSeries, onSelect, ...shared }) {
  return (
    <>
      {rows.map((row) => {
        const key = rowKey(row);
        const expandable = row.children.length > 0;
        const expanded = open.has(key);
        const onHover = () => onHoverSeries?.(seriesKeyFor(key, series));
        return (
          <Fragment key={key}>
            <CategoryRow
              {...shared}
              onHover={onHover}
              figures={row}
              name={row.name}
              swatch={colors[key]}
              expanded={expanded}
              onToggle={expandable ? () => onToggle(key) : undefined}
              onSelect={(month) => onSelect({ category: row.category_id, income, month })}
            />
            {expanded &&
              row.children.map((child) => (
                <CategoryRow
                  {...shared}
                  key={`${child.category_id}-${child.direct}`}
                  onHover={onHover}
                  depth={1}
                  figures={child}
                  name={child.name}
                  onSelect={(month) => onSelect({ category: child.category_id, direct: child.direct, income, month })}
                />
              ))}
          </Fragment>
        );
      })}
      {loose && (
        <CategoryRow
          {...shared}
          onHover={() => onHoverSeries?.(income ? null : UNCATEGORIZED_KEY)}
          figures={loose}
          name={looseName}
          swatch={income ? undefined : colors[UNCATEGORIZED_KEY]}
          onSelect={(month) => onSelect({ category: UNCATEGORIZED_KEY, income, month })}
        />
      )}
    </>
  );
}

/**
 * The profit and loss: Income and Expenses, categories by months with Total
 * and Avg, then Net and Savings rate. See specs/spending-report.
 * - series: the chart's series, for swatches and to say which row is hovered.
 * - onHoverSeries(key | null), hoverMonth: shared with the chart.
 * - onSelect({ category, direct, income, month }): a month cell was picked.
 * - wide: the wide-screen column order.
 */
export function SpendingTable({ report, series, wide, hoverMonth, onHoverSeries, onSelect }) {
  const [open, setOpen] = useState(() => new Set());
  const scroller = useRef(null);
  const cols = columns(report, wide);
  const span = cols.length + 1;
  const colors = Object.fromEntries(series.map((s) => [s.key, s.color]));
  const hasIncome = report.income_categories.length > 0 || report.uncategorized_income;
  const hasExpenses = report.categories.length > 0 || report.uncategorized;

  // Too wide to fit: start at the end, so Total and Avg show. The table
  // can still change width after it first lays out.
  useLayoutEffect(() => {
    const element = scroller.current;
    if (!wide || !element) return undefined;
    const toEnd = () => {
      element.scrollLeft = element.scrollWidth;
    };
    toEnd();
    const observer = new ResizeObserver(toEnd);
    observer.observe(element.firstElementChild);
    return () => observer.disconnect();
  }, [report, wide]);

  function toggle(key) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }

  const figure = (figures) => (column) => <Figure cents={cellValue(column, figures)} />;
  const rate = (column) => {
    const percent = column.kind === "month" ? report.savings_rate.percents[column.index] : report.savings_rate.total;
    return column.kind === "avg" || percent == null ? <Dash /> : `${percent}%`;
  };
  const netTone = (column) => (cellValue(column, report.net) > 0 ? "text-positive" : undefined);
  const shared = { cols, wide, hoverMonth, colors, open, onToggle: toggle, series, onHoverSeries, onSelect };

  return (
    <div ref={scroller} className="w-full overflow-x-auto">
      <table className="w-full text-[13px]">
        <TableHeader>
          <tr>
            <TableHead className={cn(NAME_CELL, "bg-surface-2")}>Category</TableHead>
            {cols.map((column) => {
              if (column.kind !== "month") {
                const full = report.full_months.length;
                return (
                  <TableHead
                    key={column.kind}
                    className={cn("px-2.5 text-right", column.kind === "avg" && "min-w-20", summaryClass(column, wide))}
                  >
                    {column.kind === "total" ? "Total" : "Avg"}
                    {column.kind === "avg" && full >= 2 && (
                      <span className="block whitespace-nowrap text-[10px] font-normal normal-case tracking-normal">
                        {full} full months
                      </span>
                    )}
                  </TableHead>
                );
              }
              const partial = !report.full_months.includes(column.month);
              return (
                <TableHead
                  key={column.month}
                  className={cn("px-2.5 text-right", column.month === hoverMonth && "bg-surface-2")}
                >
                  {shortMonth(column.month)}
                  {column.month.endsWith("-01") && (
                    <span className="block text-[10px] font-normal tracking-normal">{column.month.slice(0, 4)}</span>
                  )}
                  {column.month === report.current_month && partial && (
                    <span className="block whitespace-nowrap text-[10px] font-normal normal-case tracking-normal">
                      so far
                    </span>
                  )}
                </TableHead>
              );
            })}
          </tr>
        </TableHeader>
        <TableBody onMouseLeave={() => onHoverSeries?.(null)}>
          {hasIncome && (
            <>
              <SectionRow name="Income" span={span} />
              <CategoryRows
                {...shared}
                income
                rows={report.income_categories}
                loose={report.uncategorized_income}
                looseName="Uncategorized income"
              />
              <SummaryRow name="Total income" strong cols={cols} wide={wide} value={figure(report.income)} />
            </>
          )}
          {hasExpenses && (
            <>
              <SectionRow name="Expenses" span={span} />
              <CategoryRows
                {...shared}
                rows={report.categories}
                loose={report.uncategorized}
                looseName="Uncategorized"
              />
              <SummaryRow name="Total expenses" strong cols={cols} wide={wide} value={figure(report.spending)} />
            </>
          )}
        </TableBody>
        <tfoot className="border-t border-border">
          <SummaryRow name="Net" strong cols={cols} wide={wide} value={figure(report.net)} tone={netTone} />
          <SummaryRow name="Savings rate" cols={cols} wide={wide} value={rate} tone={() => "text-ink-secondary"} />
        </tfoot>
      </table>
    </div>
  );
}
