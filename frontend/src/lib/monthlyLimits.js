// The default limit that applies in `month` ("YYYY-MM"): the latest one from
// that month or before, else the one from the start, else none - see
// specs/budgets, "A default limit applies from a month on".
export function defaultInEffect(category, month) {
  const defaults = category.monthly_limits?.defaults;
  if (!defaults) return category.monthly_limits?.default_cents ?? null;
  if (defaults.length === 0) return null;
  const started = defaults.filter((d) => d.from_month != null && d.from_month <= month);
  if (started.length) return started[started.length - 1].limit_cents;
  return defaults.find((d) => d.from_month == null)?.limit_cents ?? null;
}
