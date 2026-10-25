import { useState } from "react";
import { setCategoryBudget, setCategoryLimit } from "../api/categories";
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
];

const KIND_NAME = { monthly: "monthly", yearly: "yearly", target: "on a date" };

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
  if (kind === "monthly" && category.yearly_history?.length) {
    return `Switching ${category.name} to monthly removes its yearly amount and history.`;
  }
  return null;
}

/**
 * Sets one category's budget: its kind (Monthly · Yearly · On a date) and
 * the amount, plus the due date for a target. Shown as an expansion row
 * under the category's line. `limitCents` is the limit shown for the
 * viewed `month`; `startMonth` is the budgeting start month (ISO date).
 */
export function BudgetEditor({ category, month, limitCents, startMonth, onSaved, onCancel }) {
  const initialKind = category.budget_kind ?? "monthly";
  const [kind, setKind] = useState(initialKind);
  const [amount, setAmount] = useState(
    centsText(initialKind === "monthly" ? limitCents : category.yearly?.amount_cents),
  );
  const [thisMonthOnly, setThisMonthOnly] = useState(false);
  const [dueDay, setDueDay] = useState(category.yearly?.due ? String(Number(category.yearly.due.slice(3))) : "");
  const [dueMonth, setDueMonth] = useState(category.yearly?.due?.slice(0, 2) ?? "");
  const [confirming, setConfirming] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();

  const thisYear = Number(currentMonth().slice(0, 4));
  const viewedYear = Number(month.slice(0, 4));
  const yearly = kind !== "monthly";
  const cents = toCents(amount);
  const startYear = startMonth ? Number(startMonth.slice(0, 4)) : null;
  const startIndex = startMonth ? Number(startMonth.slice(5, 7)) : null;
  const prorated = kind === "yearly" && startYear === thisYear && startIndex > 1 && amount !== "";
  const pastValues = viewedYear < thisYear ? historyValuesFor(category.yearly_history, viewedYear) : null;
  const februaryMax = dueMonth === "02" ? 28 : 31;

  async function save() {
    setSubmitting(true);
    try {
      if (kind === "monthly" && initialKind === "monthly") {
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
    const dropped = droppedSentence(category, kind);
    if (dropped) {
      setConfirming(dropped);
      return;
    }
    save();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3" aria-label={`Budget for ${category.name}`}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <span className="text-sm text-ink-secondary">Budget</span>
        <SegmentedControl label="Budget" options={KINDS} value={kind} onChange={setKind} />
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
        <span className="flex gap-2 sm:ml-auto">
          <Button type="submit" size="sm" disabled={submitting}>
            Save
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </span>
      </div>
      {yearly && (
        <p className={cn("text-xs", pastValues ? "text-warning" : "text-ink-muted")}>
          {prorated &&
            `${thisYear}: ${formatMoney(Math.floor((cents * (13 - startIndex)) / 12))} (from ${formatShortMonth(startMonth)}). `}
          Applies to {thisYear} and later.
          {pastValues && ` ${viewedYear} stays ${formatMoney(pastValues.amount_cents)}.`}
        </p>
      )}

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
