import { cn } from "../../lib/cn";
import { Skeleton } from "./Skeleton";

/**
 * A titled section of a page. `actions` sits on the right of the title
 * (a "View all" link, a "Show as table" toggle). `flush` drops the body
 * padding so a table or list runs edge to edge; its cells use px-5 to
 * line up with the title. `loading` shows a skeleton and `error` a
 * one-line message instead of the children.
 */
export function Panel({ title, actions, flush = false, loading = false, error, className, children, ...props }) {
  let body = children;
  if (error) {
    body = <p className={cn("text-sm text-critical", flush && "px-5 pb-5")}>{error}</p>;
  } else if (loading) {
    body = (
      <div data-testid="panel-loading" className={cn("flex flex-col gap-2.5", flush && "px-5 pb-5")}>
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-3/5" />
      </div>
    );
  }
  return (
    <section className={cn("rounded-xl bg-surface ring-1 ring-border", className)} {...props}>
      {(title || actions) && (
        <div className="flex min-h-12 items-center justify-between gap-3 px-5 pt-4 pb-3">
          {title && <h2 className="text-[15px] font-semibold text-ink-primary">{title}</h2>}
          {actions && <div className="ml-auto flex items-center gap-2 text-sm">{actions}</div>}
        </div>
      )}
      <div className={cn(!flush && "px-5 pb-5", !title && !actions && !flush && "pt-5")}>{body}</div>
    </section>
  );
}
