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

const wholeEuros = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: CURRENCY,
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const wholeEurosSigned = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: CURRENCY,
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
  signDisplay: "exceptZero",
});

// Overview tiles and attention items: 348217 -> "€3,482" ("+€1,210" when
// signed). See the ui-shell spec, "Amounts and dates are easy to scan".
export function formatMoneyWhole(cents, { signed = false } = {}) {
  return (signed ? wholeEurosSigned : wholeEuros).format(cents / 100);
}

function signedFormatter(locale) {
  return new Intl.NumberFormat(locale, { style: "currency", currency: CURRENCY, signDisplay: "exceptZero" });
}

const signedFull = signedFormatter(undefined);

// "+€2,400.00" / "-€45.20" - the sign placed the way the language places
// it ("€ +2.400,00" in nl-BE), never glued on by hand. `locale` is for
// tests; the app uses the browser's.
export function formatSignedMoney(cents, locale) {
  return (locale ? signedFormatter(locale) : signedFull).format(cents / 100);
}
