import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Command, CommandEmpty, CommandItem, CommandList } from "cmdk";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { categoryDisplayLabel, rankCategories } from "../lib/categoryTree";
import { cn } from "../lib/cn";
import { focusAdjacentTabbable } from "../lib/focus";

const CLEAR = "__clear__";
const CREATE = "__create__";

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
 * Shift+Tab pick the highlighted category (never "Create") and move on
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
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState("");
  const triggerRef = useRef(null);
  // Set by Tab / Shift+Tab so the close handler moves focus on instead
  // of returning it to the trigger.
  const tabDirection = useRef(null);

  const categoriesById = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.id, c])),
    [categories],
  );

  function optionsFor(q) {
    const trimmed = q.trim();
    const lower = trimmed.toLowerCase();
    const ranked = rankCategories(categories, categoriesById, trimmed);
    const showClear = !lower || clearLabel.toLowerCase().includes(lower);
    const exactMatch = categories.some((c) => c.name.toLowerCase() === lower);
    const showCreate = allowCreate && trimmed !== "" && !exactMatch;
    return { trimmed, ranked, showClear, showCreate };
  }

  function highlightFor(q) {
    const { trimmed, ranked, showClear, showCreate } = optionsFor(q);
    if (!trimmed) return value != null && categoriesById[value] ? String(value) : CLEAR;
    if (ranked.length > 0) return String(ranked[0].id);
    if (showClear) return CLEAR;
    if (showCreate) return CREATE;
    return "";
  }

  const { trimmed: trimmedQuery, ranked, showClear, showCreate } = optionsFor(query);
  const selected = value != null ? categoriesById[value] : null;

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
    onSelect(category ? category.id : null);
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
      onSelect(null);
    } else if (highlighted && highlighted !== CREATE) {
      onSelect(Number(highlighted));
    }
    tabDirection.current = e.shiftKey ? "prev" : "next";
    handleOpenChange(false);
  }

  function handleCloseAutoFocus(e) {
    const direction = tabDirection.current;
    if (!direction) return;
    tabDirection.current = null;
    e.preventDefault();
    if (!focusAdjacentTabbable(triggerRef.current, direction)) triggerRef.current.focus();
  }

  const itemClass =
    "flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm data-[selected=true]:bg-background";

  // Listed first on an empty search, after every match otherwise.
  const clearItem = (
    <CommandItem value={CLEAR} onSelect={() => choose(null)} className={cn(itemClass, "text-ink-secondary")}>
      {value == null && <Check className="h-3.5 w-3.5" />}
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
          className={cn(
            "flex h-8 min-w-32 items-center justify-between gap-2 rounded-md border border-border bg-surface px-2 text-left text-sm text-ink-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
            className,
          )}
        >
          <span className={cn("truncate", !selected && "text-ink-muted")}>
            {selected ? categoryDisplayLabel(selected, categoriesById) : placeholder}
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
            <CommandList className="max-h-56 overflow-auto">
              {showClear && trimmedQuery === "" && clearItem}
              {ranked.map((c) => (
                <CommandItem
                  key={c.id}
                  value={String(c.id)}
                  onSelect={() => choose(c)}
                  className={cn(itemClass, "text-ink-primary")}
                >
                  {value === c.id && <Check className="h-3.5 w-3.5" />}
                  {categoryDisplayLabel(c, categoriesById)}
                </CommandItem>
              ))}
              {showClear && trimmedQuery !== "" && clearItem}
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
              {ranked.length === 0 && !showClear && !showCreate && (
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
