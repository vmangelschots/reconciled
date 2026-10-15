import { cn } from '../../lib/cn'

export function Label({ className, ...props }) {
  return (
    <label
      className={cn('text-sm font-medium text-ink-primary', className)}
      {...props}
    />
  )
}
