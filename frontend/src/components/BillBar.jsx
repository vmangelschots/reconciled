import { BILL_TONE } from "../lib/budgetOverview";
import { cn } from "../lib/cn";
import { formatMoney } from "../lib/money";

// Each state's fill. Upcoming stays the bare track.
const FILL = {
  positive: "bg-positive",
  reminder: "bg-accent/30",
  warning: "bg-warning",
  critical: "bg-critical",
  neutral: "",
};

/**
 * A Bills budget's bar: one segment per bill, as wide as its share of the
 * amounts, filled by its state - see specs/bill-budgets. When the category
 * is over, a critical segment ends it for what is beyond the bills, never
 * wider than the bills together. It sits where a ProgressBar would, on the
 * same track, and never shows a pace marker.
 */
export function BillBar({ bills, overCents = 0, label, className }) {
  const billsCents = bills.reduce((sum, b) => sum + b.amountCents, 0);
  return (
    <div
      role="img"
      aria-label={label}
      className={cn("flex h-2 w-full gap-px overflow-hidden rounded-full bg-surface-2 ring-1 ring-border", className)}
    >
      {bills.map((bill) => (
        <div
          key={bill.id}
          data-testid="bill-segment"
          data-state={bill.state}
          title={bill.name}
          className={cn("h-full min-w-1.5", FILL[BILL_TONE[bill.state]])}
          style={{ flexGrow: bill.amountCents, flexBasis: 0 }}
        />
      ))}
      {overCents > 0 && (
        <div
          data-testid="bill-over"
          title={`${formatMoney(overCents)} beyond the bills`}
          className="ml-px h-full min-w-1.5 bg-critical"
          style={{ flexGrow: Math.min(overCents, billsCents), flexBasis: 0 }}
        />
      )}
    </div>
  );
}
