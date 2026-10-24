import { Check, CheckCircle2, ChevronDown, History, Loader2, Sparkles, Tags } from "lucide-react";
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
import { Amount } from "../components/ui/Amount";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { PageHeader } from "../components/ui/PageHeader";
import { Panel } from "../components/ui/Panel";
import { useToast } from "../components/ui/Toast";
import { useAfterDelay } from "../hooks/useAfterDelay";
import { categoryDisplayLabel } from "../lib/categoryTree";
import { aiOutcomeLines, displayReason, sourceSplit } from "../lib/categorizeOutcome";
import { cn } from "../lib/cn";
import { formatDateSpan, formatShortDate } from "../lib/dates";
import { formatMoney } from "../lib/money";
import { useReviewCount } from "../review/ReviewCountContext";

// How long a resolved group or row takes to collapse; it's removed from the
// list once both this and its save are done. Matches duration-200 below.
const LEAVE_MS = 200;
const FAILED_HIGHLIGHT_MS = 1500;
// When a running backfill starts saying it can take a while.
const SLOW_HINT_MS = 4000;

const SECTION_TITLES = { history: "From your history", ai: "AI guesses" };
const SECTION_SUBLINES = {
  ai: "Guessed by AI for payees you haven't categorized before. Worth a closer look.",
};

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

