import { cn } from "../../lib/cn";
import { formatMoney, formatSignedMoney } from "../../lib/money";

/**
 * A money amount in tabular figures. `signed`: money in reads "+€…" in
 * the positive colour; money out stays the normal text colour. See the
 * ui-shell spec, "Amounts and dates are easy to scan".
 */
export function Amount({ cents, signed = false, className }) {
  const positive = signed && cents > 0;
  return (
    <span className={cn("num whitespace-nowrap", positive && "text-positive", className)}>
      {signed ? formatSignedMoney(cents) : formatMoney(cents)}
    </span>
  );
}
