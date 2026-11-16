import { AlertTriangle, Plus, RotateCcw, X } from "lucide-react";
import { useState } from "react";
import { removePlanBudget, setPlanBills, setPlanBudget } from "../api/plans";
import { cn } from "../lib/cn";
import { formatMoney, formatMoneyWhole as whole } from "../lib/money";
import { KIND_NAME, longMonth, shortMonth } from "../lib/yearPlans";
import { Button } from "./ui/Button";
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
const MONTH_NUMBERS = Array.from({ length: 12 }, (_, i) => i + 1);

function toCents(text) {
  return Math.round(parseFloat(text || "0") * 100);
}

function centsText(cents) {
  return cents == null ? "" : String(cents / 100);
}

let nextKey = 0;
function billLine(bill, fromMonth) {
  nextKey += 1;
  return {
    key: nextKey,
    name: bill?.name ?? "",
    day: bill ? String(bill.day) : "",
    amount: bill ? centsText(bill.amount_cents) : "",
    from: String(bill ? Math.max(bill.from_month, fromMonth) : fromMonth),
    until: bill?.until_month != null ? String(bill.until_month) : "on",
  };
}

const isBlank = (line) => !line.name.trim() && !line.day && !line.amount;

function billProblem(line) {
  const day = Number(line.day);
  if (!line.name.trim()) return "Give each bill a name.";
  if (!Number.isInteger(day) || day < 1 || day > 31) return "A bill's day is from 1 to 31.";
  if (!(toCents(line.amount) > 0)) return "Give each bill an amount.";
  if (line.until !== "on" && Number(line.until) < Number(line.from)) return "A bill can't end before it starts.";
  return null;
}

