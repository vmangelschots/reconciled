import { AlertTriangle, CalendarClock, Check, ChevronDown, ChevronRight, Landmark, Plus, TrendingDown, TrendingUp } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { addBillFromPayment, setCategoryBills } from "../api/categories";
import { useSpendingCell } from "../hooks/useSpendingCell";
import { BILL_TONE, billLabel } from "../lib/budgetOverview";
import { formatDayMonth } from "../lib/yearlyBudgets";
import { cn } from "../lib/cn";
import { formatMoney } from "../lib/money";
import { monthLabel } from "../lib/months";
import { BudgetEditor } from "./BudgetEditor";
import { SpendingRows } from "./SpendingRows";
import { DialogTitle } from "./ui/Dialog";
import { BillBar } from "./BillBar";
import { ProgressBar } from "./ui/ProgressBar";
import { Sheet } from "./ui/Sheet";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { StatusBadge } from "./ui/StatusBadge";
import { useToast } from "./ui/Toast";

const CHIP_ICON = {
  paid: <Check className="h-3 w-3" aria-hidden="true" />,
  paid_over: <TrendingUp className="h-3 w-3" aria-hidden="true" />,
  paid_under: <TrendingDown className="h-3 w-3" aria-hidden="true" />,
  due_soon: <CalendarClock className="h-3 w-3" aria-hidden="true" />,
  missed: <AlertTriangle className="h-3 w-3" aria-hidden="true" />,
};

