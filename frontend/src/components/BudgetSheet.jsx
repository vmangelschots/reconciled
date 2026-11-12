import { AlertTriangle, CalendarClock, Check, Landmark } from "lucide-react";
import { Link } from "react-router-dom";
import { useSpendingCell } from "../hooks/useSpendingCell";
import { BILL_TONE, billLabel } from "../lib/budgetOverview";
import { cn } from "../lib/cn";
import { formatMoney } from "../lib/money";
import { monthLabel } from "../lib/months";
import { BudgetEditor } from "./BudgetEditor";
import { SpendingRows } from "./SpendingRows";
import { DialogTitle } from "./ui/Dialog";
import { BillBar } from "./BillBar";
import { ProgressBar } from "./ui/ProgressBar";
import { Sheet } from "./ui/Sheet";
import { StatusBadge } from "./ui/StatusBadge";

const CHIP_ICON = {
  paid: <Check className="h-3 w-3" aria-hidden="true" />,
  due_soon: <CalendarClock className="h-3 w-3" aria-hidden="true" />,
  missed: <AlertTriangle className="h-3 w-3" aria-hidden="true" />,
};

// The month's bills, each with its state - see specs/bill-budgets.
function BillList({ bills, through }) {
  return (
    <ul className="flex flex-col border-b border-border py-2" aria-label="This month's bills">
      {bills.map((bill) => {
        const label = billLabel(bill, through);
        const tone = BILL_TONE[bill.state];
        return (
          <li key={bill.id} className="flex items-center gap-3 px-5 py-1.5">
            <span className="num w-6 shrink-0 text-right text-sm text-ink-muted">{bill.day}</span>
            {bill.source === "loan" ? (
              <Link
                to={`/transactions/${bill.loan_account_id}/schedule`}
                className="flex min-w-0 flex-1 items-center gap-1.5 text-sm font-medium text-ink-primary hover:underline"
              >
                <span className="truncate">{bill.name}</span>
                <Landmark className="h-3.5 w-3.5 shrink-0 text-ink-muted" aria-label="From a loan" />
              </Link>
            ) : (
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink-primary">{bill.name}</span>
            )}
            <span className="num text-sm text-ink-primary">{formatMoney(bill.amount_cents)}</span>
            <span className="flex min-w-20 shrink-0 justify-end">
              {label && (
                <StatusBadge tone={tone === "reminder" ? "neutral" : tone} icon={CHIP_ICON[bill.state]}>
                  {label}
                </StatusBadge>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function SheetBody({ row, category, month, startMonth, categories, onSaved, onClose, onChanged }) {
  const spending = useSpendingCell({ category: row.id, month }, onChanged);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="flex flex-col gap-1.5 border-b border-border px-5 py-4 pr-10">
        <DialogTitle className="text-base">{row.name}</DialogTitle>
        <p className={cn("num text-sm font-medium", row.critical ? "text-critical" : "text-ink-primary")}>{row.figure}</p>
        {row.caption && <p className="text-xs text-ink-muted">{row.caption}</p>}
        {row.bar && <ProgressBar label={`${row.name} spent`} {...row.bar} />}
        {row.bills && <BillBar label={`${row.name} bills`} bills={row.bills} overCents={row.overCents} />}
      </div>
      {row.billLines?.length > 0 && <BillList bills={row.billLines} through={row.through} />}
      <div className="border-b border-border px-5 py-4">
        <BudgetEditor
          key={row.id}
          category={category}
          month={month}
          limitCents={row.limitCents}
          startMonth={startMonth}
          onSaved={onSaved}
          onCancel={onClose}
        />
      </div>
      <h3 className="px-5 pt-4 text-xs font-medium tracking-wide text-ink-muted uppercase">
        Transactions in {monthLabel(month)}
      </h3>
      <SpendingRows spending={spending} categories={categories} emptyText="No transactions this month." />
      <p className="border-t border-border px-5 py-3 text-sm">
        <Link to="/categories" className="text-accent hover:underline">
          Rename or move in Categories →
        </Link>
      </p>
    </div>
  );
}

/**
 * One budget's figures, its editor and the viewed month's transactions, in
 * a sheet - see specs/budget-overview. `row` comes from budgetList, or is
 * null when closed.
 */
export function BudgetSheet({ row, categories, month, startMonth, wide, onSaved, onChanged, onClose }) {
  const category = row && (categories.find((c) => c.id === row.id) ?? { id: row.id, name: row.name, budget_kind: "monthly" });
  return (
    <Sheet open={row != null} onClose={onClose} wide={wide}>
      {row && (
        <SheetBody
          key={`${month}/${row.id}`}
          row={row}
          category={category}
          month={month}
          startMonth={startMonth}
          categories={categories}
          onSaved={onSaved}
          onChanged={onChanged}
          onClose={onClose}
        />
      )}
    </Sheet>
  );
}
