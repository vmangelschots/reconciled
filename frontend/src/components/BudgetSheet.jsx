import { Link } from "react-router-dom";
import { useSpendingCell } from "../hooks/useSpendingCell";
import { cn } from "../lib/cn";
import { monthLabel } from "../lib/months";
import { BudgetEditor } from "./BudgetEditor";
import { SpendingRows } from "./SpendingRows";
import { DialogTitle } from "./ui/Dialog";
import { ProgressBar } from "./ui/ProgressBar";
import { Sheet } from "./ui/Sheet";

function SheetBody({ row, category, month, startMonth, categories, onSaved, onClose, onChanged }) {
  const spending = useSpendingCell({ category: row.id, month }, onChanged);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="flex flex-col gap-1.5 border-b border-border px-5 py-4 pr-10">
        <DialogTitle className="text-base">{row.name}</DialogTitle>
        <p className={cn("num text-sm font-medium", row.critical ? "text-critical" : "text-ink-primary")}>{row.figure}</p>
        {row.caption && <p className="text-xs text-ink-muted">{row.caption}</p>}
        {row.bar && <ProgressBar label={`${row.name} spent`} {...row.bar} />}
      </div>
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
