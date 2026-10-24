import { cn } from "../../lib/cn";

export function Skeleton({ className }) {
  return <div aria-hidden="true" className={cn("animate-pulse rounded-md bg-surface-2", className)} />;
}
