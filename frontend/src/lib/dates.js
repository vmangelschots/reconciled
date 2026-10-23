// Short dates for compact lists: "21 Oct" (or "Oct 21", per the browser's
// language), with the year only when it isn't this year. Dates are the
// API's "YYYY-MM-DD" strings, read as calendar dates (no time zone shift).
const sameYear = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", timeZone: "UTC" });
const otherYear = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function parse(isoDate) {
  return new Date(`${isoDate}T00:00:00Z`);
}

export function formatShortDate(isoDate, today = new Date()) {
  const date = parse(isoDate);
  return (date.getUTCFullYear() === today.getFullYear() ? sameYear : otherYear).format(date);
}

// "2-21 Oct"-style spans read best via the formatter's own range support;
// a single day is just that day.
export function formatDateSpan(fromIso, toIso, today = new Date()) {
  if (fromIso === toIso) return formatShortDate(fromIso, today);
  const from = parse(fromIso);
  const to = parse(toIso);
  const thisYear = from.getUTCFullYear() === today.getFullYear() && to.getUTCFullYear() === today.getFullYear();
  return (thisYear ? sameYear : otherYear).formatRange(from, to);
}
