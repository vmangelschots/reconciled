import { Landmark, Plus, X } from "lucide-react";
import { Fragment, useState } from "react";
import { Link } from "react-router-dom";
import { setCategoryBills, setCategoryBudget, setCategoryLimit } from "../api/categories";
import { cn } from "../lib/cn";
import { formatMoney } from "../lib/money";
import { currentMonth } from "../lib/months";
import { formatShortMonth, historyValuesFor } from "../lib/yearlyBudgets";
import { Button } from "./ui/Button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/Dialog";
import { Input } from "./ui/Input";
import { SegmentedControl } from "./ui/SegmentedControl";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/Select";
import { useToast } from "./ui/Toast";

const KINDS = [
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
  { value: "target", label: "On a date" },
  { value: "bills", label: "Bills" },
];

const KIND_NAME = { monthly: "monthly", yearly: "yearly", target: "on a date", bills: "bills" };
const YEARLY_KINDS = new Set(["yearly", "target"]);

const MONTHS = Array.from({ length: 12 }, (_, i) => ({
  value: String(i + 1).padStart(2, "0"),
  label: new Date(Date.UTC(2025, i, 1)).toLocaleString(undefined, { month: "short", timeZone: "UTC" }),
}));

function toCents(text) {
  return Math.round(parseFloat(text || "0") * 100);
}

function centsText(cents) {
  return cents == null ? "" : String(cents / 100);
}

function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

// What switching kind would remove, as a sentence, or null when nothing
// would be removed - see specs/budgets, "Switching to or from monthly
// drops the old amounts".
function droppedSentence(category, kind) {
  const from = category.budget_kind ?? "monthly";
  if (from === kind) return null;
  if (from === "monthly") {
    const { default_cents: defaultCents, override_count: overrides = 0 } = category.monthly_limits ?? {};
    const parts = [
      defaultCents != null && `the ${formatMoney(defaultCents)} monthly limit`,
      overrides > 0 && plural(overrides, "month override", "month overrides"),
    ].filter(Boolean);
    if (parts.length === 0) return null;
    return `Switching ${category.name} to ${KIND_NAME[kind]} removes ${parts.join(" and ")}.`;
  }
  if (from === "bills") {
    const count = category.bills?.length ?? 0;
    return count > 0 ? `Switching ${category.name} to ${KIND_NAME[kind]} removes its ${plural(count, "bill", "bills")}.` : null;
  }
  if (!YEARLY_KINDS.has(kind) && category.yearly_history?.length) {
    return `Switching ${category.name} to ${KIND_NAME[kind]} removes its yearly amount and history.`;
  }
  return null;
}

let nextKey = 0;

function billLine(bill) {
  nextKey += 1;
  return bill
    ? { key: nextKey, id: bill.id, name: bill.name, day: String(bill.day), amount: centsText(bill.amount_cents) }
    : { key: nextKey, id: null, name: "", day: "", amount: "" };
}

const isBlank = (line) => !line.name.trim() && !line.day && !line.amount;

// Why a bill line can't be saved, or null.
function billProblem(line) {
  const day = Number(line.day);
  if (!line.name.trim()) return "Give each bill a name.";
  if (!Number.isInteger(day) || day < 1 || day > 31) return "A bill's day is from 1 to 31.";
  if (!(toCents(line.amount) > 0)) return "Give each bill an amount.";
  return null;
}

