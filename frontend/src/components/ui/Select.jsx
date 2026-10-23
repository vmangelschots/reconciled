import * as SelectPrimitive from '@radix-ui/react-select'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '../../lib/cn'

export const Select = SelectPrimitive.Root
export const SelectValue = SelectPrimitive.Value

export function SelectTrigger({ className, children, ...props }) {
  return (
    <SelectPrimitive.Trigger
      className={cn(
        'flex h-9 w-full items-center justify-between gap-2 rounded-md border border-border bg-surface px-3 py-1 text-sm text-ink-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50 [&>span]:min-w-0 [&>span]:truncate',
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
}

export function SelectContent({ className, children, ...props }) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        className={cn(
          'relative z-50 overflow-hidden rounded-md border border-border bg-surface text-ink-primary shadow-md',
          className,
        )}
        position="popper"
        sideOffset={4}
        {...props}
      >
        <SelectPrimitive.Viewport className="p-1">{children}</SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  )
}

export function SelectItem({ className, children, ...props }) {
  return (
    <SelectPrimitive.Item
      className={cn(
        'relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-white',
        className,
      )}
      {...props}
    >
      <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <Check className="h-4 w-4" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  )
}
