// Shared by CategorySpendingChart (bars, table) and CategorySpendingPie,
// so every view of a month's spending shows the same figures.

export const UNCATEGORIZED_KEY = "uncategorized";
export const OTHER_KEY = "other";

// How many categories the donut colours individually before the rest
// become "Other".
export const PIE_TOP = 6;

// Flattens the API payload into top-level rows (Uncategorized included),
// largest first. Each expandable row carries its child rows: subcategories
// plus "<Parent> (direct)" for spending booked on the parent itself.
export function buildRows(data) {
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

// The donut's top-level slices: the PIE_TOP largest categories, then
// "Other" holding the rest (only when that's two or more - a single
// leftover keeps its own slice), then Uncategorized, which never folds.
export function buildPieSlices(rows) {
  const categorised = rows.filter((r) => r.key !== UNCATEGORIZED_KEY);
  const uncategorized = rows.find((r) => r.key === UNCATEGORIZED_KEY);
  const tail = categorised.slice(PIE_TOP);

  const slices =
    tail.length >= 2
      ? [
          ...categorised.slice(0, PIE_TOP),
          {
            key: OTHER_KEY,
            name: "Other",
            cents: tail.reduce((sum, r) => sum + r.cents, 0),
            children: tail.map((r) => ({ key: r.key, name: r.name, cents: r.cents })),
          },
        ]
      : categorised;
  return uncategorized ? [...slices, uncategorized] : slices;
}
