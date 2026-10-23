import { Check, CheckCircle2, ChevronDown, History, Loader2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { listCategories } from "../api/categories";
import {
  categorizeUncategorized,
  confirmCategories,
  getReviewGroups,
  updateTransaction,
} from "../api/transactions";
import { CategoryCombobox } from "../components/CategoryCombobox";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { useToast } from "../components/ui/Toast";
import { categoryDisplayLabel } from "../lib/categoryTree";
import { cn } from "../lib/cn";
import { formatDateSpan, formatShortDate } from "../lib/dates";
import { formatMoney } from "../lib/money";
import { useReviewCount } from "../review/ReviewCountContext";

// How long a resolved group or row takes to collapse; it's removed from the
// list once both this and its save are done. Matches duration-200 below.
const LEAVE_MS = 200;
const FAILED_HIGHLIGHT_MS = 1500;

const SECTION_TITLES = { history: "From your history" };

function errorMessage(e) {
  return e.data ? Object.values(e.data).flat().join(" ") : e.message;
}

function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

function toGroupState(group) {
  return {
    ...group,
    leaving: false,
    settled: false,
    animDone: false,
    failed: false,
    expanded: false,
    transactions: group.transactions.map((t) => ({ ...t, leaving: false, settled: false, animDone: false })),
  };
}

// Rows still in the group (not on their way out).
function activeRows(group) {
  return group.transactions.filter((t) => !t.leaving);
}

function isLeaving(group) {
  return group.leaving || activeRows(group).length === 0;
}

function accountsLabel(accounts) {
  if (accounts.length <= 2) return accounts.join(", ");
  return `${accounts.slice(0, 2).join(", ")} +${accounts.length - 2}`;
}

function evidenceText({ matching, total }, direction) {
  const noun = direction === "in" ? ["deposit", "deposits"] : ["payment", "payments"];
  if (total === 1) return `1 earlier ${noun[0]} was`;
  if (matching === total) return `All ${total} earlier ${noun[1]} were`;
  return `${matching} of ${total} earlier ${noun[1]} were`;
}

// The wrapper collapses its card by animating grid rows to 0fr, so the gap
// below each card collapses with it.
function Collapsible({ leaving, children }) {
  return (
    <div
      inert={leaving}
      className={cn(
        "grid transition-[grid-template-rows,opacity,transform] duration-200 ease-out motion-reduce:transition-none",
        leaving ? "pointer-events-none translate-x-2 grid-rows-[0fr] opacity-0" : "grid-rows-[1fr]",
      )}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}

export function ReviewPage() {
  const toast = useToast();
  const { refresh: refreshCount } = useReviewCount();
  const [groups, setGroups] = useState(null);
  const [uncategorizedCount, setUncategorizedCount] = useState(0);
  const [categories, setCategories] = useState([]);
  const [backfill, setBackfill] = useState({ running: false, noMatchOf: null });

  const confirmRefs = useRef({});
  const rowPickerRefs = useRef({});
  const emptyHeadingRef = useRef(null);
  // Where focus should go once the next render has happened. Moved right
  // away rather than after the leave animation, so quick Enter presses
  // keep working; a timeout lets it win over the picker's own close focus.
  const pendingFocus = useRef(null);

  useEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    pendingFocus.current = null;
    setTimeout(() => {
      if (target.kind === "confirm") confirmRefs.current[target.key]?.focus();
      else if (target.kind === "row") rowPickerRefs.current[target.id]?.querySelector("button")?.focus();
      else emptyHeadingRef.current?.focus();
    }, 0);
  });

  const categoriesById = useMemo(() => Object.fromEntries(categories.map((c) => [c.id, c])), [categories]);

  function showGroups(data) {
    const next = data.groups.map(toGroupState);
    setGroups(next);
    setUncategorizedCount(data.uncategorized_count);
    if (next.length) pendingFocus.current = { kind: "confirm", key: next[0].key };
  }

  useEffect(() => {
    Promise.all([getReviewGroups(), listCategories()])
      .then(([data, cats]) => {
        setCategories(cats);
        showGroups(data);
      })
      .catch((e) => {
        setGroups([]);
        toast.error(errorMessage(e));
      });
    // Load once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateGroup(key, update) {
    setGroups((prev) =>
      prev.flatMap((g) => {
        if (g.key !== key) return [g];
        const next = update(g);
        return next.settled && next.animDone ? [] : [next];
      }),
    );
  }

  function updateRow(key, id, patch) {
    updateGroup(key, (g) => {
      const transactions = g.transactions
        .map((t) => (t.id === id ? { ...t, ...patch } : t))
        .filter((t) => !(t.settled && t.animDone));
      // A group whose last row was saved away is done too.
      return transactions.length ? { ...g, transactions } : { ...g, transactions, settled: true, animDone: true };
    });
  }

  // Focus goes to the next group that isn't leaving, else the previous one,
  // else the empty state's heading.
  function focusAfterGroup(key) {
    const visible = groups.filter((g) => !isLeaving(g));
    const index = visible.findIndex((g) => g.key === key);
    const next = visible[index + 1] ?? visible[index - 1];
    pendingFocus.current = next ? { kind: "confirm", key: next.key } : { kind: "empty" };
  }

  async function resolveGroup(group, categoryId) {
    const ids = activeRows(group).map((t) => t.id);
    focusAfterGroup(group.key);
    updateGroup(group.key, (g) => ({ ...g, leaving: true, settled: false, animDone: false, failed: false }));
    setTimeout(() => updateGroup(group.key, (g) => ({ ...g, animDone: true })), LEAVE_MS);
    try {
      if (categoryId === undefined || categoryId === group.category) {
        await confirmCategories(ids);
      } else if (categoryId === null) {
        await Promise.all(ids.map((id) => updateTransaction(id, { category: null })));
      } else {
        await confirmCategories(ids, categoryId);
      }
      updateGroup(group.key, (g) => ({ ...g, settled: true }));
      refreshCount();
    } catch (e) {
      pendingFocus.current = { kind: "confirm", key: group.key };
      updateGroup(group.key, (g) => ({ ...g, leaving: false, failed: true }));
      setTimeout(() => updateGroup(group.key, (g) => ({ ...g, failed: false })), FAILED_HIGHLIGHT_MS);
      toast.error(errorMessage(e));
    }
  }

  async function resolveRow(group, row, categoryId) {
    const rows = activeRows(group);
    if (rows.length === 1) {
      focusAfterGroup(group.key);
    } else {
      const index = rows.findIndex((t) => t.id === row.id);
      const next = rows[index + 1];
      pendingFocus.current = next ? { kind: "row", id: next.id } : { kind: "confirm", key: group.key };
    }
    updateRow(group.key, row.id, { leaving: true, settled: false, animDone: false });
    setTimeout(() => updateRow(group.key, row.id, { animDone: true }), LEAVE_MS);
    try {
      await updateTransaction(row.id, { category: categoryId });
      updateRow(group.key, row.id, { settled: true });
      refreshCount();
    } catch (e) {
      pendingFocus.current = { kind: "row", id: row.id };
      updateRow(group.key, row.id, { leaving: false });
      toast.error(errorMessage(e));
    }
  }

  function toggleExpanded(key) {
    updateGroup(key, (g) => ({ ...g, expanded: !g.expanded }));
  }

  async function runBackfill() {
    setBackfill({ running: true, noMatchOf: null });
    try {
      const result = await categorizeUncategorized();
      if (result.categorized_count > 0) {
        toast.success(`Guessed ${result.categorized_count} of ${result.attempted_count}.`);
      }
      showGroups(await getReviewGroups());
      setBackfill({ running: false, noMatchOf: result.categorized_count === 0 ? result.attempted_count : null });
      refreshCount();
    } catch (e) {
      setBackfill({ running: false, noMatchOf: null });
      toast.error(errorMessage(e));
    }
  }

  if (groups === null) {
    return (
      <section className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold text-ink-primary">Review</h1>
        <p className="text-sm text-ink-secondary">Loading…</p>
      </section>
    );
  }

  const visible = groups.filter((g) => !isLeaving(g));
  const pendingCount = visible.reduce((sum, g) => sum + activeRows(g).length, 0);
  const sources = [...new Set(groups.map((g) => g.source))];

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold text-ink-primary">Review</h1>
        {pendingCount > 0 && (
          <p className="text-sm text-ink-secondary">
            {plural(pendingCount, "transaction", "transactions")} got a category from your history. Confirm each
            group or pick the right category.
          </p>
        )}
      </div>

      {sources.map((source) => (
        <div key={source} className="flex flex-col">
          {groups.some((g) => g.source === source && !isLeaving(g)) && (
            <h2 className="mb-2 text-sm font-medium text-ink-secondary">{SECTION_TITLES[source] ?? "Guesses"}</h2>
          )}
          {groups
            .filter((g) => g.source === source)
            .map((group) => (
              <ReviewGroup
                key={group.key}
                group={group}
                categories={categories}
                categoriesById={categoriesById}
                confirmRef={(el) => {
                  confirmRefs.current[group.key] = el;
                }}
                rowPickerRef={(id) => (el) => {
                  rowPickerRefs.current[id] = el;
                }}
                onConfirm={() => resolveGroup(group)}
                onPick={(categoryId) => resolveGroup(group, categoryId)}
                onPickRow={(row, categoryId) => resolveRow(group, row, categoryId)}
                onToggle={() => toggleExpanded(group.key)}
              />
            ))}
        </div>
      ))}

      {visible.length === 0 && (
        <EmptyState
          headingRef={emptyHeadingRef}
          uncategorizedCount={uncategorizedCount}
          backfill={backfill}
          onBackfill={runBackfill}
        />
      )}
    </section>
  );
}

