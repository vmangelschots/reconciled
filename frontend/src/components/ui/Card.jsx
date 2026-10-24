import { cn } from '../../lib/cn'

// The same surface as Panel (bordered, no shadow), so pages not yet moved
// to Panel still match it.
export function Card({ className, ...props }) {
  return <div className={cn('rounded-xl bg-surface ring-1 ring-border', className)} {...props} />
}

export function CardHeader({ className, ...props }) {
  return <div className={cn('flex flex-col gap-1.5 p-5', className)} {...props} />
}

export function CardTitle({ className, ...props }) {
  return <h3 className={cn('text-[15px] font-semibold text-ink-primary', className)} {...props} />
}

export function CardContent({ className, ...props }) {
  return <div className={cn('p-5 pt-0', className)} {...props} />
}
