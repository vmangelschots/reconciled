// The one place the app's currency is set. Amounts are stored as cents
// with no currency of their own; this only decides how they're shown.
// Separators follow the browser's language (undefined locale).
export const CURRENCY = "EUR";

const full = new Intl.NumberFormat(undefined, { style: "currency", currency: CURRENCY });
const compact = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: CURRENCY,
  notation: "compact",
  // Explicit minimum: some ICU versions (e.g. Node 22's) otherwise pad
  // to "€6.0K".
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});
// Below 1,000 there's no K/M suffix, so a decimal would just be noise.
const whole = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: CURRENCY,
  maximumFractionDigits: 0,
});

// 123456 -> "€1,234.56" (en) / "€ 1.234,56" (nl-BE)
export function formatMoney(cents) {
  return full.format(cents / 100);
}

// Short form for chart axes: 150000 -> "€1.5K"
export function formatMoneyCompact(cents) {
  const amount = cents / 100;
  return (Math.abs(amount) >= 1000 ? compact : whole).format(amount);
}
