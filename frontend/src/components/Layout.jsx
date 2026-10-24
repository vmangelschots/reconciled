import { Menu, X } from 'lucide-react'
import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { cn } from '../lib/cn'
import { ReviewCountProvider, useReviewCount } from '../review/ReviewCountContext'
import { ThemeToggle } from './ThemeToggle'
import { Button } from './ui/Button'

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/accounts', label: 'Accounts' },
  { to: '/transactions', label: 'Transactions' },
  { to: '/review', label: 'Review', showsReviewCount: true },
  { to: '/budgets', label: 'Budgets' },
  { to: '/import', label: 'Import' },
  { to: '/forecast', label: 'Forecast' },
]

// How many guessed categories wait on the Review page; hidden at 0.
function ReviewCountPill({ isActive }) {
  const { count } = useReviewCount()
  if (!count) return null
  return (
    <span
      className={cn(
        'ml-1.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5 text-[11px] leading-none font-semibold tabular-nums',
        isActive ? 'bg-on-accent/20 text-on-accent' : 'bg-accent/15 text-accent',
      )}
    >
      {count > 99 ? '99+' : count}
    </span>
  )
}

function NavLinks({ className, onNavigate }) {
  return (
    <nav className={className}>
      {NAV_ITEMS.map(({ to, label, end, showsReviewCount }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'inline-flex items-center justify-between rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              isActive
                ? 'bg-accent text-on-accent'
                : 'text-ink-secondary hover:bg-surface-2 hover:text-ink-primary',
            )
          }
        >
          {({ isActive }) => (
            <>
              {label}
              {showsReviewCount && <ReviewCountPill isActive={isActive} />}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}

function SessionControls({ className }) {
  const { user, logout } = useAuth()
  return (
    <div className={className}>
      <span className="text-sm text-ink-secondary">{user?.username}</span>
      <Button variant="outline" size="sm" onClick={logout}>
        Sign out
      </Button>
    </div>
  )
}

export function Layout() {
  const isWide = useMediaQuery('(min-width: 768px)')
  const [menuOpen, setMenuOpen] = useState(false)
  // The Review count is refetched on every route change.
  const { pathname } = useLocation()

  return (
    <ReviewCountProvider refreshKey={pathname}>
      <div className="min-h-screen bg-background">
        <header className="flex items-center gap-4 border-b border-border px-4 py-3 sm:px-6">
          <strong className="text-ink-primary">reconciled</strong>

          {isWide && <NavLinks className="flex flex-1 items-center gap-1" />}

          <div className={cn('flex items-center gap-2', !isWide && 'ml-auto')}>
            <ThemeToggle />
            {isWide ? (
              <SessionControls className="flex items-center gap-2" />
            ) : (
              <Button
                variant="ghost"
                size="icon"
                aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((v) => !v)}
              >
                {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </Button>
            )}
          </div>
        </header>

        {!isWide && menuOpen && (
          <div className="border-b border-border px-4 py-3">
            <NavLinks className="flex flex-col gap-1" onNavigate={() => setMenuOpen(false)} />
            <div className="mt-3 border-t border-border pt-3">
              <SessionControls className="flex items-center justify-between" />
            </div>
          </div>
        )}

        <main className="p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </ReviewCountProvider>
  )
}
