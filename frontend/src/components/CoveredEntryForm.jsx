import { Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "../lib/cn";
import { todayIso } from "../lib/dates";
import { parseCents } from "../lib/money";
import { coveredCategories, tabPreviewSentence, TONE_CLASS } from "../lib/tabs";
import { CategoryCombobox } from "./CategoryCombobox";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";

function centsText(cents) {
  return (cents / 100).toFixed(2);
}

// What's missing before saving, by the API's field names.
function missingFields({ amount, payee, category, date }) {
  const errors = {};
  if (!parseCents(amount)) errors.amount_cents = "Enter an amount above zero.";
  if (!payee.trim()) errors.payee = "Say what it was for.";
  if (category == null) errors.category = "Pick a category.";
  if (!date) errors.date = "Pick a date.";
  return errors;
}

function FieldError({ message }) {
  return message ? <p className="text-xs text-critical">{message}</p> : null;
}

/**
 * The inline form for a covered entry: something the tab's person paid for
 * the user. The amount is typed without a sign; the preview says how the
 * tab will read once it's saved. Enter saves (the category picker keeps
 * Enter while it's open) and Escape cancels. See specs/repayment-tabs.
 *
 * - tabName: the tab's name, for the preview.
 * - balanceCents: the tab's balance without this entry.
 * - categories: every category; tabs and tab groups are left out here.
 * - entry: the tab row being edited ({ date, payee, amount_cents, notes,
 *   covered_category }), or null for a new entry.
 * - onSave({ date, payee, amount_cents, category, notes }): rejects with
 *   the API error; field errors in error.data are shown by their field.
 * - onDelete(): editing only; called after the inline confirmation.
 * - onCancel(): closes without saving.
 */
export function CoveredEntryForm({ tabName, balanceCents, categories, entry = null, onSave, onDelete, onCancel }) {
  const [amount, setAmount] = useState(entry ? centsText(entry.amount_cents) : "");
  const [payee, setPayee] = useState(entry?.payee ?? "");
  const [category, setCategory] = useState(entry?.covered_category?.id ?? null);
  const [date, setDate] = useState(entry?.date ?? todayIso());
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const formRef = useRef(null);
  const amountRef = useRef(null);
  const options = coveredCategories(categories);
  const categoryName = options.find((c) => c.id === category)?.name;

  useEffect(() => {
    amountRef.current?.focus();
    formRef.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, []);

  const cents = parseCents(amount);
  const preview = cents ? tabPreviewSentence(tabName, balanceCents - cents) : null;

  function change(setter, field) {
    return (value) => {
      setter(value);
      setErrors((prev) => ({ ...prev, [field]: undefined }));
      setFormError(null);
    };
  }

  async function run(action) {
    setSaving(true);
    try {
      await action();
    } catch (e) {
      const fieldErrors = e.data && typeof e.data === "object" && !e.data.detail ? e.data : null;
      if (fieldErrors) {
        setErrors(Object.fromEntries(Object.entries(fieldErrors).map(([k, v]) => [k, [v].flat().join(" ")])));
      } else {
        setFormError(e.data?.detail || e.message);
      }
      setSaving(false);
    }
  }

  function save() {
    const missing = missingFields({ amount, payee, category, date });
    if (Object.keys(missing).length > 0) {
      setErrors(missing);
      return;
    }
    run(() => onSave({ date, payee: payee.trim(), amount_cents: cents, category, notes: entry?.notes ?? "" }));
  }

  function handleKeyDown(e) {
    // Escape inside the open picker only closes the picker: its list is in
    // a portal, so it isn't inside this form in the DOM.
    if (e.key === "Escape" && e.currentTarget.contains(e.target)) {
      e.preventDefault();
      onCancel();
    }
  }

  return (
    <form
      ref={formRef}
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      onKeyDown={handleKeyDown}
      aria-label={entry ? `Edit what ${tabName} paid for` : `What ${tabName} paid for`}
      noValidate
      className="flex flex-col gap-3 py-3"
    >
      <p className="text-xs font-medium text-ink-secondary">{tabName} paid for</p>
      <fieldset disabled={saving} className="flex flex-col gap-2">
        <div className="flex flex-wrap items-start gap-2 sm:flex-nowrap">
          <div className="flex flex-col gap-1">
            <div className="relative">
              <span className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-sm text-ink-muted">€</span>
              <Input
                ref={amountRef}
                aria-label="Amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => change(setAmount, "amount_cents")(e.target.value)}
                placeholder="0.00"
                aria-invalid={Boolean(errors.amount_cents)}
                className={cn("w-28 pl-6 text-right tabular-nums", errors.amount_cents && "border-critical ring-1 ring-critical")}
              />
            </div>
            <FieldError message={errors.amount_cents} />
          </div>
          <div className="flex min-w-0 flex-1 basis-40 flex-col gap-1">
            <Input
              aria-label="What it was"
              value={payee}
              onChange={(e) => change(setPayee, "payee")(e.target.value)}
              placeholder="What was it? e.g. Sushi Palace"
              aria-invalid={Boolean(errors.payee)}
              className={cn(errors.payee && "border-critical ring-1 ring-critical")}
            />
            <FieldError message={errors.payee} />
          </div>
          <div className="flex w-full flex-col gap-1 sm:w-48">
            <CategoryCombobox
              categories={options}
              value={category}
              onSelect={change(setCategory, "category")}
              placeholder="Category"
              clearLabel="No category"
              aria-label="Category"
              className={cn("w-full", errors.category && "border-critical ring-1 ring-critical")}
            />
            <FieldError message={errors.category} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex flex-col gap-1">
            <Input
              type="date"
              aria-label="Date"
              value={date}
              onChange={(e) => change(setDate, "date")(e.target.value)}
              className={cn("w-40", errors.date && "border-critical ring-1 ring-critical")}
            />
            <FieldError message={errors.date} />
          </div>
          <p role="status" className="min-h-5 text-sm font-medium num">
            {preview && (
              <span className={cn("inline-flex items-center gap-1", TONE_CLASS[preview.tone])}>
                <span className="text-ink-muted">→</span>
                {preview.tone === "muted" && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                {preview.text}
              </span>
            )}
          </p>
        </div>
      </fieldset>

      {formError && <p className="text-xs text-critical">{formError}</p>}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          {entry &&
            onDelete &&
            (confirmDelete ? (
              <span className="flex flex-wrap items-center gap-2 text-sm text-ink-secondary">
                Delete this{entry.covered_category ? ` and its ${entry.covered_category.label} expense` : ""}?
                <Button type="button" variant="destructive" size="sm" disabled={saving} onClick={() => run(onDelete)}>
                  Delete
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
                  Keep
                </Button>
              </span>
            ) : (
              <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmDelete(true)}>
                Delete
              </Button>
            ))}
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={saving}>
            {saving ? "Saving…" : entry ? "Save" : `Add${categoryName ? ` to ${categoryName}` : ""}`}
          </Button>
        </div>
      </div>
    </form>
  );
}
