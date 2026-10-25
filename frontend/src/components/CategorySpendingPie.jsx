import { ChevronRight } from "lucide-react";
import { useId, useState } from "react";
import { Pie, PieChart, Sector } from "recharts";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { OTHER_KEY, UNCATEGORIZED_KEY, buildPieSlices, buildRows } from "../lib/categorySpending";
import { cn } from "../lib/cn";
import { formatMoney } from "../lib/money";
import { Button } from "./ui/Button";
import { CategorySpendingTable } from "./CategorySpendingChart";

// A drilled-in donut shows its parent's colour stepped down by opacity.
const DRILL_OPACITY = [1, 0.78, 0.6, 0.45, 0.34];
const DRILL_OPACITY_FLOOR = 0.28;

function rankColor(slice, index) {
  if (slice.key === OTHER_KEY) return "var(--chart-other)";
  return `var(--chart-cat-${index + 1})`;
}

function sharePercent(cents, total) {
  return total > 0 ? Math.round((cents / total) * 100) : 0;
}

// Stripes for Uncategorized, used by its slice and its legend swatch.
function HatchPattern({ id }) {
  return (
    <svg width="0" height="0" className="absolute" aria-hidden="true">
      <defs>
        <pattern id={id} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" fill="var(--surface-2)" />
          <rect width="3" height="6" fill="var(--chart-series-2)" />
        </pattern>
      </defs>
    </svg>
  );
}

function LegendRow({ slice, total, active, onActivate, onDeactivate, onDrill }) {
  const drillable = slice.children?.length > 0 && onDrill;
  const content = (
    <>
      {/* An SVG swatch, so Uncategorized's url(#pattern) fill resolves -
          as a CSS background it would load the page URL as an image. */}
      <svg className="h-2.5 w-2.5 shrink-0" viewBox="0 0 10 10" aria-hidden="true">
        <rect width="10" height="10" rx="2" fill={slice.fill} fillOpacity={slice.opacity} />
      </svg>
      <span className="min-w-0 flex-1 truncate text-ink-primary">{slice.name}</span>
      <span className="shrink-0 tabular-nums text-ink-primary">{formatMoney(slice.cents)}</span>
      <span className="w-10 shrink-0 text-right tabular-nums text-ink-muted">{sharePercent(slice.cents, total)}%</span>
      <span className="w-3.5 shrink-0" aria-hidden="true">
        {drillable && <ChevronRight className="h-3.5 w-3.5 text-ink-muted" />}
      </span>
    </>
  );
  const className = cn(
    "flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left text-sm transition-colors",
    active && "bg-surface-2",
  );
  const hover = { onMouseEnter: onActivate, onMouseLeave: onDeactivate, onFocus: onActivate, onBlur: onDeactivate };

  return (
    <li>
      {drillable ? (
        <button
          type="button"
          className={cn(className, "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent")}
          onClick={onDrill}
          {...hover}
        >
          {content}
        </button>
      ) : (
        <div className={className} {...hover}>
          {content}
        </div>
      )}
    </li>
  );
}

/**
 * The month's spending as a donut with a legend beside it (below it on a
 * phone). The six largest categories are coloured by rank, the rest fold
 * into "Other", and Uncategorized is hatched. A parent or "Other" drills
 * into its parts. See the category-spending-pie design.
 * - data: the /api/reports/category-spending/ payload.
 * - monthLabel: e.g. "March 2026", used in the empty state.
 * - showTable: shows the same table as the bars view.
 * - animate: false in tests; jsdom has no animation frames to wait for.
 */
export function CategorySpendingPie({ data, monthLabel, showTable = false, animate = true }) {
  const isWide = useMediaQuery("(min-width: 640px)");
  const hatchId = `hatch-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const [drillKey, setDrillKey] = useState(null);
  const [activeKey, setActiveKey] = useState(null);

  const rows = buildRows(data);
  if (rows.length === 0) {
    return <p className="py-6 text-sm text-ink-secondary">No spending in {monthLabel}.</p>;
  }

  const topSlices = buildPieSlices(rows).map((slice, index) => ({
    ...slice,
    fill: slice.key === UNCATEGORIZED_KEY ? `url(#${hatchId})` : rankColor(slice, index),
    opacity: 1,
  }));
  const parent = drillKey ? topSlices.find((s) => s.key === drillKey) : null;
  const slices = parent
    ? parent.children.map((child, index) => ({
        ...child,
        fill: parent.fill,
        opacity: DRILL_OPACITY[index] ?? DRILL_OPACITY_FLOOR,
      }))
    : topSlices;

  const total = parent ? parent.cents : slices.reduce((sum, s) => sum + s.cents, 0);
  const active = slices.find((s) => s.key === activeKey) ?? null;
  const size = isWide ? 200 : 180;

  function drill(key) {
    setActiveKey(null);
    setDrillKey(key);
  }

  function renderSector(props) {
    const isActive = active && props.payload.key === active.key;
    return (
      <Sector
        {...props}
        outerRadius={props.outerRadius + (isActive ? 6 : 0)}
        fill={props.payload.fill}
        fillOpacity={props.payload.opacity}
        style={{ opacity: active && !isActive ? 0.45 : 1, transition: "opacity 150ms" }}
        className={props.payload.children?.length > 0 && !parent ? "cursor-pointer" : undefined}
      />
    );
  }

  return (
    <div className="max-w-full">
      <HatchPattern id={hatchId} />
      <div className="grid items-center gap-6 sm:grid-cols-[200px_1fr]">
        <div className="relative mx-auto" style={{ width: size, height: size }}>
          <PieChart width={size} height={size}>
            <Pie
              key={drillKey ?? "all"}
              data={slices}
              dataKey="cents"
              nameKey="name"
              innerRadius="62%"
              outerRadius="94%"
              paddingAngle={slices.length > 1 ? 1.5 : 0}
              cornerRadius={3}
              stroke="var(--surface)"
              strokeWidth={2}
              startAngle={90}
              endAngle={-270}
              isAnimationActive={animate}
              animationDuration={400}
              animationEasing="ease-out"
              shape={renderSector}
              onMouseEnter={(slice) => setActiveKey(slice.payload.key)}
              onMouseLeave={() => setActiveKey(null)}
              onClick={(slice) => {
                if (!parent && slice.payload.children?.length > 0) drill(slice.payload.key);
              }}
            />
          </PieChart>
          <div
            className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-8 text-center"
            data-testid="pie-centre"
          >
            <span className="max-w-full truncate text-xs text-ink-muted">
              {active ? active.name : parent ? parent.name : "Spent"}
            </span>
            <span className="text-xl font-semibold tabular-nums text-ink-primary">
              {formatMoney(active ? active.cents : total)}
            </span>
            {active && <span className="text-xs text-ink-muted">{sharePercent(active.cents, total)}%</span>}
          </div>
        </div>

        <div className="min-w-0">
          {parent && (
            <Button type="button" variant="ghost" size="sm" className="mb-1 -ml-1.5" onClick={() => drill(null)}>
              ← All categories
            </Button>
          )}
          <ul aria-label={`Spending share per category in ${monthLabel}`}>
            {slices.map((slice) => (
              <LegendRow
                key={slice.key}
                slice={slice}
                total={total}
                active={active?.key === slice.key}
                onActivate={() => setActiveKey(slice.key)}
                onDeactivate={() => setActiveKey(null)}
                onDrill={parent ? null : () => drill(slice.key)}
              />
            ))}
          </ul>
        </div>
      </div>

      {showTable && <CategorySpendingTable rows={rows} />}
    </div>
  );
}
