import { Plus, X } from "lucide-react";
import { useState } from "react";
import { addIncomeLine, deleteIncomeLine, updateIncomeLine } from "../api/plans";
import { shortMonth } from "../lib/yearPlans";
import { Button } from "./ui/Button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "./ui/Dialog";
import { Input } from "./ui/Input";
import { PillSwitch } from "./ui/PillSwitch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/Select";
import { useToast } from "./ui/Toast";

const PER = [
  { value: "month", label: "A month" },
  { value: "year", label: "A year" },
];
const NO_CATEGORY = "none";

function centsText(cents) {
  return cents == null ? "" : String(cents / 100);
}

function toCents(text) {
  return Math.round(parseFloat(text || "0") * 100);
}

let nextKey = 0;
function extraLine(month = "", amount = "") {
  nextKey += 1;
  return { key: nextKey, month: String(month), amount };
}

/**
 * Adds or edits one income line of a plan: its amount a month or a year,
 * one-off amounts in given months, and the category its actual comes from -
 * see specs/year-plans, "Income lines". `target` is a draft's id or
 * { year } for Current; `line` is null for a new one.
 */
export function IncomeLineDialog({ open, target, planName, line, categories, onClose, onSaved }) {
  const toast = useToast();
  const [name, setName] = useState(line?.name ?? "");
  const [amount, setAmount] = useState(centsText(line?.amount_cents));
  const [per, setPer] = useState(line?.per ?? "month");
  const [category, setCategory] = useState(line?.category_id != null ? String(line.category_id) : NO_CATEGORY);
  const [extras, setExtras] = useState(() => Object.entries(line?.extra ?? {}).map(([m, c]) => extraLine(m, centsText(c))));
  const [saving, setSaving] = useState(false);
  const topLevel = categories.filter((c) => c.parent == null && !c.is_tab_group);

  async function save(event) {
    event.preventDefault();
    if (!name.trim()) {
      toast.error("Give the income a name.");
      return;
    }
    if (amount === "") {
      toast.error("Give the income an amount.");
      return;
    }
    const data = {
      name: name.trim(),
      amount_cents: toCents(amount),
      per,
      extra: Object.fromEntries(extras.filter((e) => e.month && e.amount !== "").map((e) => [e.month, toCents(e.amount)])),
      category: category === NO_CATEGORY ? null : Number(category),
    };
    setSaving(true);
    try {
      if (line) await updateIncomeLine(target, line.id, data);
      else await addIncomeLine(target, data);
      onSaved(line ? `${data.name} updated.` : `${data.name} added.`);
    } catch (e) {
      toast.error(e.data?.detail ?? e.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    try {
      await deleteIncomeLine(target, line.id);
      onSaved(`${line.name} removed.`);
    } catch (e) {
      toast.error(e.data?.detail ?? e.message);
    }
  }

  const update = (key, field, value) => setExtras(extras.map((e) => (e.key === key ? { ...e, [field]: value } : e)));

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md">
        <form onSubmit={save} className="flex flex-col gap-4" aria-label="Income line">
          <DialogHeader>
            <DialogTitle>{line ? `Edit ${line.name}` : `Add income to ${planName}`}</DialogTitle>
          </DialogHeader>
          <label className="flex flex-col gap-1 text-xs text-ink-muted">
            Name
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Salary" autoFocus />
          </label>
          <span className="flex items-center gap-2">
            <Input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="3200"
              aria-label="Amount"
              className="w-32"
            />
            <PillSwitch label="Per" options={PER} value={per} onChange={setPer} />
          </span>
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium tracking-wide text-ink-muted uppercase">Extra in some months</span>
            {extras.map((extra) => (
              <span key={extra.key} className="flex items-center gap-2">
                <Select value={extra.month} onValueChange={(v) => update(extra.key, "month", v)}>
                  <SelectTrigger className="h-8 w-24" aria-label="Month">
                    <SelectValue placeholder="Month" />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                      <SelectItem key={m} value={String(m)}>
                        {shortMonth(m)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={extra.amount}
                  onChange={(e) => update(extra.key, "amount", e.target.value)}
                  placeholder="amount"
                  aria-label="Extra amount"
                  className="w-28"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-label="Remove extra"
                  onClick={() => setExtras(extras.filter((e) => e.key !== extra.key))}
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </Button>
              </span>
            ))}
            <Button type="button" size="sm" variant="ghost" className="self-start" onClick={() => setExtras([...extras, extraLine()])}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Holiday pay, 13th month…
            </Button>
          </div>
          <label className="flex flex-col gap-1 text-xs text-ink-muted">
            Actual from category
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger aria-label="Category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_CATEGORY}>No category</SelectItem>
                {topLevel.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <DialogFooter className="flex-row items-center justify-between sm:justify-between">
            {line ? (
              <Button type="button" variant="ghost" className="text-ink-secondary hover:text-critical" onClick={remove}>
                Remove
              </Button>
            ) : (
              <span />
            )}
            <span className="flex gap-2">
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                Save
              </Button>
            </span>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