// Where focus goes for a group: its Confirm, except for an AI guess, whose
// category picker gets it so confirming one is always a deliberate step.
function focusTarget(group) {
  return group.source === "ai" ? { kind: "picker", key: group.key } : { kind: "confirm", key: group.key };
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
  const [aiEnabled, setAiEnabled] = useState(false);
  const [backfill, setBackfill] = useState({ running: false, noMatchOf: null, aiLines: [] });

  const confirmRefs = useRef({});
  const pickerRefs = useRef({});
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
      else if (target.kind === "picker") pickerRefs.current[target.key]?.querySelector("button")?.focus();
      else if (target.kind === "row") rowPickerRefs.current[target.id]?.querySelector("button")?.focus();
      else emptyHeadingRef.current?.focus();
    }, 0);
  });

  const categoriesById = useMemo(() => Object.fromEntries(categories.map((c) => [c.id, c])), [categories]);

  function showGroups(data) {
    const next = data.groups.map(toGroupState);
    setGroups(next);
    setUncategorizedCount(data.uncategorized_count);
    setAiEnabled(Boolean(data.ai_enabled));
    if (next.length) pendingFocus.current = focusTarget(next[0]);
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
    pendingFocus.current = next ? focusTarget(next) : { kind: "empty" };
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
      pendingFocus.current = focusTarget(group);
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
      pendingFocus.current = next ? { kind: "row", id: next.id } : focusTarget(group);
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
    setBackfill((prev) => ({ ...prev, running: true }));
    try {
      const result = await categorizeUncategorized();
      if (result.categorized_count > 0) {
        const bySource = result.categorized_by_source;
        const split = bySource?.ai > 0 ? `: ${sourceSplit(bySource, "from history")}` : "";
        toast.success(`Guessed ${result.categorized_count} of ${result.attempted_count}${split}.`);
      }
      showGroups(await getReviewGroups());
      setBackfill({
        running: false,
        noMatchOf: result.categorized_count === 0 ? result.attempted_count : null,
        aiLines: aiOutcomeLines(result.ai),
      });
      refreshCount();
    } catch (e) {
      setBackfill((prev) => ({ ...prev, running: false }));
      toast.error(errorMessage(e));
    }
  }

  if (groups === null) {
    return (
      <section className="flex flex-col gap-4">
        <PageHeader title="Review" />
        <Panel loading />
      </section>
    );
  }

  const visible = groups.filter((g) => !isLeaving(g));
  const pendingBySource = {};
  for (const g of visible) pendingBySource[g.source] = (pendingBySource[g.source] ?? 0) + activeRows(g).length;
  const pendingCount = Object.values(pendingBySource).reduce((sum, n) => sum + n, 0);
  const sources = [...new Set(groups.map((g) => g.source))];

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <PageHeader title="Review" />
        {pendingCount > 0 && (
          <p className="text-sm text-ink-secondary">
            {pendingBySource.ai > 0
              ? `${plural(pendingCount, "transaction has", "transactions have")} a guessed category: ${sourceSplit(pendingBySource)}.`
              : `${plural(pendingCount, "transaction", "transactions")} got a category from your history.`}{" "}
            Confirm each group or pick the right category.
          </p>
        )}
        {visible.length > 0 &&
          backfill.aiLines.map((line) => (
            <p key={line} className="text-sm text-ink-secondary">
              {line}
            </p>
          ))}
      </div>

      {sources.map((source, index) => (
        <div key={source} className={cn("flex flex-col", index > 0 && pendingBySource[sources[0]] > 0 && "mt-6")}>
          {groups.some((g) => g.source === source && !isLeaving(g)) && (
            <div className="mb-2">
              <h2 className="text-xs font-medium tracking-wide text-ink-muted uppercase">
                {SECTION_TITLES[source] ?? "Guesses"}
              </h2>
              {SECTION_SUBLINES[source] && (
                <p className="text-xs text-ink-secondary">{SECTION_SUBLINES[source]}</p>
              )}
            </div>
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
                pickerRef={(el) => {
                  pickerRefs.current[group.key] = el;
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
          aiEnabled={aiEnabled}
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
  pickerRef,
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
  const isAi = group.source === "ai";
  const reason = isAi ? displayReason(group.reason) : "";

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
              <span className="num font-medium text-ink-primary">{formatMoney(total)}</span>
              <span className="hidden text-sm text-ink-secondary sm:inline">{countLabel}</span>
            </span>
          </div>
          <p className="text-sm text-ink-secondary">
            <span className="sm:hidden">{countLabel} · </span>
            {meta}
          </p>
          {isAi && (
            <p className="mt-2 flex items-center gap-1.5 text-sm text-ink-secondary">
              <Sparkles className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
              <span className="truncate" title={reason || undefined}>
                AI guess: <span className="font-medium text-ink-primary">{categoryName}</span>
                {reason && ` · ${reason}`}
              </span>
            </p>
          )}
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
            <Button
              ref={confirmRef}
              size="sm"
              variant={isAi ? "outline" : "default"}
              className="flex-1 sm:flex-none"
              onClick={onConfirm}
            >
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              Confirm {rows.length}
            </Button>
            <span ref={pickerRef} className="contents">
              <CategoryCombobox
                categories={categories}
                value={group.category}
                onSelect={onPick}
                suggestion={group.source}
                suggestionReason={group.reason}
                clearLabel="Leave uncategorized"
                restoreFocusOnSelect={false}
                className="flex-1 sm:w-48 sm:flex-none"
                aria-label={`Category for ${group.payee}`}
              />
            </span>
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
                      <span className="text-right text-sm text-ink-primary">
                        <Amount cents={row.amount_cents} signed />
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

function EmptyState({ headingRef, uncategorizedCount, aiEnabled, backfill, onBackfill }) {
  const slow = useAfterDelay(backfill.running && aiEnabled, SLOW_HINT_MS);
  const runningLabel = (
    <>
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      Guessing…
    </>
  );
  const slowHint = slow && <p className="text-xs text-ink-secondary">This can take up to a minute.</p>;
  const aiLines = backfill.aiLines.map((line) => (
    <p key={line} className="text-sm text-ink-secondary">
      {line}
    </p>
  ));
  const transactionsLink = (
    <Link to="/transactions" className="text-sm font-medium text-accent hover:underline">
      Categorize them in Transactions
    </Link>
  );

  let body;
  if (backfill.noMatchOf != null && aiEnabled) {
    body = (
      <>
        <p className="text-sm text-ink-secondary">
          Couldn&apos;t guess a category for any of the{" "}
          {plural(backfill.noMatchOf, "uncategorized transaction", "uncategorized transactions")}.
        </p>
        {aiLines}
        {transactionsLink}
        <Button variant="ghost" size="sm" onClick={onBackfill} disabled={backfill.running} className="mt-1">
          {backfill.running ? runningLabel : "Try again"}
        </Button>
        {slowHint}
      </>
    );
  } else if (backfill.noMatchOf != null) {
    body = (
      <>
        <p className="text-sm text-ink-secondary">
          None of the {plural(backfill.noMatchOf, "uncategorized transaction", "uncategorized transactions")} match a
          payee you&apos;ve categorized before.
        </p>
        {transactionsLink}
      </>
    );
  } else if (uncategorizedCount > 0) {
    const Icon = aiEnabled ? Tags : History;
    body = (
      <>
        <p className="text-sm text-ink-secondary">
          {uncategorizedCount === 1
            ? "1 transaction still has no category."
            : `${uncategorizedCount} transactions still have no category.`}
        </p>
        <Button onClick={onBackfill} disabled={backfill.running} className="mt-2">
          {backfill.running ? (
            runningLabel
          ) : (
            <>
              <Icon className="h-4 w-4" aria-hidden="true" />
              {aiEnabled ? "Guess categories" : "Guess categories from history"}
            </>
          )}
        </Button>
        {slowHint || (
          <p className="text-xs text-ink-secondary">
            {aiEnabled
              ? "Uses your history first, then AI for new payees."
              : "Only payees you've categorized before get a guess."}
          </p>
        )}
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
