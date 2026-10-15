import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '../../lib/cn'

export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogClose = DialogPrimitive.Close

export function DialogContent({ className, children, ...props }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40" />
      <DialogPrimitive.Content
        className={cn(
          'fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-surface p-6 shadow-lg focus:outline-none',
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm text-ink-secondary opacity-70 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

export function DialogHeader({ className, ...props }) {
  return <div className={cn('mb-4 flex flex-col gap-1.5', className)} {...props} />
}

export function DialogTitle({ className, ...props }) {
  return (
    <DialogPrimitive.Title className={cn('text-lg font-semibold text-ink-primary', className)} {...props} />
  )
}

export function DialogDescription({ className, ...props }) {
  return (
    <DialogPrimitive.Description className={cn('text-sm text-ink-secondary', className)} {...props} />
  )
}

export function DialogFooter({ className, ...props }) {
  return <div className={cn('mt-6 flex justify-end gap-2', className)} {...props} />
}