// The month's bills, each with its state - see specs/bill-budgets.
function BillList({ bills, through }) {
  return (
    <ul className="flex flex-col pb-2" aria-label="This month's bills">
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
                <StatusBadge
                  tone={tone === "reminder" || bill.state === "paid_over" || bill.state === "paid_under" ? "neutral" : tone}
                  icon={CHIP_ICON[bill.state]}
                >
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

// One "Not a bill" payment, with Add as bill opening a name field in place.
function ExtraItem({ payment, onAdd }) {
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState(payment.payee);
  const [saving, setSaving] = useState(false);

  async function add(event) {
    event.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onAdd(payment, name.trim());
    } finally {
      setSaving(false);
    }
  }

  const facts = `${formatDayMonth(payment.date)} · ${payment.payee} · ${formatMoney(payment.amount_cents)}`;
  if (naming) {
    return (
      <li>
        <form onSubmit={add} className="flex flex-wrap items-center gap-2 px-3 py-2" aria-label={`Add ${payment.payee} as a bill`}>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onFocus={(e) => e.target.select()}
            autoFocus
            aria-label="Bill name"
            className="h-8 min-w-0 flex-1"
          />
          <span className="num text-xs text-ink-muted">
            day {Number(payment.date.slice(8, 10))} · {formatMoney(payment.amount_cents)}
          </span>
          <span className="ml-auto flex gap-2">
            <Button type="button" size="sm" variant="ghost" className="h-7" onClick={() => setNaming(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" className="h-7" disabled={saving}>
              Add
            </Button>
          </span>
        </form>
      </li>
    );
  }
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
      <span className="num min-w-0 flex-1 text-xs text-ink-secondary">{facts}</span>
      <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-accent" onClick={() => setNaming(true)}>
        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
        Add as bill
      </Button>
    </li>
  );
}

// What to look at in this month or the last one: bills paid at another
// amount, and payments that pay no bill - see specs/bill-budgets.
function ToReview({ items, onUpdate, onAdd }) {
  return (
    <section className="border-b border-border px-5 py-3" aria-label="To review">
      <h3 className="pb-1.5 text-xs font-medium tracking-wide text-ink-muted uppercase">To review</h3>
      <ul className="flex flex-col divide-y divide-border rounded-lg bg-surface-2">
        {items.map((item) =>
          item.kind === "price" ? (
            <li key={item.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
              <span className="min-w-0 flex-1 text-xs text-ink-secondary">{item.text}</span>
              <Button type="button" size="sm" variant="outline" className="h-7" onClick={() => onUpdate(item.bill)}>
                Update
              </Button>
            </li>
          ) : (
            <ExtraItem key={item.key} payment={item.payment} onAdd={onAdd} />
          ),
        )}
      </ul>
    </section>
  );
}

// A Bills category's sheet: what to review, its bills once (Edit bills turns
// them into the editor), and its transactions folded away - see
// specs/budget-overview and specs/bill-budgets.
function BillsBody({ row, category, month, startMonth, spending, categories, onSaved, onChanged }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [showTransactions, setShowTransactions] = useState(false);
  const isLoan = category.loans?.length > 0;
  const manual = row.billLines.filter((b) => b.source !== "loan");
  const count = spending.cell.data?.rows.length;

  async function refresh(message) {
    toast.success(message);
    await onChanged();
  }

  async function update(bill) {
    try {
      await setCategoryBills(
        category.id,
        manual.map((b) => ({
          id: b.id,
          name: b.name,
          day: b.day,
          amount_cents: b.id === bill.id ? bill.paid_cents : b.amount_cents,
        })),
        month,
      );
      await refresh(`${bill.name} is ${formatMoney(bill.paid_cents)} from ${monthLabel(month)} on.`);
    } catch (e) {
      toast.error(e.data?.detail ?? e.message);
    }
  }

  async function add(payment, name) {
    try {
      await addBillFromPayment(category.id, payment.id, name);
      await refresh(`Added ${name} as a bill.`);
    } catch (e) {
      toast.error(e.data?.detail ?? e.message);
    }
  }

  return (
    <>
      {!isLoan && row.review.length > 0 && <ToReview items={row.review} onUpdate={update} onAdd={add} />}
      <section className="border-b border-border" aria-label="Bills">
        <div className="flex items-center justify-between px-5 pt-3 pb-1">
          <h3 className="text-xs font-medium tracking-wide text-ink-muted uppercase">Bills</h3>
          {!isLoan && !editing && (
            <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-accent" onClick={() => setEditing(true)}>
              Edit bills
            </Button>
          )}
        </div>
        {editing ? (
          <div className="px-5 pt-1 pb-4">
            <BudgetEditor
              key={`${row.id}/${manual.map((b) => `${b.id}:${b.amount_cents}`).join(",")}`}
              category={category}
              month={month}
              limitCents={row.limitCents}
              startMonth={startMonth}
              bills={manual}
              onSaved={onSaved}
              onCancel={() => setEditing(false)}
            />
          </div>
        ) : (
          <>
            <BillList bills={row.billLines} through={row.through} />
            {isLoan && (
              <div className="px-5 pb-4">
                <BudgetEditor category={category} month={month} limitCents={row.limitCents} startMonth={startMonth} />
              </div>
            )}
          </>
        )}
      </section>
      <button
        type="button"
        onClick={() => setShowTransactions((v) => !v)}
        aria-expanded={showTransactions}
        className="flex w-full items-center justify-between px-5 py-3 text-left text-sm text-ink-secondary hover:bg-surface-2"
      >
        <span>{count == null ? `Transactions in ${monthLabel(month)}` : `${count} transactions in ${monthLabel(month)}`}</span>
        {showTransactions ? (
          <ChevronDown className="h-4 w-4" aria-hidden="true" />
        ) : (
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        )}
      </button>
      {showTransactions && <SpendingRows spending={spending} categories={categories} emptyText="No transactions this month." />}
    </>
  );
}

function SheetBody({ row, category, month, startMonth, categories, onSaved, onClose, onChanged }) {
  const spending = useSpendingCell({ category: row.id, month }, onChanged);

  if (row.bills) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto">
        <SheetHeader row={row} />
        <BillsBody
          row={row}
          category={category}
          month={month}
          startMonth={startMonth}
          spending={spending}
          categories={categories}
          onSaved={onSaved}
          onChanged={onChanged}
        />
        <CategoriesLink />
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <SheetHeader row={row} />
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
      <CategoriesLink />
    </div>
  );
}

function SheetHeader({ row }) {
  return (
    <div className="flex flex-col gap-1.5 border-b border-border px-5 py-4 pr-10">
      <DialogTitle className="text-base">{row.name}</DialogTitle>
      <p className={cn("num text-sm font-medium", row.critical ? "text-critical" : "text-ink-primary")}>{row.figure}</p>
      {row.caption && <p className="text-xs text-ink-muted">{row.caption}</p>}
      {row.bar && <ProgressBar label={`${row.name} spent`} {...row.bar} />}
      {row.bills && <BillBar label={`${row.name} bills`} bills={row.bills} overCents={row.overCents} />}
    </div>
  );
}

function CategoriesLink() {
  return (
    <p className="border-t border-border px-5 py-3 text-sm">
      <Link to="/categories" className="text-accent hover:underline">
        Rename or move in Categories →
      </Link>
    </p>
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
