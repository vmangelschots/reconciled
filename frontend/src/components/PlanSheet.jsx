import { AlertTriangle, Landmark } from "lucide-react";
import { Fragment, useState } from "react";
import { Link } from "react-router-dom";
import { takeCurrentIntoPlan } from "../api/plans";
import { cn } from "../lib/cn";
import { formatMoneyWhole as whole } from "../lib/money";
import { currentMonth } from "../lib/months";
import { planCaption, shortMonth } from "../lib/yearPlans";
import { PlanBudgetEditor } from "./PlanBudgetEditor";
import { Button, buttonVariants } from "./ui/Button";
import { DialogTitle } from "./ui/Dialog";
import { Sheet } from "./ui/Sheet";
import { useToast } from "./ui/Toast";

// The year's months at a glance, read-only - see "Opening a row in Current".
function MonthStrip({ months, splitMonth }) {
  return (
    <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6" aria-label="Plan per month">
      {months.map((cents, i) => (
        <span
          key={i}
          className={cn(
            "flex flex-col rounded-lg px-2 py-1 text-xs",
            splitMonth != null && i + 1 < splitMonth ? "bg-surface-2 text-ink-muted" : "bg-surface ring-1 ring-border text-ink-secondary",
          )}
        >
          {shortMonth(i + 1)}
          <span className="num text-sm text-ink-primary">{cents == null ? "—" : whole(cents)}</span>
        </span>
      ))}
    </div>
  );
}

function Loans({ loans }) {
  return (
    <p className="flex items-start gap-1.5 text-sm text-ink-secondary">
      <Landmark className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
      <span>
        Set by{" "}
        {loans.map((loan, i) => (
          <Fragment key={loan.account_id}>
            {i > 0 && ", "}
            <Link to={`/transactions/${loan.account_id}/schedule`} className="text-accent hover:underline">
              {loan.name}
            </Link>
          </Fragment>
        ))}
        . Change it on the loan&apos;s schedule.
      </span>
    </p>
  );
}

/**
 * One row of a year plan in a sheet. In a draft it holds the draft editor;
 * on Current and applied plans it is read-only, with "Change in a new
 * draft" and "Open in month view" - see specs/year-plans.
 */
export function PlanSheet({ row, plan, view, wide, onSaved, onClose, onChangeInDraft }) {
  return (
    <Sheet open={row != null} onClose={onClose} wide={wide}>
      {row && <PlanSheetBody key={`${plan.id}/${row.category_id}`} row={row} plan={plan} view={view} onSaved={onSaved} onClose={onClose} onChangeInDraft={onChangeInDraft} />}
    </Sheet>
  );
}

function PlanSheetBody({ row, plan, view, onSaved, onClose, onChangeInDraft }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const draft = plan.kind === "draft";
  const year = view.year;
  const thisYear = Number(currentMonth().slice(0, 4));
  const monthViewMonth = year < thisYear ? `${year}-12` : currentMonth();
  const monthly = row.kind === "monthly" || row.kind === "bills";

  async function useCurrent() {
    setBusy(true);
    try {
      await takeCurrentIntoPlan(plan.id, row.category_id);
      onSaved(`${row.category_name} now uses the budget's ${whole(row.changed_since_copy.to_cents)}.`, false);
    } catch (e) {
      toast.error(e.data?.detail ?? e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="flex flex-col gap-1.5 border-b border-border px-5 py-4 pr-10">
        {draft && <p className="text-xs font-medium text-draft-ink">Editing draft {plan.name}</p>}
        <DialogTitle className="text-base">{row.category_name}</DialogTitle>
        <p className="num text-sm font-medium text-ink-primary">
          {whole(row.plan_cents)} for {year}
          {row.current && row.changed && (
            <span className="ml-2 text-xs font-normal text-ink-muted line-through">{whole(row.current.plan_cents)}</span>
          )}
        </p>
        <p className="text-xs text-ink-muted">
          {planCaption(row)}
          {row.actual_cents != null && ` · ${whole(row.actual_cents)} actual`}
        </p>
      </div>
      {draft && row.changed_since_copy && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border bg-surface-2 px-5 py-3 text-xs text-ink-secondary">
          <AlertTriangle className="h-3.5 w-3.5 text-warning" aria-hidden="true" />
          <span className="flex-1">
            The budget changed from {row.changed_since_copy.from_cents == null ? "none" : whole(row.changed_since_copy.from_cents)} to{" "}
            {whole(row.changed_since_copy.to_cents)} since you copied it.
          </span>
          <Button type="button" size="sm" variant="outline" className="h-7" disabled={busy} onClick={useCurrent}>
            Use {whole(row.changed_since_copy.to_cents)}
          </Button>
        </div>
      )}
      <div className="flex flex-col gap-4 px-5 py-4">
        {row.locked ? (
          <>
            <Loans loans={row.loans ?? []} />
            <MonthStrip months={row.months} />
          </>
        ) : draft ? (
          <PlanBudgetEditor plan={plan} row={row} onSaved={onSaved} onCancel={onClose} />
        ) : (
          <>
            {monthly && <MonthStrip months={row.months} splitMonth={plan.kind === "applied" ? plan.from_month : null} />}
            <div className="flex flex-wrap gap-2">
              {plan.kind === "current" && year >= thisYear && (
                <Button type="button" size="sm" onClick={() => onChangeInDraft(row.category_id)}>
                  Change in a new draft
                </Button>
              )}
              <Link
                to={`/budgets?month=${monthViewMonth}&category=${row.category_id}`}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                Open in month view
              </Link>
            </div>
            {plan.kind === "current" && (
              <p className="text-xs text-ink-muted">The year changes through a draft you apply from a month.</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