function MonthSelect({ value, onChange, months, label, keepsGoing = false }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 w-28" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {keepsGoing && <SelectItem value="on">keeps going</SelectItem>}
        {months.map((m) => (
          <SelectItem key={m} value={String(m)}>
            {keepsGoing ? `until ${shortMonth(m)}` : `from ${shortMonth(m)}`}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// A draft's bills: day, name, amount, and the months of the year each counts
// in - see specs/year-plans, "Bills in a draft".
function PlanBillLines({ lines, fromMonth, onChange }) {
  const covered = MONTH_NUMBERS.filter((m) => m >= fromMonth);
  const update = (key, field, value) => onChange(lines.map((l) => (l.key === key ? { ...l, [field]: value } : l)));
  const total = lines.reduce((sum, line) => sum + (toCents(line.amount) || 0), 0);
  return (
    <div className="flex w-full flex-col gap-2">
      <ul className="flex flex-col gap-2" aria-label="Bills">
        {lines.map((line) => (
          <li key={line.key} className="flex flex-col gap-1.5 rounded-lg bg-surface-2 p-2">
            <span className="flex items-center gap-2">
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
            </span>
            <span className="flex flex-wrap items-center gap-2">
              <MonthSelect value={line.from} onChange={(v) => update(line.key, "from", v)} months={covered} label="First month" />
              <MonthSelect
                value={line.until}
                onChange={(v) => update(line.key, "until", v)}
                months={covered}
                label="Last month"
                keepsGoing
              />
            </span>
          </li>
        ))}
      </ul>
      <span className="flex items-center justify-between gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={() => onChange([...lines, billLine(null, fromMonth)])}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add bill
        </Button>
        <span className="num text-sm text-ink-secondary">{formatMoney(total)} a month</span>
      </span>
    </div>
  );
}

// Twelve months, four to a row: months before the from month show the real
// budget, read-only; later ones take their own amount, the default's
// placeholder otherwise - see specs/year-plans, "Month exceptions in a draft".
function MonthGrid({ months, realMonths, fromMonth, defaultText, onChange }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="grid grid-cols-4 gap-1.5" role="group" aria-label="Amount per month">
        {MONTH_NUMBERS.map((m) => {
          const before = m < fromMonth;
          const own = months[m] ?? "";
          const exception = !before && own !== "" && own !== defaultText;
          return (
            <label
              key={m}
              className={cn(
                "flex flex-col gap-0.5 rounded-lg px-2 py-1.5 text-xs",
                before ? "bg-surface-2 text-ink-muted" : exception ? "bg-draft-tint ring-1 ring-draft-ring" : "bg-surface ring-1 ring-border",
              )}
            >
              <span className="flex items-center justify-between">
                {shortMonth(m)}
                {exception && (
                  <button
                    type="button"
                    aria-label={`Reset ${longMonth(m)}`}
                    className="text-ink-muted hover:text-ink-primary"
                    onClick={(e) => {
                      e.preventDefault();
                      onChange({ ...months, [m]: "" });
                    }}
                  >
                    <RotateCcw className="h-3 w-3" aria-hidden="true" />
                  </button>
                )}
              </span>
              {before ? (
                <span className="num h-6 leading-6">{realMonths[m - 1] == null ? "—" : whole(realMonths[m - 1])}</span>
              ) : (
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={own}
                  placeholder={defaultText}
                  aria-label={longMonth(m)}
                  onChange={(e) => onChange({ ...months, [m]: e.target.value })}
                  className="num h-6 w-full min-w-0 bg-transparent text-sm text-ink-primary outline-none placeholder:text-ink-muted"
                />
              )}
            </label>
          );
        })}
      </div>
      {fromMonth > 1 && <p className="text-xs text-ink-muted">Before {longMonth(fromMonth)}: the real budget.</p>}
    </div>
  );
}

/**
 * Edits one category's budget in a draft: the budget editor's kinds, plus
 * the months of the year and bills that start or end within it. Saving
 * writes to the draft only - see specs/year-plans.
 */
export function PlanBudgetEditor({ plan, row, onSaved, onCancel }) {
  const toast = useToast();
  const fromMonth = plan.from_month;
  const initialKind = row.kind === "none" ? "monthly" : row.kind;
  const [kind, setKind] = useState(initialKind);
  const [amount, setAmount] = useState(
    centsText(initialKind === "monthly" ? row.default_cents : initialKind === "bills" ? null : row.amount_cents),
  );
  const [months, setMonths] = useState(() =>
    Object.fromEntries(Object.entries(row.exceptions ?? {}).map(([m, cents]) => [Number(m), centsText(cents)])),
  );
  const [showMonths, setShowMonths] = useState(Object.keys(row.exceptions ?? {}).length > 0);
  const [dueDay, setDueDay] = useState(row.due ? String(Number(row.due.slice(3))) : "");
  const [dueMonth, setDueMonth] = useState(row.due ? row.due.slice(0, 2) : "");
  const [lines, setLines] = useState(() => (row.kind === "bills" ? row.bills.map((b) => billLine(b, fromMonth)) : []));
  const [saving, setSaving] = useState(false);

  const realKind = row.current?.kind ?? row.kind;
  const switching = realKind !== "none" && kind !== realKind;
  const betweenYearly = ["yearly", "target"].includes(realKind) && ["yearly", "target"].includes(kind);

  function changeKind(next) {
    if ((next === "monthly") !== (kind === "monthly")) {
      setAmount(centsText(next === "monthly" ? row.default_cents : row.amount_cents));
    }
    if (next === "bills" && lines.length === 0) setLines([billLine(null, fromMonth)]);
    setKind(next);
  }

  async function save(event) {
    event.preventDefault();
    try {
      setSaving(true);
      if (kind === "bills") {
        const kept = lines.filter((l) => !isBlank(l));
        const problem = kept.map(billProblem).find(Boolean);
        if (problem) {
          toast.error(problem);
          return;
        }
        await setPlanBills(
          plan.id,
          row.category_id,
          kept.map((l) => ({
            name: l.name.trim(),
            day: Number(l.day),
            amount_cents: toCents(l.amount),
            from_month: Number(l.from),
            until_month: l.until === "on" ? null : Number(l.until),
          })),
        );
      } else {
        if (amount === "") {
          toast.error(kind === "monthly" ? "A monthly budget needs an amount." : "A yearly budget needs an amount.");
          return;
        }
        if (kind === "target" && (!dueDay || !dueMonth)) {
          toast.error("Pick the day and month it is due.");
          return;
        }
        const cents = toCents(amount);
        const data =
          kind === "monthly"
            ? {
                kind,
                default_cents: cents,
                months: Object.fromEntries(
                  Object.entries(months)
                    .filter(([m, text]) => Number(m) >= fromMonth && text !== "")
                    .map(([m, text]) => [m, toCents(text)]),
                ),
              }
            : { kind, amount_cents: cents, ...(kind === "target" && { due: `${dueMonth}-${String(dueDay).padStart(2, "0")}` }) };
        await setPlanBudget(plan.id, row.category_id, data);
      }
      onSaved(`${row.category_name} saved to ${plan.name}.`);
    } catch (e) {
      toast.error(e.data?.detail ?? (e.data ? Object.values(e.data).flat().join(" ") : e.message));
    } finally {
      setSaving(false);
    }
  }

  async function removeBudget() {
    try {
      await removePlanBudget(plan.id, row.category_id);
      onSaved(`${row.category_name} has no budget in ${plan.name}.`);
    } catch (e) {
      toast.error(e.data?.detail ?? e.message);
    }
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-3" aria-label={`Budget for ${row.category_name} in ${plan.name}`}>
      <SegmentedControl label="Budget" options={KINDS} value={kind} onChange={changeKind} />
      {switching && !betweenYearly && (
        <p className="flex items-start gap-1.5 text-xs text-warning" role="note">
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            Applying this makes {row.category_name} {KIND_NAME[kind]} for every month, earlier ones included, and its{" "}
            {KIND_NAME[realKind]} amounts go.
          </span>
        </p>
      )}
      {kind === "bills" ? (
        <PlanBillLines lines={lines} fromMonth={fromMonth} onChange={setLines} />
      ) : (
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
      {kind === "target" && (
        <span className="flex items-center gap-2 text-sm text-ink-secondary">
          due
          <Input
            type="number"
            min="1"
            max={dueMonth === "02" ? 28 : 31}
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
              {MONTH_NUMBERS.map((m) => (
                <SelectItem key={m} value={String(m).padStart(2, "0")}>
                  {shortMonth(m)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </span>
      )}
      {kind === "monthly" &&
        (showMonths ? (
          <MonthGrid
            months={months}
            realMonths={row.months}
            fromMonth={fromMonth}
            defaultText={amount}
            onChange={setMonths}
          />
        ) : (
          <Button type="button" size="sm" variant="ghost" className="self-start px-0 text-accent" onClick={() => setShowMonths(true)}>
            Different amount in some months
          </Button>
        ))}
      <span className="flex flex-wrap items-center justify-between gap-2 pt-1">
        {row.kind !== "none" ? (
          <Button type="button" size="sm" variant="ghost" className="text-ink-secondary hover:text-critical" onClick={removeBudget}>
            No budget in this draft
          </Button>
        ) : (
          <span />
        )}
        <span className="flex gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={saving}>
            Save to draft
          </Button>
        </span>
      </span>
    </form>
  );
}
