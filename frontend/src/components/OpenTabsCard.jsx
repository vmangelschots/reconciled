import { Check, ChevronRight, HandCoins } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { formatShortDate } from "../lib/dates";
import { cn } from "../lib/cn";
import { isStale, tabSentence, TONE_CLASS } from "../lib/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/Card";

function plural(n, word) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function TabRow({ tab, compact }) {
  const sentence = tabSentence(tab.name, tab.balance_cents);
  const stale = isStale(tab.open_since);
  return (
    <li>
      <Link
        to={`/tabs/${tab.id}`}
        className={cn(
          "flex items-center gap-3 py-2 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
          compact ? "min-h-11 px-5" : "rounded-md px-2",
        )}
      >
        <span className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
          <span className={cn("flex items-center gap-1.5 text-sm", TONE_CLASS[sentence.tone])}>
            {sentence.tone === "muted" && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
            {sentence.tone === "muted" ? `${tab.name} · Settled` : sentence.text}
          </span>
          {tab.open_since && (
            <span className={cn("text-xs tabular-nums", stale ? "text-warning" : "text-ink-muted")}>
              open since {formatShortDate(tab.open_since)}
            </span>
          )}
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
      </Link>
    </li>
  );
}

/**
 * The dashboard's "Open tabs" card: what each person owes, open tabs
 * first (the API sorts by balance), settled ones behind a toggle. Renders
 * nothing when no tab exists. `compact` drops the card and its title, for
 * use inside a Panel. See specs/repayment-tabs.
 */
export function OpenTabsCard({ tabs, compact = false }) {
  const [showSettled, setShowSettled] = useState(false);
  if (tabs.length === 0) return null;

  const open = tabs.filter((t) => t.balance_cents !== 0);
  const settled = tabs.filter((t) => t.balance_cents === 0);

  const ulClass = compact ? "flex flex-col" : "-mx-2 flex flex-col";
  const content = (
    <div className={cn("flex flex-col gap-1", compact && "pb-3")}>
      {open.length === 0 && (
        <p className={cn("text-sm text-ink-secondary", compact ? "px-5" : "px-2")}>All tabs are settled.</p>
      )}
      {open.length > 0 && (
        <ul className={ulClass}>
          {open.map((t) => (
            <TabRow key={t.id} tab={t} compact={compact} />
          ))}
        </ul>
      )}
      {settled.length > 0 && (
        <>
          <button
            type="button"
            aria-expanded={showSettled}
            onClick={() => setShowSettled(!showSettled)}
            className={cn(
              "self-start rounded-sm px-2 py-1 text-xs text-ink-muted hover:text-ink-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
              compact && "mx-3",
            )}
          >
            {showSettled ? "Hide settled tabs" : `${plural(settled.length, "settled tab")} ▸`}
          </button>
          {showSettled && (
            <ul className={ulClass}>
              {settled.map((t) => (
                <TabRow key={t.id} tab={t} compact={compact} />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
  if (compact) return content;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <HandCoins className="h-4 w-4 text-ink-muted" aria-hidden="true" />
          Open tabs
        </CardTitle>
      </CardHeader>
      <CardContent>{content}</CardContent>
    </Card>
  );
}
