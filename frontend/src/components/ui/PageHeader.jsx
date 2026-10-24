import { cn } from "../../lib/cn";

/**
 * The top of every page. `actions` (the primary action, e.g. Import)
 * stays beside the title; `children` (month switcher, account picker)
 * sit between them on wide screens and take their own row on a phone.
 * See the ui-shell spec.
 */
export function PageHeader({ title, actions, children, className }) {
  return (
    <header className={cn("flex flex-wrap items-center gap-x-4 gap-y-3", className)}>
      <h1 className="mr-auto text-2xl font-semibold tracking-tight text-ink-primary">{title}</h1>
      {actions && <div className="flex items-center gap-2 sm:order-last">{actions}</div>}
      {children && <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">{children}</div>}
    </header>
  );
}