// Bills: one line per bill - day, name, amount - edited in place, with the
// total. See specs/bill-budgets.
function BillLines({ lines, onChange }) {
  const total = lines.reduce((sum, line) => sum + (toCents(line.amount) || 0), 0);
  const update = (key, field, value) => onChange(lines.map((l) => (l.key === key ? { ...l, [field]: value } : l)));
  return (
    <div className="flex w-full flex-col gap-2">
      <ul className="flex flex-col gap-1.5" aria-label="Bills">
        {lines.map((line) => (
          <li key={line.key} className="flex items-center gap-2">
            <Input
              type="number"
              min="1"
              max="31"
              value={line.day}
              onChange={(e) => update(line.key, "day", e.target.value)}
              placeholder="day"
              aria-label="Day"
              className="w-16"
            />
            <Input
              value={line.name}
              onChange={(e) => update(line.key, "name", e.target.value)}
              placeholder="name"
              aria-label="Name"
              className="min-w-0 flex-1"
            />
            <Input
              type="number"
              step="0.01"
              min="0"
              value={line.amount}
              onChange={(e) => update(line.key, "amount", e.target.value)}
              placeholder="amount"
              aria-label="Amount"
              className="w-24"
            />
            <Button
              type="button"
              size="sm"
              variant="ghost"
              aria-label={`Remove ${line.name || "bill"}`}
              onClick={() => onChange(lines.filter((l) => l.key !== line.key))}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </li>
        ))}
      </ul>
      <span className="flex items-center justify-between gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={() => onChange([...lines, billLine()])}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add bill
        </Button>
        <span className="num text-sm text-ink-secondary">{formatMoney(total)} a month</span>
      </span>
      <p className="text-xs text-ink-muted">Use the day a bill usually leaves your account.</p>
    </div>
  );
}

/**
 * Sets one category's budget: its kind (Monthly · Yearly · On a date ·
 * Bills) and the amount, plus the due date for a target, or the bills.
 * Shown in the budget sheet.
 * `limitCents` is the limit shown for the
 * viewed `month`; `startMonth` is the budgeting start month (ISO date).
 */
// A loan category's budget comes from its loans, so there is nothing to
// edit here - see specs/bill-budgets.
function LoanBudget({ loans }) {
  return (
    <p className="flex items-start gap-1.5 text-sm text-ink-secondary">
      <Landmark className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
      <span>
        Set by {loans.length === 1 ? "1 loan" : `${loans.length} loans`}:{" "}
        {loans.map((loan, i) => (
          <Fragment key={loan.account_id}>
            {i > 0 && ", "}
            <Link to={`/transactions/${loan.account_id}/schedule`} className="text-accent hover:underline">
              {loan.name}
            </Link>
          </Fragment>
        ))}
        . Change it on the loan pages.
      </span>
    </p>
  );
}

export function BudgetEditor(props) {
  if (props.category.loans?.length > 0) return <LoanBudget loans={props.category.loans} />;
  return <KindEditor {...props} />;
}

