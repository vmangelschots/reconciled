import { Check, ChevronLeft, HandCoins } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { listCategories } from "../api/categories";
import { getTab } from "../api/tabs";
import { updateTransaction } from "../api/transactions";
import { CategoryCombobox } from "../components/CategoryCombobox";
import { Card, CardContent } from "../components/ui/Card";
import { useToast } from "../components/ui/Toast";
import { cn } from "../lib/cn";
import { formatShortDate } from "../lib/dates";
import { formatMoney } from "../lib/money";
import { isStale, tabSentence, TONE_CLASS } from "../lib/tabs";

function errorMessage(e) {
  return e.data ? Object.values(e.data).flat().join(" ") : e.message;
}

// Rows split into stretches that each end where the balance reaches zero;
// the last one may still be open.
function stretches(rows) {
  const result = [];
  let current = [];
  for (const row of rows) {
    current.push(row);
    if (row.running_balance_cents === 0) {
      result.push({ rows: current, settled: true });
      current = [];
    }
  }
  if (current.length > 0) result.push({ rows: current, settled: false });
  return result;
}

// The running balance in words, like the tab's own balance.
function runningLabel(cents) {
  if (cents > 0) return `owes ${formatMoney(cents)}`;
  if (cents < 0) return `you owe ${formatMoney(-cents)}`;
  return "settled";
}

// onSettle is only given for rows still open: a repaid row moved to
// another category would leave the tab owing the other way.
function TabRow({ row, categories, onSettle }) {
  const lent = row.amount_cents < 0;
  const meta = [
    row.split_parent != null && `part of ${formatMoney(Math.abs(row.parent_amount_cents))}`,
    row.notes,
  ].filter(Boolean);
  return (
    <li className="flex items-start gap-3 py-2.5">
      <span className="w-14 shrink-0 pt-0.5 text-xs tabular-nums text-ink-muted">{formatShortDate(row.date)}</span>
      <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
        <span className="w-full truncate text-sm text-ink-primary">{row.payee}</span>
        {meta.length > 0 && <span className="w-full truncate text-xs text-ink-muted">{meta.join(" · ")}</span>}
        {lent && onSettle && (
          <CategoryCombobox
            categories={categories}
            value={null}
            onSelect={(categoryId) => onSettle(row, categoryId)}
            placeholder="Settled outside the account…"
            clearLabel="Uncategorized"
            aria-label={`Settle ${row.payee} outside the account`}
            className="h-7 min-w-0 max-w-full border-dashed text-xs text-ink-secondary"
          />
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5 text-right">
        <span className="text-sm tabular-nums text-ink-primary">
          <span className="mr-1.5 text-xs text-ink-muted">{lent ? "lent" : "repaid"}</span>
          {formatMoney(Math.abs(row.amount_cents))}
        </span>
        <span className="text-xs tabular-nums text-ink-muted">{runningLabel(row.running_balance_cents)}</span>
      </div>
    </li>
  );
}

function SettledDivider() {
  return (
    <li className="flex items-center gap-2 py-1 text-xs text-ink-muted" role="separator">
      <span className="h-px flex-1 bg-border" />
      <Check className="h-3.5 w-3.5" aria-hidden="true" />
      Settled
      <span className="h-px flex-1 bg-border" />
    </li>
  );
}

/**
 * One tab: its balance in words and its rows oldest first with a running
 * balance. Each stretch that ends at zero gets a "Settled" divider; only
 * the latest stretch shows until "Show earlier". A lent row can be
 * settled outside the account by moving it to another category. See
 * specs/repayment-tabs.
 */
export function TabPage() {
  const { id } = useParams();
  const toast = useToast();
  const [tab, setTab] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [categories, setCategories] = useState([]);
  const [showEarlier, setShowEarlier] = useState(false);

  function load() {
    return getTab(id)
      .then(setTab)
      .catch((e) => {
        if (e.status === 404) setNotFound(true);
        else toast.error(errorMessage(e));
      });
  }

  useEffect(() => {
    setTab(null);
    setNotFound(false);
    setShowEarlier(false);
    load();
    listCategories()
      .then(setCategories)
      .catch((e) => toast.error(errorMessage(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleSettle(row, categoryId) {
    try {
      await updateTransaction(row.id, { category: categoryId });
      const name = categories.find((c) => c.id === categoryId)?.name ?? "Uncategorized";
      toast.success(`Moved ${row.payee} to ${name}.`);
    } catch (e) {
      toast.error(errorMessage(e));
    }
    await load();
  }

  const back = (
    <Link to="/" className="flex items-center gap-1 self-start text-sm text-ink-secondary hover:text-ink-primary">
      <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      Dashboard
    </Link>
  );

  if (notFound) {
    return (
      <section className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        {back}
        <p className="text-sm text-ink-secondary">Tab not found.</p>
      </section>
    );
  }
  if (!tab) {
    return (
      <section className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        {back}
        <p className="text-sm text-ink-secondary">Loading...</p>
      </section>
    );
  }

  const sentence = tabSentence(tab.name, tab.balance_cents);
  const parts = stretches(tab.rows);
  const hidden = showEarlier ? [] : parts.slice(0, -1);
  const shown = showEarlier ? parts : parts.slice(-1);
  const hiddenCount = hidden.reduce((n, s) => n + s.rows.length, 0);
  // Moving a lent row to another tab isn't settling it.
  const settleCategories = categories.filter((c) => !c.is_tab);

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      {back}
      <header className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-sm text-ink-secondary">
          <HandCoins className="h-4 w-4" aria-hidden="true" />
          {tab.group_name} / {tab.name}
        </h1>
        <p className={cn("flex items-center gap-1.5 text-2xl font-semibold", TONE_CLASS[sentence.tone])}>
          {sentence.tone === "muted" && <Check className="h-5 w-5" aria-hidden="true" />}
          {sentence.text}
        </p>
        {tab.open_since && (
          <p className={cn("text-sm", isStale(tab.open_since) ? "text-warning" : "text-ink-muted")}>
            open since {formatShortDate(tab.open_since)}
          </p>
        )}
      </header>

      <Card>
        <CardContent className="pt-2 pb-2">
          {tab.rows.length === 0 && <p className="py-4 text-sm text-ink-secondary">Nothing on this tab yet.</p>}
          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => setShowEarlier(true)}
              className="w-full py-2 text-xs text-ink-muted hover:text-ink-secondary"
            >
              Show earlier ({hiddenCount} settled {hiddenCount === 1 ? "row" : "rows"})
            </button>
          )}
          <ul className="flex flex-col divide-y divide-border">
            {shown.map((stretch, i) => [
              ...stretch.rows.map((row) => (
                <TabRow
                  key={row.id}
                  row={row}
                  categories={settleCategories}
                  onSettle={stretch.settled ? undefined : handleSettle}
                />
              )),
              stretch.settled && <SettledDivider key={`settled-${i}`} />,
            ])}
          </ul>
        </CardContent>
      </Card>
    </section>
  );
}
