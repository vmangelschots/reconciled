import { cn } from '../../lib/cn'

export function Table({ className, ...props }) {
  return (
    // A size container, so content (the split editor) can fit the visible
    // scroll area rather than the viewport.
    <div className="@container w-full overflow-auto">
      <table className={cn('w-full caption-bottom text-sm', className)} {...props} />
    </div>
  )
}

export function TableHeader({ className, ...props }) {
  return <thead className={cn('border-b border-border bg-surface-2/60', className)} {...props} />
}

export function TableBody({ className, ...props }) {
  return <tbody className={cn('divide-y divide-border', className)} {...props} />
}

export function TableRow({ className, ...props }) {
  return <tr className={cn('transition-colors hover:bg-surface-2', className)} {...props} />
}

export function TableHead({ className, ...props }) {
  return (
    <th
      className={cn('h-9 px-3 text-left align-middle text-xs font-medium uppercase tracking-wide text-ink-muted', className)}
      {...props}
    />
  )
}

export function TableCell({ className, ...props }) {
  return <td className={cn('h-11 px-3 py-2 align-middle text-ink-primary', className)} {...props} />
}
