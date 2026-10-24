import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList, CommandSeparator } from "cmdk";
import { Check, ChevronsUpDown, HandCoins, History, Plus, Sparkles, Split } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { displayReason } from "../lib/categorizeOutcome";
import { categoryDisplayLabel, rankCategories, treeOrder } from "../lib/categoryTree";
import { cn } from "../lib/cn";
import { assignableCategories } from "../lib/tabs";
import { focusAdjacentTabbable } from "../lib/focus";

const CLEAR = "__clear__";
const CREATE = "__create__";
const SPLIT = "__split__";
// Transfer options use their own value space so they never collide with
// category ids in cmdk's highlight.
const TRANSFER_PREFIX = "account:";

const SUGGESTION_ICONS = { history: History, ai: Sparkles };
const SUGGESTION_TITLE = {
  history: () => "Guessed from history. Pick a category to confirm.",
  ai: (reason) => `Guessed by AI${reason ? ` (${reason})` : ""}. Pick a category to confirm.`,
};

/**
 * A searchable, keyboard-driven category picker. Filtering and ranking
 * are done ourselves (shouldFilter={false}, see rankCategories) rather
 * than by cmdk's fuzzy scorer, so matches are exact and predictable.
 *
 * The highlighted row is controlled too: cmdk re-selects its first item
 * whenever its own search state changes, which would land on the
 * "clear" option while the user types. So the search box is a plain
 * input (cmdk never sees a search), the rows render in ranked order, and
 * we set the highlight whenever the query changes.
 *
 * Keyboard: typing on the closed trigger opens it with that character;
 * Enter picks the highlighted row and returns focus to the trigger; Tab /
 * Shift+Tab pick the highlighted category (never "Create" or "Split…") and move on
 * to the neighboring field; Escape closes without changing anything.
 *
 * - categories: the candidate list (already restricted by the caller -
 *   e.g. the Budgets page's parent-picker passes only top-level
 *   categories; the ledger cell passes everything).
 * - value: the selected category's id, or null.
 * - onSelect(id | null): called when an existing category (or the
 *   "clear" option) is chosen.
 * - allowCreate + onCreate(name): when true, typing a name with no
 *   match offers "Create '<name>'"; selecting it calls onCreate.
 * - clearLabel: text for the "no category" option (defaults
 *   "Uncategorized"; the Budgets page's parent-picker passes "No
 *   parent (top-level)", the ledger filter "All").
 * - transferAccounts + onSelectTransfer(accountId): when given, the user's
 *   other accounts are offered after the categories as transfer targets
 *   ("→ Savings" for an outflow, "← Savings" for an inflow, per
 *   `direction`). transferAccountId / transferAccountName describe the
 *   current transfer, if the row is one. See specs/account-transfers.
 * - suggestion: null, or the source of an unconfirmed guess ("history" or
 *   "ai"). The trigger then shows the guess style - dashed border, italic
 *   label, a source icon - until the category is confirmed. See
 *   specs/auto-categorization.
 * - suggestionReason: an AI guess's short reason, shown in its tooltip.
 * - restoreFocusOnSelect: when false, picking a category leaves focus
 *   alone instead of returning it to the trigger (or the next field), for
 *   callers that remove the picker and move focus themselves - e.g. a
 *   Review group that disappears once its category is picked.
 * - Tabs (categories with is_tab) are listed after the other categories,
 *   in a group per tab group, by their own name and with a HandCoins icon;
 *   the trigger shows "Group / Tab" with the same icon. Tab groups are only
 *   headings and aren't offered, unless offerTabGroups is set (the Budgets
 *   page's parent picker, where a new tab is added under one). See
 *   specs/repayment-tabs.
 * - onSplit(): when given, a "Split…" action is offered - last, or first
 *   while the search is the start of "split", so "sp" + Enter splits even
 *   when a "Sports" category exists. Focus is left to the split editor.
 *   See specs/transaction-splits.
 */
