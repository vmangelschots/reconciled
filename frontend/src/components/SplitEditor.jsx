import { Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { categoryDisplayLabel } from "../lib/categoryTree";
import { cn } from "../lib/cn";
import { formatMoney } from "../lib/money";
import { CategoryCombobox } from "./CategoryCombobox";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";

// "30", "30.5" or "30,50" -> 3050; anything else (or nothing) -> null.
function parseCents(text) {
  const normalized = text.trim().replace(",", ".");
  if (!/^\d+(\.\d{0,2})?$/.test(normalized)) return null;
  return Math.round(parseFloat(normalized) * 100);
}

function centsText(cents) {
  return (cents / 100).toFixed(2);
}

let nextKey = 0;
function line(fields) {
  nextKey += 1;
  return { key: nextKey, id: null, amount: "", category: null, transferAccountId: null, notes: "", ...fields };
}

function initialLines(transaction) {
  if (transaction.parts?.length) {
    return transaction.parts.map((p) =>
      line({
        id: p.id,
        amount: centsText(Math.abs(p.amount_cents)),
        category: p.category,
        transferAccountId: p.transfer?.account_id ?? null,
        notes: p.notes,
      }),
    );
  }
  // The current category (a guess too: it is saved confirmed) or transfer
  // starts on the first line, which holds whatever the other lines leave.
  return [
    line({
      amount: centsText(Math.abs(transaction.amount_cents)),
      category: transaction.transfer ? null : transaction.category,
      transferAccountId: transaction.transfer?.account_id ?? null,
    }),
    line(),
  ];
}

// What unsplitting keeps: the category, or transfer target, every part
// shares; nothing when they differ.
function sharedTarget(parts) {
  const [first, ...rest] = parts;
  if (!first) return {};
  const accountOf = (p) => p.transfer?.account_id ?? null;
  if (accountOf(first) != null) {
    return rest.every((p) => accountOf(p) === accountOf(first)) ? { transfer_account: accountOf(first) } : {};
  }
  if (first.category == null) return {};
  return rest.every((p) => accountOf(p) == null && p.category === first.category) ? { category: first.category } : {};
}

/**
 * The inline editor for splitting a transaction into parts, or changing or
 * undoing its split. Amounts are typed without a sign and take the
 * transaction's. The first line holds whatever the others leave until its
 * own amount is edited, so a two-way split is one number and one pick.
 * See specs/transaction-splits.
 *
 * - onSave(parts): saves [{ id?, amount_cents, category, transfer_account,
 *   notes }]; rejects with the API error ({ detail, line } in error.data).
 * - onUnsplit(keep): unsplits, keeping { category } / { transfer_account }
 *   or nothing.
 * - onCancel(): closes without saving.
 */
export function SplitEditor({ transaction, categories, transferAccounts, onSave, onUnsplit, onCancel }) {
  const isSplit = transaction.parts?.length > 0;
  const sign = transaction.amount_cents < 0 ? -1 : 1;
  const total = Math.abs(transaction.amount_cents);
  const [lines, setLines] = useState(() => initialLines(transaction));
  // Until its amount is edited, the first line follows the remainder.
  const [firstTouched, setFirstTouched] = useState(false);
  const [lastEdited, setLastEdited] = useState(null);
  const [saving, setSaving] = useState(false);
  const [confirmUnsplit, setConfirmUnsplit] = useState(false);
  const [error, setError] = useState(null); // { line, message }
  const amountRefs = useRef({});
  const categoriesById = Object.fromEntries(categories.map((c) => [c.id, c]));
  const accountName = (id) => transferAccounts.find((a) => a.id === id)?.name;

  useEffect(() => {
    // A new split goes straight to the second amount; an existing one to
    // its first.
    const target = isSplit ? lines[0] : lines[1];
    amountRefs.current[target.key]?.focus();
    // Only on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const othersCents = lines.slice(1).reduce((sum, l) => sum + (parseCents(l.amount) ?? 0), 0);
  const firstDerived = Math.max(total - othersCents, 0);
  const centsOf = (l, index) => (index === 0 && !firstTouched ? firstDerived : parseCents(l.amount));
  const amounts = lines.map(centsOf);
  const left = total - amounts.reduce((sum, c) => sum + (c ?? 0), 0);
  const missingAmount = amounts.some((c) => !c);
  const canSave = left === 0 && !missingAmount && !saving;
  const minLines = isSplit ? 1 : 2;

  // Parts saved as transfers whose counterpart the app created: removing
  // them also removes that transaction.
  const keptIds = new Set(lines.map((l) => l.id));
  const removedCreated = (transaction.parts ?? []).filter(
    (p) => !keptIds.has(p.id) && p.transfer?.created_by_transfer,
  );

  function update(key, fields) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...fields } : l)));
    setError(null);
  }

  function changeAmount(index, text) {
    if (index === 0) setFirstTouched(true);
    setLastEdited(lines[index].key);
    update(lines[index].key, { amount: text });
  }

  // Leaving the last line's amount while money is still left adds a line
  // for it, so the mouse is never needed to add a part.
  function handleAmountBlur(index) {
    const isLast = index === lines.length - 1;
    if (isLast && index > 0 && parseCents(lines[index].amount) && left > 0) addLine();
  }

  function addLine() {
    setLines((prev) => [...prev, line()]);
  }

  function removeLine(key) {
    setLines((prev) => prev.filter((l) => l.key !== key));
    setError(null);
  }

  function lineTarget(l) {
    return l.transferAccountId != null ? { transfer_account: l.transferAccountId } : l.category != null ? { category: l.category } : {};
  }

  function targetLabel(l) {
    if (l.transferAccountId != null) return `${sign < 0 ? "→" : "←"} ${accountName(l.transferAccountId) ?? "account"}`;
    if (l.category != null && categoriesById[l.category]) return categoryDisplayLabel(categoriesById[l.category], categoriesById);
    return "Uncategorized";
  }

  async function run(action) {
    setSaving(true);
    try {
      await action();
    } catch (e) {
      const lineIndex = e.data?.line;
      setError({ line: Number.isInteger(lineIndex) ? lineIndex : null, message: e.data?.detail || e.message });
      setSaving(false);
    }
  }

  function save() {
    if (!canSave) return;
    if (lines.length === 1) {
      run(() => onUnsplit(lineTarget(lines[0])));
      return;
    }
    run(() =>
      onSave(
        lines.map((l, index) => ({
          ...(l.id != null ? { id: l.id } : {}),
          amount_cents: sign * amounts[index],
          category: l.transferAccountId != null ? null : l.category,
          transfer_account: l.transferAccountId,
          notes: l.notes,
        })),
      ),
    );
  }

  function handleKeyDown(e) {
    // Escape inside an open picker only closes the picker: its list is in
    // a portal, so it isn't inside this element in the DOM.
    if (e.key === "Escape" && e.currentTarget.contains(e.target)) {
      e.preventDefault();
      onCancel();
    }
  }

  let status;
  if (left > 0) status = { text: `${formatMoney(left)} left to assign`, className: "text-warning" };
  else if (left < 0) status = { text: `${formatMoney(-left)} over`, className: "text-critical" };
  else status = { text: "All assigned ✓", className: "text-success" };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      onKeyDown={handleKeyDown}
      aria-label="Split transaction"
      className="sticky left-0 flex max-w-[calc(100vw-2rem)] flex-col gap-3 rounded-md border border-border bg-surface p-3"
    >
      <fieldset disabled={saving} className="flex flex-col gap-2">
        {lines.map((l, index) => {
          const lineError = error?.line === index;
          const over = left < 0 && lastEdited === l.key;
          return (
            <div key={l.key} className="flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
                <div className="relative">
                  <span className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-sm text-ink-muted">€</span>
                  <Input
                    ref={(el) => {
                      amountRefs.current[l.key] = el;
                    }}
                    aria-label={`Part ${index + 1} amount`}
                    inputMode="decimal"
                    value={index === 0 && !firstTouched ? centsText(firstDerived) : l.amount}
                    onChange={(e) => changeAmount(index, e.target.value)}
                    onBlur={() => handleAmountBlur(index)}
                    placeholder={left > 0 ? centsText(left) : "0.00"}
                    className={cn(
                      "w-28 pl-6 text-right tabular-nums",
                      (lineError || over) && "border-critical ring-1 ring-critical",
                    )}
                  />
                </div>
                <CategoryCombobox
                  categories={categories}
                  value={l.category}
                  onSelect={(id) => update(l.key, { category: id, transferAccountId: null })}
                  transferAccounts={transferAccounts}
                  transferAccountId={l.transferAccountId}
                  transferAccountName={accountName(l.transferAccountId)}
                  direction={sign < 0 ? "out" : "in"}
                  onSelectTransfer={(id) => update(l.key, { transferAccountId: id, category: null })}
                  placeholder="Uncategorized"
                  aria-label={`Part ${index + 1} category`}
                  className="w-48"
                />
                <Input
                  aria-label={`Part ${index + 1} notes`}
                  value={l.notes}
                  onChange={(e) => update(l.key, { notes: e.target.value })}
                  placeholder="Notes"
                  className="w-full sm:w-auto sm:flex-1"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Remove part ${index + 1}`}
                  disabled={lines.length <= minLines}
                  onClick={() => removeLine(l.key)}
                  className="px-2"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
              {lineError && <p className="text-xs text-critical">{error.message}</p>}
            </div>
          );
        })}
      </fieldset>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <Button type="button" variant="ghost" size="sm" onClick={addLine} disabled={saving}>
          <Plus className="h-3.5 w-3.5" />
          Add part
        </Button>
        <p role="status" className={cn("font-medium tabular-nums", status.className)}>
          {status.text}
          {missingAmount && <span className="ml-2 font-normal text-ink-secondary">· a part needs an amount</span>}
        </p>
      </div>

      {removedCreated.map((p) => (
        <p key={p.id} className="text-xs text-ink-secondary">
          Also removes the linked {p.transfer.account_name} transaction.
        </p>
      ))}
      {error && error.line == null && <p className="text-xs text-critical">{error.message}</p>}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          {isSplit &&
            (confirmUnsplit ? (
              <span className="flex items-center gap-2 text-sm text-ink-secondary">
                Unsplit? This removes {transaction.parts.length} parts.
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={saving}
                  onClick={() => run(() => onUnsplit(sharedTarget(transaction.parts)))}
                >
                  Unsplit
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmUnsplit(false)}>
                  Keep split
                </Button>
              </span>
            ) : (
              <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmUnsplit(true)}>
                Unsplit
              </Button>
            ))}
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={!canSave}>
            {saving ? "Saving…" : lines.length === 1 ? `Unsplit to ${targetLabel(lines[0])}` : "Save split"}
          </Button>
        </div>
      </div>
    </form>
  );
}
