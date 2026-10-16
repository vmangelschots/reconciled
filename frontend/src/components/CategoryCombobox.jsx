import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "cmdk";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { categoryDisplayLabel } from "../lib/categoryTree";
import { cn } from "../lib/cn";

/**
 * A searchable category picker. Filtering is done ourselves
 * (shouldFilter={false} on Command) rather than relying on cmdk's
 * built-in fuzzy filter, so "substring match on name, and on
 * 'parent / name' for subcategories" is exact and predictable rather
 * than fuzzy-scored.
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
 *   parent (top-level)").
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
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const categoriesById = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.id, c])),
    [categories],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter((c) => categoryDisplayLabel(c, categoriesById).toLowerCase().includes(q));
  }, [categories, categoriesById, query]);

  const trimmedQuery = query.trim();
  const exactMatch = categories.some((c) => c.name.toLowerCase() === trimmedQuery.toLowerCase());
  const showCreate = allowCreate && trimmedQuery !== "" && !exactMatch;
  const selected = value != null ? categoriesById[value] : null;

  function choose(category) {
    onSelect(category ? category.id : null);
    setOpen(false);
    setQuery("");
  }

  async function createAndSelect() {
    if (!trimmedQuery) return;
    await onCreate(trimmedQuery);
    setOpen(false);
    setQuery("");
  }

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
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
          className="z-50 w-64 rounded-md border border-border bg-surface p-1 shadow-md"
        >
          <Command shouldFilter={false} className="flex flex-col gap-1">
            <CommandInput
              value={query}
              onValueChange={setQuery}
              placeholder="Search categories…"
              className="w-full rounded-sm border border-border bg-background px-2 py-1 text-sm text-ink-primary placeholder:text-ink-muted focus:outline-none"
            />
            <CommandList className="max-h-56 overflow-auto">
              <CommandItem
                value="__clear__"
                onSelect={() => choose(null)}
                className="flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-ink-secondary data-[selected=true]:bg-background"
              >
                {value == null && <Check className="h-3.5 w-3.5" />}
                {clearLabel}
              </CommandItem>
              {filtered.map((c) => (
                <CommandItem
                  key={c.id}
                  value={String(c.id)}
                  onSelect={() => choose(c)}
                  className="flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-ink-primary data-[selected=true]:bg-background"
                >
                  {value === c.id && <Check className="h-3.5 w-3.5" />}
                  {categoryDisplayLabel(c, categoriesById)}
                </CommandItem>
              ))}
              {showCreate && (
                <CommandItem
                  value="__create__"
                  onSelect={createAndSelect}
                  className="flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-accent data-[selected=true]:bg-background"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Create &quot;{trimmedQuery}&quot;
                </CommandItem>
              )}
              {filtered.length === 0 && !showCreate && (
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