function KindEditor({ category, month, limitCents, startMonth, onSaved, onCancel }) {
  const initialKind = category.budget_kind ?? "monthly";
  const [kind, setKind] = useState(initialKind);
  const [amount, setAmount] = useState(
    centsText(initialKind === "monthly" ? limitCents : category.yearly?.amount_cents),
  );
  const [thisMonthOnly, setThisMonthOnly] = useState(false);
  const [dueDay, setDueDay] = useState(category.yearly?.due ? String(Number(category.yearly.due.slice(3))) : "");
  const [dueMonth, setDueMonth] = useState(category.yearly?.due?.slice(0, 2) ?? "");
  const [lines, setLines] = useState(() => (category.bills ?? []).map(billLine));
  const [confirming, setConfirming] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();

  const thisYear = Number(currentMonth().slice(0, 4));
  const viewedYear = Number(month.slice(0, 4));
  const yearly = YEARLY_KINDS.has(kind);
  const cents = toCents(amount);
  const startYear = startMonth ? Number(startMonth.slice(0, 4)) : null;
  const startIndex = startMonth ? Number(startMonth.slice(5, 7)) : null;
  const prorated = kind === "yearly" && startYear === thisYear && startIndex > 1 && amount !== "";
  const pastValues = viewedYear < thisYear ? historyValuesFor(category.yearly_history, viewedYear) : null;
  const februaryMax = dueMonth === "02" ? 28 : 31;

  // A monthly amount isn't a yearly one, so crossing between them starts
  // from that kind's own amount (or empty) rather than carrying it over.
  function changeKind(next) {
    if ((next === "monthly") !== (kind === "monthly")) {
      const own = next === "monthly" ? (initialKind === "monthly" ? limitCents : null) : category.yearly?.amount_cents;
      setAmount(centsText(own));
    }
    // No bills yet: start with an empty line rather than an empty box.
    if (next === "bills" && lines.length === 0) setLines([billLine()]);
    setKind(next);
  }

  async function save() {
    setSubmitting(true);
    try {
      if (kind === "bills") {
        if (initialKind !== "bills") await setCategoryBudget(category.id, { kind });
        await setCategoryBills(
          category.id,
          lines
            .filter((line) => !isBlank(line))
            .map((line) => ({
              ...(line.id != null && { id: line.id }),
              name: line.name.trim(),
              day: Number(line.day),
              amount_cents: toCents(line.amount),
            })),
        );
      } else if (kind === "monthly" && initialKind === "monthly") {
        await setCategoryLimit(category.id, { month: thisMonthOnly ? month : null, limit_cents: cents });
      } else if (kind === "monthly") {
        await setCategoryBudget(category.id, { kind, amount_cents: thisMonthOnly ? undefined : cents });
        if (thisMonthOnly) await setCategoryLimit(category.id, { month, limit_cents: cents });
      } else {
        const due = kind === "target" ? `${dueMonth}-${String(dueDay).padStart(2, "0")}` : undefined;
        await setCategoryBudget(category.id, { kind, amount_cents: cents, due });
      }
      onSaved(category.id, kind !== initialKind);
    } catch (e) {
      toast.error(e.data ? Object.values(e.data).flat().join(" ") : e.message);
    } finally {
      setSubmitting(false);
      setConfirming(null);
    }
  }

  function handleSubmit(event) {
    event.preventDefault();
    if (yearly && amount === "") {
      toast.error("A yearly budget needs an amount.");
      return;
    }
    if (kind === "target" && (!dueDay || !dueMonth)) {
      toast.error("Pick the day and month it is due.");
      return;
    }
    if (kind === "bills") {
      const problem = lines.filter((line) => !isBlank(line)).map(billProblem).find(Boolean);
      if (problem) {
        toast.error(problem);
        return;
      }
    }
    const dropped = droppedSentence(category, kind);
    if (dropped) {
      setConfirming(dropped);
      return;
    }
    save();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3" aria-label={`Budget for ${category.name}`}>
      <div className="flex flex-col items-start gap-3">
        <SegmentedControl label="Budget" options={KINDS} value={kind} onChange={changeKind} />
        {kind === "bills" && <BillLines lines={lines} onChange={setLines} />}
        {kind !== "bills" && (
          <label className="flex items-center gap-2 text-sm text-ink-secondary">
            <Input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="amount"
              aria-label="Amount"
              className="w-28"
            />
            {kind === "monthly" ? "a month" : kind === "yearly" ? "a year" : null}
          </label>
        )}
        {kind === "monthly" && (
          <label className="flex items-center gap-1.5 whitespace-nowrap text-sm text-ink-secondary">
            <input type="checkbox" checked={thisMonthOnly} onChange={(e) => setThisMonthOnly(e.target.checked)} />
            This month only
          </label>
        )}
        {kind === "target" && (
          <span className="flex items-center gap-2 text-sm text-ink-secondary">
            due
            <Input
              type="number"
              min="1"
              max={februaryMax}
              value={dueDay}
              onChange={(e) => setDueDay(e.target.value)}
              aria-label="Due day"
              className="w-16"
            />
            <Select value={dueMonth} onValueChange={setDueMonth}>
              <SelectTrigger className="w-24" aria-label="Due month">
                <SelectValue placeholder="Month" />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </span>
        )}
      </div>
      {yearly && (
        <p className={cn("text-xs", pastValues ? "text-warning" : "text-ink-muted")}>
          {prorated &&
            `${thisYear}: ${formatMoney(Math.floor((cents * (13 - startIndex)) / 12))} (from ${formatShortMonth(startMonth)}). `}
          Applies to {thisYear} and later.
          {pastValues && ` ${viewedYear} stays ${formatMoney(pastValues.amount_cents)}.`}
        </p>
      )}
      <span className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={submitting}>
          Save
        </Button>
      </span>

      <Dialog open={confirming != null} onOpenChange={(open) => !open && setConfirming(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Switch to {KIND_NAME[kind]}?</DialogTitle>
            <DialogDescription>{confirming}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirming(null)}>
              Cancel
            </Button>
            <Button disabled={submitting} onClick={save}>
              Switch to {KIND_NAME[kind]}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  );
}
