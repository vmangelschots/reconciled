import { cn } from "../../lib/cn";

/**
 * A row of mutually exclusive options, the selected one filled with the
 * accent. `options` is [{ value, label, icon }], where icon is a lucide
 * component shown before the label.
 */
export function SegmentedControl({ options, value, onChange, label, className }) {
  return (
    <div role="group" aria-label={label} className={cn("flex overflow-hidden rounded-md border border-border", className)}>
      {options.map(({ value: optionValue, label: optionLabel, icon: Icon }) => (
        <button
          key={String(optionValue)}
          type="button"
          aria-pressed={value === optionValue}
          onClick={() => onChange(optionValue)}
          className={cn(
            "flex h-8 items-center gap-1.5 whitespace-nowrap px-3 text-sm",
            value === optionValue ? "bg-accent text-on-accent" : "bg-surface text-ink-secondary hover:text-ink-primary",
          )}
        >
          {Icon && <Icon className="h-3.5 w-3.5" aria-hidden="true" />}
          {optionLabel}
        </button>
      ))}
    </div>
  );
}