function ReviewGroup({
  group,
  categories,
  categoriesById,
  confirmRef,
  rowPickerRef,
  onConfirm,
  onPick,
  onPickRow,
  onToggle,
}) {
  const rows = activeRows(group);
  const total = rows.reduce((sum, t) => sum + t.amount_cents, 0);
  const category = categoriesById[group.category];
  const categoryName = category ? categoryDisplayLabel(category, categoriesById) : "this category";
  const dateFrom = rows[0]?.date ?? group.date_from;
  const dateTo = rows[rows.length - 1]?.date ?? group.date_to;
  const meta = `${accountsLabel(group.accounts)} · ${formatDateSpan(dateFrom, dateTo)}`;
  const countLabel = plural(rows.length, "transaction", "transactions");

  return (
    <Collapsible leaving={isLeaving(group)}>
      <div className="pb-3">
        <Card
          data-testid="review-group"
          className={cn(
            "p-4 transition-colors duration-200 focus-within:border-accent/40",
            isLeaving(group) && "border-success/50",
            group.failed && "animate-[review-return_200ms_ease-out] border-critical/50",
          )}
        >
          <div className="flex items-baseline justify-between gap-4">
            <span className="truncate text-base font-semibold text-ink-primary">{group.payee}</span>
            <span className="flex shrink-0 items-baseline gap-2">
              <span className="font-medium tabular-nums text-ink-primary">{formatMoney(total)}</span>
              <span className="hidden text-sm text-ink-secondary sm:inline">{countLabel}</span>
            </span>
          </div>
          <p className="text-sm text-ink-secondary">
            <span className="sm:hidden">{countLabel} · </span>
            {meta}
          </p>
          {group.evidence && (
            <p className="mt-2 flex items-center gap-1.5 text-sm text-ink-secondary">
              <History className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
              <span>
                {evidenceText(group.evidence, group.direction)}{" "}
                <span className="font-medium text-ink-primary">{categoryName}</span>
              </span>
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button ref={confirmRef} size="sm" className="flex-1 sm:flex-none" onClick={onConfirm}>
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              Confirm {rows.length}
            </Button>
            <CategoryCombobox
              categories={categories}
              value={group.category}
              onSelect={onPick}
              suggestion={group.source}
              clearLabel="Leave uncategorized"
              restoreFocusOnSelect={false}
              className="flex-1 sm:w-48 sm:flex-none"
              aria-label={`Category for ${group.payee}`}
            />
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto"
              aria-expanded={group.expanded}
              onClick={onToggle}
            >
              <span className="sr-only sm:not-sr-only">{group.expanded ? "Hide" : `Show ${rows.length}`}</span>
              <ChevronDown
                className={cn("h-3.5 w-3.5 transition-transform", group.expanded && "rotate-180")}
                aria-hidden="true"
              />
            </Button>
          </div>
          {group.expanded && (
            <ul className="mt-3 divide-y divide-border border-t border-border">
              {group.transactions.map((row) => (
                <li key={row.id}>
                  <Collapsible leaving={row.leaving}>
                    <div className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 py-2 sm:grid-cols-[4.5rem_1fr_auto_auto]">
                      <span className="hidden text-sm tabular-nums text-ink-secondary sm:block">
                        {formatShortDate(row.date)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm text-ink-primary">{row.payee}</p>
                        <p
                          className="truncate text-xs text-ink-secondary"
                          title={row.notes ? `${row.account} · ${row.notes}` : undefined}
                        >
                          <span className="sm:hidden">{formatShortDate(row.date)} · </span>
                          {row.account}
                          {row.notes ? ` · ${row.notes}` : ""}
                        </p>
                      </div>
                      <span className="text-right text-sm tabular-nums text-ink-primary">
                        {formatMoney(row.amount_cents)}
                      </span>
                      <span ref={rowPickerRef(row.id)} className="col-span-2 sm:col-span-1">
                        <CategoryCombobox
                          categories={categories}
                          value={group.category}
                          onSelect={(categoryId) => onPickRow(row, categoryId)}
                          suggestion={group.source}
                          clearLabel="Leave uncategorized"
                          restoreFocusOnSelect={false}
                          className="w-full sm:w-40"
                          aria-label={`Category for ${row.payee} on ${row.date}`}
                        />
                      </span>
                    </div>
                  </Collapsible>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </Collapsible>
  );
}

function EmptyState({ headingRef, uncategorizedCount, backfill, onBackfill }) {
  let body;
  if (backfill.noMatchOf != null) {
    body = (
      <>
        <p className="text-sm text-ink-secondary">
          None of the {plural(backfill.noMatchOf, "uncategorized transaction", "uncategorized transactions")} match a
          payee you&apos;ve categorized before.
        </p>
        <Link to="/transactions" className="text-sm font-medium text-accent hover:underline">
          Categorize them in Transactions
        </Link>
      </>
    );
  } else if (uncategorizedCount > 0) {
    body = (
      <>
        <p className="text-sm text-ink-secondary">
          {uncategorizedCount === 1
            ? "1 transaction still has no category."
            : `${uncategorizedCount} transactions still have no category.`}
        </p>
        <Button onClick={onBackfill} disabled={backfill.running} className="mt-2">
          {backfill.running ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <History className="h-4 w-4" aria-hidden="true" />
          )}
          {backfill.running ? "Guessing…" : "Guess categories from history"}
        </Button>
        <p className="text-xs text-ink-secondary">Only payees you&apos;ve categorized before get a guess.</p>
      </>
    );
  } else {
    body = <p className="text-sm text-ink-secondary">Every transaction has a category.</p>;
  }

  return (
    <Card className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      <CheckCircle2 className="h-8 w-8 text-success" aria-hidden="true" />
      <h2 ref={headingRef} tabIndex={-1} className="text-base font-semibold text-ink-primary focus:outline-none">
        Nothing to review
      </h2>
      {body}
    </Card>
  );
}
