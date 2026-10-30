// Shared by the Reports page's chart, table and sheet, so they all read the
// report the same way. See specs/spending-report.

export const OTHER_KEY = "other";
export const UNCATEGORIZED_KEY = "uncategorized";
export const HATCH_ID = "report-uncategorized-hatch";

const TOP = 6;
// Neighbours in the stack have to be told apart, so this isn't the pie's
// order: there orange and rose touch only through a gap and a legend.
const COLOR_ORDER = [1, 3, 4, 5, 2, 6];

export const rowKey = (row) => `c${row.category_id}`;

// The stack, bottom to top: the TOP largest categories over the period,
// Other holding the rest, then Uncategorized. Each keeps one colour.
export function buildSeries(report) {
  const ranked = [...report.categories].sort((a, b) => b.total_cents - a.total_cents);
  const series = ranked.slice(0, TOP).map((row, i) => ({
    key: rowKey(row),
    name: row.name,
    categoryId: row.category_id,
    color: `var(--chart-cat-${COLOR_ORDER[i]})`,
    cents: row.cents,
  }));
  const tail = ranked.slice(TOP);
  if (tail.length > 0) {
    series.push({
      key: OTHER_KEY,
      name: "Other",
      color: "var(--chart-other)",
      cents: report.months.map((_, i) => tail.reduce((sum, row) => sum + row.cents[i], 0)),
      members: tail.map(rowKey),
    });
  }
  if (report.uncategorized) {
    series.push({
      key: UNCATEGORIZED_KEY,
      name: "Uncategorized",
      categoryId: UNCATEGORIZED_KEY,
      color: `url(#${HATCH_ID})`,
      cents: report.uncategorized.cents,
    });
  }
  return series;
}

// The chart's rows: one per month, with each series' cents under its key.
export function chartRows(report, series) {
  return report.months.map((month, i) => ({
    month,
    ...Object.fromEntries(series.map((s) => [s.key, s.cents[i]])),
  }));
}

// Which series a table row belongs to: its own, or its parent's or Other
// when it has none of its own.
export function seriesKeyFor(key, series) {
  if (series.some((s) => s.key === key)) return key;
  return series.find((s) => s.members?.includes(key))?.key ?? null;
}
