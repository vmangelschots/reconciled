import { AlertTriangle } from "lucide-react";
import { useEffect, useState } from "react";
import { applyPlan, previewApply } from "../api/plans";
import { cn } from "../lib/cn";
import { formatMoneyWhole as whole } from "../lib/money";
import { changeLine, longMonth } from "../lib/yearPlans";
import { Button } from "./ui/Button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/Dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/Select";
import { Skeleton } from "./ui/Skeleton";

/**
 * Apply a draft from a month: the preview of every change to the real
 * budget, kind switches first, then confirm - see specs/year-plans,
 * "Apply preview" and "Applying a draft". `firstMonth` is the earliest month
 * it may apply from (this month for the current year).
 */
export function ApplyPlanDialog({ plan, open, firstMonth, onClose, onApplied }) {
  const [fromMonth, setFromMonth] = useState(Math.max(plan.from_month, firstMonth));
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(null);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (!open) return;
    let live = true;
    setPreview(null);
    setError(null);
    previewApply(plan.id, fromMonth)
      .then((data) => live && setPreview(data))
      .catch((e) => live && setError(e.data?.detail ?? e.message));
    return () => {
      live = false;
    };
  }, [open, plan.id, fromMonth]);

  async function apply() {
    setApplying(true);
    setError(null);
    try {
      await applyPlan(plan.id, fromMonth);
      onApplied(fromMonth);
    } catch (e) {
      setError(e.data?.detail ?? e.message);
    } finally {
      setApplying(false);
    }
  }

  const months = Array.from({ length: 13 - firstMonth }, (_, i) => firstMonth + i);
  const lines = preview?.changes.map((change) => ({ key: change.category_id, ...changeLine(change) })) ?? [];
  const partSpent = preview?.part_spent_cents;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Apply {plan.name}?</DialogTitle>
          <DialogDescription>From the month you pick, this draft becomes your budget. Earlier months keep theirs.</DialogDescription>
        </DialogHeader>
        <label className="flex items-center gap-2 text-sm text-ink-secondary">
          From
          <Select value={String(fromMonth)} onValueChange={(v) => setFromMonth(Number(v))}>
            <SelectTrigger className="h-8 w-36" aria-label="Apply from">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {months.map((m) => (
                <SelectItem key={m} value={String(m)}>
                  {longMonth(m)} {plan.year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <div className="flex max-h-[50vh] flex-col gap-3 overflow-y-auto">
          {preview == null && !error && (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          )}
          {partSpent != null && (
            <p className="flex items-start gap-1.5 text-sm text-warning">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {longMonth(fromMonth)} is under way. {whole(partSpent)} already spent counts against the new amounts.
            </p>
          )}
          {preview?.nothing_to_apply && (
            <p className="text-sm text-ink-secondary">
              This draft matches the budget from {longMonth(fromMonth)}. Nothing to apply.
            </p>
          )}
          {lines.length > 0 && (
            <ul className="flex flex-col divide-y divide-border" aria-label="Changes">
              {lines.map((line) => (
                <li key={line.key} className="flex flex-col py-2">
                  <span className={cn("text-sm font-medium", line.warning ? "text-warning" : "text-ink-primary")}>{line.title}</span>
                  {line.detail && <span className="num text-xs text-ink-muted">{line.detail}</span>}
                </li>
              ))}
            </ul>
          )}
          {preview?.income && (
            <p className="text-sm text-ink-secondary">
              Income: {preview.income.lines} {preview.income.lines === 1 ? "line becomes" : "lines become"} Current&apos;s (
              {whole(preview.income.to_cents)} a year).
            </p>
          )}
          {preview?.changed_since_copy?.length > 0 && (
            <section aria-label="Changed since you copied it">
              <h3 className="pb-1.5 text-xs font-medium tracking-wide text-ink-muted uppercase">Changed since you copied it</h3>
              <ul className="flex flex-col divide-y divide-border rounded-lg bg-surface-2">
                {preview.changed_since_copy.map((item) => (
                  <li key={item.category_id} className="px-3 py-2 text-xs text-ink-secondary">
                    {item.category_name}: the draft keeps {item.draft_cents == null ? "none" : whole(item.draft_cents)}, the budget
                    has {item.to_cents == null ? "none" : whole(item.to_cents)} now. Applying sets{" "}
                    {item.draft_cents == null ? "none" : whole(item.draft_cents)}.
                  </li>
                ))}
              </ul>
            </section>
          )}
          {error && <p className="text-sm text-critical" role="alert">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          {!preview?.nothing_to_apply && (
            <Button disabled={!preview || applying} onClick={apply}>
              Apply from {longMonth(fromMonth)}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
