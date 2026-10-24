import {
  ArrowLeftRight,
  Ellipsis,
  Inbox,
  Landmark,
  LayoutDashboard,
  LogOut,
  PiggyBank,
  TrendingUp,
  Upload,
} from 'lucide-react'
import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { cn } from '../lib/cn'
import { OverviewAccountProvider, useOverviewAccount } from '../overview/OverviewAccountContext'
import { ReviewCountProvider, useReviewCount } from '../review/ReviewCountContext'
import { ThemeToggle } from './ThemeToggle'
import { Amount } from './ui/Amount'
import { Button } from './ui/Button'
import { Dialog, DialogContent, DialogTitle } from './ui/Dialog'

// `group`: the sidebar's two groups. `inTabBar`: shown in the phone tab
// bar; the rest sit under "More". See the ui-shell spec.
const NAV_ITEMS = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true, group: 'main', inTabBar: true },
  { to: '/transactions', label: 'Transactions', icon: ArrowLeftRight, group: 'main', inTabBar: true },
  { to: '/review', label: 'Review', icon: Inbox, group: 'main', inTabBar: true, showsReviewCount: true },
  { to: '/budgets', label: 'Budgets', icon: PiggyBank, group: 'main', inTabBar: true },
  { to: '/forecast', label: 'Forecast', icon: TrendingUp, group: 'main' },
  { to: '/import', label: 'Import', icon: Upload, group: 'more' },
  { to: '/accounts', label: 'Accounts', icon: Landmark, group: 'more' },
]

// How many guessed categories wait on the Review page; hidden at 0.
function ReviewCountPill({ isActive, className }) {
  const { count } = useReviewCount()
  if (!count) return null
  return (
    <span
      className={cn(
        'inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5 text-[11px] leading-none font-semibold tabular-nums',
        isActive ? 'bg-on-accent/20 text-on-accent' : 'bg-accent/15 text-accent',
        className,
      )}
    >
      {count > 99 ? '99+' : count}
    </span>
  )
}

function SidebarLink({ item, onNavigate }) {
  const Icon = item.icon
  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
          isActive ? 'bg-accent text-on-accent' : 'text-ink-secondary hover:bg-surface-2 hover:text-ink-primary',
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="flex-1">{item.label}</span>
          {item.showsReviewCount && <ReviewCountPill isActive={isActive} />}
        </>
      )}
    </NavLink>
  )
}

function AccountReadout() {
  const { account } = useOverviewAccount()
  if (!account) return null
  return (
    <div className="flex flex-col gap-0.5 px-3">
      <span className="truncate text-xs text-ink-muted">{account.name}</span>
      <Amount cents={account.current_balance_cents} className="text-base font-semibold text-ink-primary" />
    </div>
  )
}

function SignOutButton({ withLabel = false }) {
  const { logout } = useAuth()
  if (withLabel) {
    return (
      <Button variant="outline" size="sm" onClick={logout}>
        <LogOut className="h-4 w-4" aria-hidden="true" />
        Sign out
      </Button>
    )
  }
  return (
    <Button variant="ghost" size="icon" aria-label="Sign out" onClick={logout}>
      <LogOut className="h-4 w-4" />
    </Button>
  )
}

function Sidebar() {
  const { user } = useAuth()
  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex w-56 flex-col border-r border-border bg-background">
      <div className="px-6 pt-6 pb-5 text-[15px] font-semibold tracking-tight text-ink-primary">reconciled</div>
      <nav aria-label="Main" className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3">
        {NAV_ITEMS.filter((i) => i.group === 'main').map((item) => (
          <SidebarLink key={item.to} item={item} />
        ))}
        <div className="mx-3 my-3 h-px bg-border" />
        {NAV_ITEMS.filter((i) => i.group === 'more').map((item) => (
          <SidebarLink key={item.to} item={item} />
        ))}
      </nav>
      <div className="flex flex-col gap-3 border-t border-border px-3 py-4">
        <AccountReadout />
        <div className="flex items-center gap-1 pl-3">
          <span className="flex-1 truncate text-sm text-ink-secondary">{user?.username}</span>
          <ThemeToggle />
          <SignOutButton />
        </div>
      </div>
    </aside>
  )
}

function TabBar() {
  const [moreOpen, setMoreOpen] = useState(false)
  const { pathname } = useLocation()
  const { user } = useAuth()
  const moreItems = NAV_ITEMS.filter((i) => !i.inTabBar)
  const moreActive = moreItems.some((i) => pathname.startsWith(i.to))

  const tabClass = (active) =>
    cn(
      'relative flex flex-1 flex-col items-center justify-center gap-0.5 pt-2 pb-1.5 text-[11px] font-medium',
      active ? 'text-accent' : 'text-ink-muted hover:text-ink-primary',
    )

  return (
    <>
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]"
      >
        {/* A phone-width row, centred, so tablets don't spread it out. */}
        <div data-testid="tab-bar-row" className="mx-auto flex h-14 max-w-md items-stretch">
          {NAV_ITEMS.filter((i) => i.inTabBar).map((item) => {
            const Icon = item.icon
            return (
              <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => tabClass(isActive)}>
                <Icon className="h-5 w-5" aria-hidden="true" />
                <span>{item.label}</span>
                {item.showsReviewCount && <ReviewCountPill className="absolute top-1 left-1/2 ml-1.5" />}
              </NavLink>
            )
          })}
          <button type="button" className={tabClass(moreActive)} onClick={() => setMoreOpen(true)}>
            <Ellipsis className="h-5 w-5" aria-hidden="true" />
            <span>More</span>
          </button>
        </div>
      </nav>

      <Dialog open={moreOpen} onOpenChange={setMoreOpen}>
        <DialogContent
          aria-describedby={undefined}
          className="top-auto bottom-0 left-0 max-w-none translate-x-0 translate-y-0 rounded-b-none rounded-t-2xl p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
        >
          <DialogTitle className="px-3 pb-2 text-base">More</DialogTitle>
          <nav aria-label="More" className="flex flex-col gap-0.5">
            {moreItems.map((item) => (
              <SidebarLink key={item.to} item={item} onNavigate={() => setMoreOpen(false)} />
            ))}
          </nav>
          <div className="mt-3 flex items-center gap-2 border-t border-border px-3 pt-3">
            <span className="flex-1 truncate text-sm text-ink-secondary">{user?.username}</span>
            <ThemeToggle />
            <SignOutButton withLabel />
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function Layout() {
  const isWide = useMediaQuery('(min-width: 1024px)')
  // The Review count and the overview account are refetched on every
  // route change.
  const { pathname } = useLocation()

  return (
    <ReviewCountProvider refreshKey={pathname}>
      <OverviewAccountProvider refreshKey={pathname}>
        <div className="min-h-screen bg-background">
          {isWide ? <Sidebar /> : <TabBar />}
          <main className={cn(isWide ? 'pl-56' : 'pb-[calc(4.5rem+env(safe-area-inset-bottom))]')}>
            <div className="mx-auto w-full max-w-6xl px-4 py-6 lg:px-8 lg:py-8">
              <Outlet />
            </div>
          </main>
        </div>
      </OverviewAccountProvider>
    </ReviewCountProvider>
  )
}
