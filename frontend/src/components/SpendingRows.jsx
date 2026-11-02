import { Link } from "react-router-dom";
import { cn } from "../lib/cn";
import { formatShortDate } from "../lib/dates";
import { formatMoney } from "../lib/money";
import { CategoryCombobox } from "./CategoryCombobox";
import { Skeleton } from "./ui/Skeleton";

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

export function SpendingRows({ spending, categories, emptyText = "Nothing left here." }) {
  const { cell, savingId, pick } = spending;
  const data = cell.data;
  return (
    <>
      {cell.error && <p className="px-5 py-4 text-sm text-critical">Couldn't load these transactions.</p>}
      {!cell.error && !data && (
        <div data-testid="sheet-loading" className="flex flex-col gap-2.5 px-5 py-4">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      )}
      {data && data.rows.length === 0 && <p className="px-5 py-4 text-sm text-ink-muted">{emptyText}</p>}
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
    </>
  );
}
