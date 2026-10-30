import { cn } from "../../lib/cn";

/**
 * A small one-of-several switch. An option with an `Icon` shows only that
 * icon; one without shows its label as text.
 * - options: [{ value, label, Icon? }]
 */
export function PillSwitch({ label, options, value, onChange }) {
  return (
    <div className="inline-flex rounded-lg bg-surface-2 p-0.5" role="group" aria-label={label}>
      {options.map(({ value: option, label: optionLabel, Icon }) => (
        <button
          key={option}
          type="button"
          aria-label={optionLabel}
          aria-pressed={value === option}
          title={Icon ? optionLabel : undefined}
          onClick={() => onChange(option)}
          className={cn(
            "flex h-7 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
            Icon ? "w-8" : "px-2.5 text-xs font-medium",
            value === option ? "bg-surface text-ink-primary shadow-sm" : "text-ink-muted hover:text-ink-primary",
          )}
        >
          {Icon ? <Icon className="h-4 w-4" aria-hidden="true" /> : optionLabel}
        </button>
      ))}
    </div>
  );
}
