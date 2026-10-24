import * as ToastPrimitive from '@radix-ui/react-toast'
import { CheckCircle2, XCircle } from 'lucide-react'
import { createContext, useCallback, useContext, useState } from 'react'
import { cn } from '../../lib/cn'

const ToastContext = createContext(null)

// Per the ui-shell spec: success dismisses itself after a short delay,
// error remains until the user dismisses it (or takes another action -
// Radix replaces/stacks rather than forcing a choice, which satisfies
// that without extra logic here).
const SUCCESS_DURATION_MS = 4000
const ERROR_DURATION_MS = Infinity

let nextId = 0

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((t) => t.id !== id))
  }, [])

  const show = useCallback((variant, message) => {
    const id = ++nextId
    setToasts((current) => [...current, { id, variant, message }])
  }, [])

  const toast = {
    success: (message) => show('success', message),
    error: (message) => show('error', message),
  }

  return (
    <ToastContext.Provider value={toast}>
      <ToastPrimitive.Provider swipeDirection="right">
        {children}
        {toasts.map((t) => {
          const Icon = t.variant === 'success' ? CheckCircle2 : XCircle
          return (
            <ToastPrimitive.Root
              key={t.id}
              duration={t.variant === 'success' ? SUCCESS_DURATION_MS : ERROR_DURATION_MS}
              onOpenChange={(open) => {
                if (!open) dismiss(t.id)
              }}
              className={cn(
                'flex items-start gap-3 rounded-md border border-border bg-surface p-4 text-sm shadow-md',
              )}
            >
              <Icon
                className={cn(
                  'mt-0.5 h-4 w-4 shrink-0',
                  t.variant === 'success' ? 'text-success' : 'text-critical',
                )}
              />
              <ToastPrimitive.Description className="flex-1 text-ink-primary">
                {t.message}
              </ToastPrimitive.Description>
              <ToastPrimitive.Close
                aria-label="Dismiss"
                className="text-ink-muted hover:text-ink-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                ×
              </ToastPrimitive.Close>
            </ToastPrimitive.Root>
          )
        })}
        <ToastPrimitive.Viewport className="fixed right-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-100 flex w-full max-w-sm flex-col gap-2 p-4 lg:bottom-0" />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within a ToastProvider')
  return ctx
}
