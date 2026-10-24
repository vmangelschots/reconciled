import { cn } from "../../lib/cn";

/**
 * The top of every page: its title, and on the right the page's
 * controls (month switcher, account picker, primary action). On a phone
 * the controls wrap below the title. See the ui-shell spec.
 */
export function PageHeader({ title, children, className }) {
  return (
    <header className={cn("flex flex-wrap items-center justify-between gap-x-4 gap-y-3", className)}>
      <h1 className="text-2xl font-semibold tracking-tight text-ink-primary">{title}</h1>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  );
}
