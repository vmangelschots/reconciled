import { Link } from "react-router-dom";
import { useState } from "react";
import { getSpendingCell } from "../api/reports";
import { updateTransaction } from "../api/transactions";
import { useReport } from "../hooks/useReport";
import { cn } from "../lib/cn";
import { formatShortDate } from "../lib/dates";
import { formatMoney, formatMoneyWhole } from "../lib/money";
import { monthLabel } from "../lib/months";
import { useReviewCount } from "../review/ReviewCountContext";
import { CategoryCombobox } from "./CategoryCombobox";
import { Dialog, DialogContent, DialogTitle } from "./ui/Dialog";
import { Skeleton } from "./ui/Skeleton";
import { useToast } from "./ui/Toast";

const PLACE = {
  side: "bottom-0 left-auto right-0 top-0 h-full max-w-md translate-x-0 translate-y-0 rounded-none",
  bottom: "top-auto bottom-0 left-0 max-h-[85vh] max-w-none translate-x-0 translate-y-0 rounded-b-none rounded-t-2xl",
};

function plural(n, one) {
  return `${n} ${one}${n === 1 ? "" : "s"}`;
}

// Last day of "YYYY-MM", for the ledger link's date range.
function monthRange(month) {
  const [year, m] = month.split("-").map(Number);
  const last = new Date(year, m, 0).getDate();
  return `from=${month}-01&to=${month}-${String(last).padStart(2, "0")}`;
}

function Row({ row, month, categories, saving, onPick }) {
  const refund = row.amount_cents > 0;
  return (
    <li className={cn("flex flex-col gap-1.5 border-b border-border px-5 py-3 last:border-0", saving && "opacity-60")}>
      <div className="flex items-baseline justify-between gap-3">
        <Link
          to={`/transactions/${row.account_id}?${monthRange(month)}`}
          className="min-w-0 truncate text-sm font-medium text-ink-primary hover:underline"
          title={row.payee}
        >
          {row.payee}
        </Link>
        <span className={cn("num shrink-0 text-sm", refund ? "text-positive" : "text-ink-primary")}>
          {refund ? "+" : ""}
          {formatMoney(row.amount_cents)}
        </span>
      </div>
      <div className="flex items-center justify-between gap-3 text-xs text-ink-muted">
        <span className="min-w-0 truncate">
          {formatShortDate(row.date)} · {row.account_name}
        </span>
        {row.split_amount_cents != null && (
          <span className="shrink-0">Part of {formatMoney(Math.abs(row.split_amount_cents))}</span>
        )}
      </div>
      {row.split_amount_cents != null ? (
        <span className="text-xs text-ink-secondary">{row.category_label}</span>
      ) : (
        <CategoryCombobox
          categories={categories}
          value={row.category}
          onSelect={onPick}
          restoreFocusOnSelect={false}
          className="w-full"
          aria-label={`Category for ${row.payee} on ${row.date}`}
        />
      )}
    </li>
  );
}

// One figure's sheet; a new figure mounts a new one, so its rows never show
// another figure's.
function SheetBody({ selection, categories, onChanged }) {
  const toast = useToast();
  const [version, setVersion] = useState(0);
  const [savingId, setSavingId] = useState(null);
  const cell = useReport(() => getSpendingCell(selection.month, selection.category, selection), version);
  const data = cell.data;

  async function pick(row, category) {
    setSavingId(row.id);
    try {
      await updateTransaction(row.id, { category });
      setVersion((v) => v + 1);
      onChanged();
    } catch {
      toast.error(`Couldn't change the category of ${row.payee}.`);
    } finally {
      setSavingId(null);
    }
  }

  return (
    <>
      <div className="border-b border-border px-5 py-4 pr-10">
        <DialogTitle className="text-base">
          {data ? `${data.name} · ${monthLabel(data.month)}` : "Transactions"}
        </DialogTitle>
        {data && data.rows.length > 0 && (
          <p className="mt-0.5 text-sm text-ink-secondary">
            {formatMoneyWhole(data.total_cents)} · {plural(data.rows.length, "transaction")} ·{" "}
            {data.accounts.join(", ")}
          </p>
        )}
        {data?.uncategorized && (
          <Link to="/review" className="mt-1 block text-sm text-accent hover:underline">
            Open Review →
          </Link>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {cell.error && <p className="px-5 py-4 text-sm text-critical">Couldn't load these transactions.</p>}
        {!cell.error && !data && (
          <div data-testid="sheet-loading" className="flex flex-col gap-2.5 px-5 py-4">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        )}
        {data && data.rows.length === 0 && <p className="px-5 py-4 text-sm text-ink-muted">Nothing left here.</p>}
        {data && data.rows.length > 0 && (
          <ul className="flex flex-col">
            {data.rows.map((row) => (
              <Row
                key={row.id}
                row={row}
                month={data.month}
                categories={categories}
                saving={savingId === row.id}
                onPick={(category) => pick(row, category)}
              />
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

/**
 * The rows behind one report figure, in a sheet from the side, or from the
 * bottom on a phone. Changing a category refreshes the sheet and tells the
 * page through onChanged. See specs/spending-report.
 * - selection: { category, direct, income, month } or null when closed.
 */
export function SpendingSheet({ selection, categories, wide, onClose, onChanged }) {
  const { refresh: refreshReviewCount } = useReviewCount();
  return (
    <Dialog open={selection != null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        aria-describedby={undefined}
        className={cn("flex flex-col overflow-hidden p-0", wide ? PLACE.side : PLACE.bottom)}
      >
        {selection && (
          <SheetBody
            key={`${selection.month}/${selection.category}/${selection.direct}/${selection.income}`}
            selection={selection}
            categories={categories}
            onChanged={() => {
              onChanged();
              refreshReviewCount();
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
