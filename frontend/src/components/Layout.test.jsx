import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as accountsApi from '../api/accounts'
import * as transactionsApi from '../api/transactions'
import { ThemeProvider } from '../theme/ThemeProvider'
import { formatMoney } from '../lib/money'
import { Layout } from './Layout'

vi.mock('../api/transactions', () => ({ getReviewCount: vi.fn() }))
vi.mock('../api/accounts', () => ({ listAccounts: vi.fn() }))

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ user: { username: 'vincent' }, logout: vi.fn() }),
}))

const ACCOUNTS = [
  { id: 1, name: 'Joint', current_balance_cents: 348217, archived: false },
  { id: 2, name: 'Savings', current_balance_cents: 1000000, archived: false },
]

function mockViewport(isWide) {
  window.matchMedia = (query) => ({
    matches: query.includes('min-width') ? isWide : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })
}

function renderLayout(path = '/') {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<p>Overview content</p>} />
            <Route path="transactions/:accountId" element={<p>Ledger content</p>} />
            <Route path="budgets" element={<p>Budgets content</p>} />
            <Route path="forecast" element={<p>Forecast content</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  )
}

beforeEach(() => {
  window.localStorage.clear()
  transactionsApi.getReviewCount.mockResolvedValue({ count: 0 })
  accountsApi.listAccounts.mockResolvedValue(ACCOUNTS)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Layout navigation', () => {
  it('shows every link in the sidebar at wide viewport width, with the account balance', async () => {
    mockViewport(true)
    renderLayout()
    const sidebar = screen.getByRole('navigation', { name: 'Main' })

    await screen.findByText('Total · 2 accounts')
    expect(within(sidebar).getAllByRole('link').map((l) => l.textContent)).toEqual([
      'Overview',
      'Transactions',
      'Joint€3,482',
      'Savings€10,000',
      'Review',
      'Budgets',
      'Forecast',
      'Import',
      'Accounts',
      'Settings',
    ])
    expect(await screen.findByText(formatMoney(348217 + 1000000))).toBeInTheDocument()
    expect(screen.getByText('Total · 2 accounts')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'More' })).not.toBeInTheDocument()
  })

  it('shows a tab bar at narrow width, and More reveals the rest', async () => {
    mockViewport(false)
    renderLayout()
    const tabBar = screen.getByRole('navigation', { name: 'Main' })

    expect(within(tabBar).getAllByRole('link').map((l) => l.textContent)).toEqual([
      'Overview',
      'Transactions',
      'Review',
      'Budgets',
    ])
    expect(screen.queryByRole('link', { name: 'Accounts' })).not.toBeInTheDocument()

    await userEvent.click(within(tabBar).getByRole('button', { name: 'More' }))

    const more = screen.getByRole('navigation', { name: 'More' })
    expect(within(more).getAllByRole('link').map((l) => l.textContent)).toEqual(['Forecast', 'Import', 'Accounts', 'Settings'])
    expect(screen.getByRole('button', { name: /Switch to (dark|light) theme/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
  })

  it('keeps the tab bar in a centred phone-width row on wider screens', () => {
    mockViewport(false)
    renderLayout()

    expect(screen.getByTestId('tab-bar-row')).toHaveClass('mx-auto', 'max-w-md')
  })

  it('marks the current page', () => {
    mockViewport(true)
    renderLayout('/budgets')

    expect(screen.getByRole('link', { name: 'Budgets' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Overview' })).not.toHaveAttribute('aria-current')
  })

  it('marks More when the current page lives under it', () => {
    mockViewport(false)
    renderLayout('/forecast')

    expect(screen.getByRole('button', { name: 'More' })).toHaveClass('text-accent')
  })
})

describe('Review count in the navigation', () => {
  it('shows how many guesses wait for review, in the sidebar and the tab bar', async () => {
    transactionsApi.getReviewCount.mockResolvedValue({ count: 14 })
    for (const wide of [true, false]) {
      mockViewport(wide)
      const { unmount } = renderLayout()

      const link = screen.getByRole('link', { name: /Review/ })
      await waitFor(() => expect(within(link).getByText('14')).toBeInTheDocument())
      expect(link).toHaveAttribute('href', '/review')
      unmount()
    }
  })

  it('shows no count when nothing needs review', async () => {
    mockViewport(true)
    renderLayout()

    await waitFor(() => expect(transactionsApi.getReviewCount).toHaveBeenCalled())
    expect(screen.getByRole('link', { name: 'Review' })).toHaveTextContent(/^Review$/)
  })

  it('caps the count at 99+', async () => {
    mockViewport(true)
    transactionsApi.getReviewCount.mockResolvedValue({ count: 140 })
    renderLayout()

    await waitFor(() => expect(screen.getByRole('link', { name: /Review/ })).toHaveTextContent('Review99+'))
  })

  it('refetches the count when the user navigates', async () => {
    mockViewport(true)
    renderLayout()
    await waitFor(() => expect(transactionsApi.getReviewCount).toHaveBeenCalledTimes(1))

    await userEvent.click(screen.getByRole('link', { name: 'Budgets' }))

    await waitFor(() => expect(transactionsApi.getReviewCount).toHaveBeenCalledTimes(2))
  })
})

describe('Accounts in the sidebar', () => {
  it('marks only the open account', async () => {
    mockViewport(true)
    renderLayout('/transactions/2')

    const savings = await screen.findByRole('link', { name: /Savings/ })
    expect(savings).toHaveAttribute('aria-current', 'page')
    expect(savings).toHaveClass('bg-accent')
    expect(screen.getByRole('link', { name: 'Transactions' })).not.toHaveClass('bg-accent')
    expect(screen.getByRole('link', { name: /Joint/ })).not.toHaveAttribute('aria-current')
  })

  it('shows the everyday total next to a house', async () => {
    accountsApi.listAccounts.mockResolvedValue([
      { id: 1, name: 'Revolut', tier: 'everyday', current_balance_cents: 120000, archived: false },
      { id: 2, name: 'Crelan', tier: 'everyday', current_balance_cents: 80000, archived: false },
      { id: 3, name: 'House', tier: 'property', current_balance_cents: 29500000, archived: false },
    ])
    mockViewport(true)
    renderLayout()

    expect(await screen.findByText('Everyday · 2 accounts')).toBeInTheDocument()
    expect(screen.getByText(formatMoney(200000))).toBeInTheDocument()
    expect(screen.queryByText(/Total ·/)).toBeNull()
  })

  it('shows no sub-items with one account', async () => {
    accountsApi.listAccounts.mockResolvedValue([ACCOUNTS[0]])
    mockViewport(true)
    renderLayout()

    expect(await screen.findByText('Total · 1 account')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Joint/ })).toBeNull()
  })

  const SEVEN = Array.from({ length: 7 }, (_, i) => ({
    id: i + 1,
    name: `Account ${i + 1}`,
    current_balance_cents: 100,
    archived: false,
  }))

  it('lists five accounts and "+N more" beyond that', async () => {
    accountsApi.listAccounts.mockResolvedValue(SEVEN)
    mockViewport(true)
    renderLayout()

    expect(await screen.findByRole('button', { name: '+2 more' })).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /^Account \d/ })).toHaveLength(5)
  })

  it('shows the rest on "+N more", and five again on "Show fewer"', async () => {
    const user = userEvent.setup()
    accountsApi.listAccounts.mockResolvedValue(SEVEN)
    mockViewport(true)
    renderLayout()

    await user.click(await screen.findByRole('button', { name: '+2 more' }))
    const links = screen.getAllByRole('link', { name: /^Account \d/ })
    expect(links).toHaveLength(7)
    expect(links[6]).toHaveAttribute('href', '/transactions/7')
    await user.click(screen.getByRole('button', { name: 'Show fewer' }))
    expect(screen.getAllByRole('link', { name: /^Account \d/ })).toHaveLength(5)
  })

  it('starts expanded when the open account is one of the rest', async () => {
    accountsApi.listAccounts.mockResolvedValue(SEVEN)
    mockViewport(true)
    renderLayout('/transactions/7')

    expect(await screen.findByRole('link', { name: /^Account 7/ })).toHaveAttribute('aria-current', 'page')
    expect(screen.getAllByRole('link', { name: /^Account \d/ })).toHaveLength(7)
    expect(screen.getByRole('button', { name: 'Show fewer' })).toBeInTheDocument()
  })

  it('leaves archived accounts out of the list and the total', async () => {
    accountsApi.listAccounts.mockResolvedValue([ACCOUNTS[0], { ...ACCOUNTS[1], archived: true }])
    mockViewport(true)
    renderLayout()

    expect(await screen.findByText('Total · 1 account')).toBeInTheDocument()
    expect(screen.getByText(formatMoney(348217))).toBeInTheDocument()
  })
})
