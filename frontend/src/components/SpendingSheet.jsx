import { Link } from "react-router-dom";
import { formatMoneyWhole } from "../lib/money";
import { monthLabel } from "../lib/months";
import { useReviewCount } from "../review/ReviewCountContext";
import { useSpendingCell } from "../hooks/useSpendingCell";
import { SpendingRows } from "./SpendingRows";
import { DialogTitle } from "./ui/Dialog";
import { Sheet } from "./ui/Sheet";

function plural(n, one) {
  return `${n} ${one}${n === 1 ? "" : "s"}`;
}

// One figure's sheet; a new figure mounts a new one, so its rows never show
// another figure's.
function SheetBody({ selection, categories, onChanged }) {
  const spending = useSpendingCell(selection, onChanged);
  const data = spending.cell.data;

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
        <SpendingRows spending={spending} categories={categories} />
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
    <Sheet open={selection != null} onClose={onClose} wide={wide}>
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
    </Sheet>
  );
}