export function CategoryCombobox({
  categories,
  value,
  onSelect,
  allowCreate = false,
  onCreate,
  clearLabel = "Uncategorized",
  placeholder = "Select category…",
  className,
  "aria-label": ariaLabel,
  transferAccounts = [],
  transferAccountId = null,
  transferAccountName,
  direction = "out",
  onSelectTransfer,
  suggestion = null,
  suggestionReason = "",
  restoreFocusOnSelect = true,
  onSplit,
  offerTabGroups = false,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState("");
  const triggerRef = useRef(null);
  // Set by Tab / Shift+Tab so the close handler moves focus on instead
  // of returning it to the trigger.
  const tabDirection = useRef(null);
  // Set when a category (or "no category") was picked, for
  // restoreFocusOnSelect.
  const picked = useRef(false);
  const splitChosen = useRef(false);

  const categoriesById = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.id, c])),
    [categories],
  );

  const arrow = direction === "in" ? "←" : "→";
  const transferLabel = (name) => `${arrow} ${name}`;

  function optionsFor(q) {
    const trimmed = q.trim();
    const lower = trimmed.toLowerCase();
    const offered = offerTabGroups ? categories : assignableCategories(categories);
    // Tree order: a parent, then its own subcategories. An empty search
    // shows it as is; a search ranks over it, so ties keep children near
    // their parent. See the category-picker spec.
    const tree = treeOrder(offered.filter((c) => !c.is_tab));
    const ranked = rankCategories(
      tree.map((t) => t.category),
      categoriesById,
      trimmed,
    );
    const tabs = rankCategories(
      offered.filter((c) => c.is_tab),
      categoriesById,
      trimmed,
    );
    // Accounts have no parent, so the category ranking applies as-is.
    const transfers = onSelectTransfer ? rankCategories(transferAccounts, {}, trimmed) : [];
    const showClear = !lower || clearLabel.toLowerCase().includes(lower);
    const exactMatch = categories.some((c) => c.name.toLowerCase() === lower);
    const showCreate = allowCreate && trimmed !== "" && !exactMatch;
    const splitFirst = Boolean(onSplit) && lower !== "" && "split".startsWith(lower);
    const showSplit = Boolean(onSplit) && (!lower || splitFirst);
    const depthById = Object.fromEntries(tree.map((t) => [t.category.id, t.depth]));
    return { trimmed, ranked, depthById, tabs, transfers, showClear, showCreate, showSplit, splitFirst };
  }

  function highlightFor(q) {
    const { trimmed, ranked, tabs, transfers, showClear, showCreate, splitFirst } = optionsFor(q);
    if (splitFirst) return SPLIT;
    if (!trimmed) {
      if (transferAccountId != null) return `${TRANSFER_PREFIX}${transferAccountId}`;
      return value != null && categoriesById[value] ? String(value) : CLEAR;
    }
    if (ranked.length > 0) return String(ranked[0].id);
    if (showClear) return CLEAR;
    if (tabs.length > 0) return String(tabs[0].id);
    if (transfers.length > 0) return `${TRANSFER_PREFIX}${transfers[0].id}`;
    if (showCreate) return CREATE;
    return "";
  }

  const { trimmed: trimmedQuery, ranked, depthById, tabs, transfers, showClear, showCreate, showSplit, splitFirst } =
    optionsFor(query);
  const hasChildren = new Set(
    ranked.map((c) => (c.parent_id !== undefined ? c.parent_id : c.parent)).filter((id) => id != null),
  );
  // One group per tab group, in the order its first match ranks.
  const tabGroups = [];
  for (const t of tabs) {
    const parentId = t.parent_id !== undefined ? t.parent_id : t.parent;
    let group = tabGroups.find((g) => g.parentId === parentId);
    if (!group) {
      group = { parentId, heading: categoriesById[parentId]?.name ?? "Tabs", items: [] };
      tabGroups.push(group);
    }
    group.items.push(t);
  }
  const selected = value != null ? categoriesById[value] : null;
  const currentTransferName =
    transferAccountId != null
      ? (transferAccounts.find((a) => a.id === transferAccountId)?.name ?? transferAccountName)
      : null;
  // Only a shown category can be a guess.
  const guessed = suggestion != null && selected != null && currentTransferName == null;
  const SuggestionIcon = SUGGESTION_ICONS[suggestion];

  function changeQuery(q) {
    setQuery(q);
    setHighlighted(highlightFor(q));
  }

  function openWith(q) {
    changeQuery(q);
    setOpen(true);
  }

  // Every way of closing goes through here, so the search never
  // survives to the next open.
  function handleOpenChange(next) {
    if (next) {
      openWith("");
      return;
    }
    setOpen(false);
    setQuery("");
    setHighlighted("");
  }

  function choose(category) {
    picked.current = true;
    onSelect(category ? category.id : null);
    handleOpenChange(false);
  }

  function chooseTransfer(accountId) {
    onSelectTransfer(accountId);
    handleOpenChange(false);
  }

  function chooseSplit() {
    // The editor that opens takes focus; the trigger must not take it back.
    splitChosen.current = true;
    onSplit();
    handleOpenChange(false);
  }

  // Closes at once; the caller shows the new category optimistically
  // while it is saved.
  function createAndSelect() {
    if (!trimmedQuery) return;
    onCreate(trimmedQuery);
    handleOpenChange(false);
  }

  function handleTriggerKeyDown(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      openWith("");
    } else if (e.key.length === 1 && e.key !== " ") {
      // Space keeps its default (a click), which opens with no search.
      e.preventDefault();
      openWith(e.key);
    }
  }

  function handleInputKeyDown(e) {
    if (e.key !== "Tab") return;
    e.preventDefault();
    if (highlighted === CLEAR) {
      picked.current = true;
      onSelect(null);
    } else if (highlighted.startsWith(TRANSFER_PREFIX)) {
      onSelectTransfer(Number(highlighted.slice(TRANSFER_PREFIX.length)));
    } else if (highlighted && highlighted !== CREATE && highlighted !== SPLIT) {
      picked.current = true;
      onSelect(Number(highlighted));
    }
    tabDirection.current = e.shiftKey ? "prev" : "next";
    handleOpenChange(false);
  }

  function handleCloseAutoFocus(e) {
    const wasPicked = picked.current;
    const wasSplit = splitChosen.current;
    picked.current = false;
    splitChosen.current = false;
    if (wasSplit || (wasPicked && !restoreFocusOnSelect)) {
      tabDirection.current = null;
      e.preventDefault();
      return;
    }
    const direction = tabDirection.current;
    if (!direction) return;
    tabDirection.current = null;
    e.preventDefault();
    if (!focusAdjacentTabbable(triggerRef.current, direction)) triggerRef.current.focus();
  }

  const groupClass =
    "[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-ink-muted";

  const itemClass =
    "flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm data-[selected=true]:bg-surface-2";

  // Listed first on an empty search, after every match otherwise.
  const splitItem = (
    <CommandItem value={SPLIT} onSelect={chooseSplit} className={cn(itemClass, "text-accent")}>
      <Split className="h-3.5 w-3.5" />
      Split…
    </CommandItem>
  );

  const clearItem = (
    <CommandItem value={CLEAR} onSelect={() => choose(null)} className={cn(itemClass, "text-ink-secondary")}>
      {value == null && transferAccountId == null && <Check className="h-3.5 w-3.5" />}
      {clearLabel}
    </CommandItem>
  );

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <PopoverPrimitive.Trigger asChild>
        <button
          ref={triggerRef}
          type="button"
          aria-label={ariaLabel}
          onKeyDown={handleTriggerKeyDown}
          title={guessed ? SUGGESTION_TITLE[suggestion]?.(displayReason(suggestionReason)) : undefined}
          data-suggestion={guessed ? suggestion : undefined}
          className={cn(
            "flex h-8 min-w-32 items-center justify-between gap-2 rounded-md border border-border bg-surface px-2 text-left text-sm text-ink-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
            // The solid surface and the accent icon keep a guess reading as
            // deliberate rather than disabled; the plain border token is
            // too faint once dashed.
            guessed && "border-dashed border-ink-muted/60 hover:border-solid hover:border-ink-muted",
            className,
          )}
        >
          <span className="flex min-w-0 items-center gap-1.5">
            {guessed && <SuggestionIcon className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />}
            {!guessed && selected?.is_tab && !currentTransferName && (
              <HandCoins className="h-3.5 w-3.5 shrink-0 text-ink-muted" aria-hidden="true" data-testid="tab-icon" />
            )}
            <span
              className={cn(
                "truncate",
                !selected && !currentTransferName && "text-ink-muted",
                guessed && "italic text-ink-secondary",
              )}
            >
              {currentTransferName
                ? transferLabel(currentTransferName)
                : selected
                  ? categoryDisplayLabel(selected, categoriesById)
                  : placeholder}
            </span>
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={4}
          onCloseAutoFocus={handleCloseAutoFocus}
          className="z-50 w-64 rounded-md border border-border bg-surface p-1 shadow-md"
        >
          <Command
            shouldFilter={false}
            value={highlighted}
            onValueChange={setHighlighted}
            className="flex flex-col gap-1"
          >
            <input
              autoFocus
              value={query}
              onChange={(e) => changeQuery(e.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder="Search categories…"
              role="combobox"
              aria-expanded="true"
              aria-autocomplete="list"
              className="w-full rounded-sm border border-border bg-background px-2 py-1 text-sm text-ink-primary placeholder:text-ink-muted focus:outline-none"
            />
            <CommandList className="max-h-80 overflow-auto">
              {showSplit && splitFirst && splitItem}
              {showClear && trimmedQuery === "" && clearItem}
              {ranked.map((c) => {
                const parentId = c.parent_id !== undefined ? c.parent_id : c.parent;
                const parent = parentId != null ? categoriesById[parentId] : null;
                const label = categoryDisplayLabel(c, categoriesById);
                // In the tree a subcategory sits under its parent; in
                // search results its parent is named beside it.
                const nested = trimmedQuery === "" && depthById[c.id] === 1;
                const hinted = trimmedQuery !== "" && parent != null;
                return (
                  <CommandItem
                    key={c.id}
                    value={String(c.id)}
                    onSelect={() => choose(c)}
                    aria-label={parent ? label : undefined}
                    className={cn(
                      itemClass,
                      nested
                        ? "ml-3 rounded-l-none border-l border-border pl-4 text-ink-secondary data-[selected=true]:text-ink-primary"
                        : "text-ink-primary",
                      trimmedQuery === "" && hasChildren.has(c.id) && "font-medium",
                    )}
                  >
                    {value === c.id && <Check className="h-3.5 w-3.5 shrink-0" />}
                    <span className="min-w-0 flex-1 truncate">{nested || hinted ? c.name : label}</span>
                    {hinted && <span className="shrink-0 text-xs text-ink-muted">{parent.name}</span>}
                  </CommandItem>
                );
              })}
              {showClear && trimmedQuery !== "" && clearItem}
              {tabGroups.map((g) => (
                <CommandGroup key={`tabs:${g.parentId}`} heading={g.heading} className={groupClass}>
                  {g.items.map((t) => (
                    <CommandItem
                      key={t.id}
                      value={String(t.id)}
                      onSelect={() => choose(t)}
                      className={cn(itemClass, "text-ink-primary")}
                    >
                      {value === t.id ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : (
                        <HandCoins className="h-3.5 w-3.5 text-ink-muted" aria-hidden="true" />
                      )}
                      {t.name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
              {transfers.length > 0 && (
                <CommandGroup
                  heading={direction === "in" ? "Transfer from" : "Transfer to"}
                  className={groupClass}
                >
                  {transfers.map((a) => (
                    <CommandItem
                      key={`${TRANSFER_PREFIX}${a.id}`}
                      value={`${TRANSFER_PREFIX}${a.id}`}
                      onSelect={() => chooseTransfer(a.id)}
                      className={cn(itemClass, "text-ink-primary")}
                    >
                      {transferAccountId === a.id && <Check className="h-3.5 w-3.5" />}
                      {transferLabel(a.name)}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {showCreate && (
                <CommandItem
                  value={CREATE}
                  onSelect={createAndSelect}
                  className={cn(itemClass, "text-accent")}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Create &quot;{trimmedQuery}&quot;
                </CommandItem>
              )}
              {showSplit && !splitFirst && (
                <>
                  <CommandSeparator className="my-1 h-px bg-border" />
                  {splitItem}
                </>
              )}
              {ranked.length === 0 && tabs.length === 0 && transfers.length === 0 && !showClear && !showCreate && !showSplit && (
                <CommandEmpty className="px-2 py-1.5 text-sm text-ink-muted">
                  No categories found.
                </CommandEmpty>
              )}
            </CommandList>
          </Command>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
