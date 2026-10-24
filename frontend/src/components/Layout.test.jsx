import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as accountsApi from '../api/accounts'
import * as transactionsApi from '../api/transactions'
import { useOverviewAccount } from '../overview/OverviewAccountContext'
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

function AccountPicker() {
  const { account, setAccountId } = useOverviewAccount()
  return (
    <div>
      <p>Showing {account?.name ?? 'nothing'}</p>
      <button type="button" onClick={() => setAccountId(2)}>
        Pick savings
      </button>
    </div>
  )
}

function renderLayout(path = '/') {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<AccountPicker />} />
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

    expect(within(sidebar).getAllByRole('link').map((l) => l.textContent)).toEqual([
      'Overview',
      'Transactions',
      'Review',
      'Budgets',
      'Forecast',
      'Import',
      'Accounts',
    ])
    expect(await screen.findByText(formatMoney(348217))).toBeInTheDocument()
    expect(screen.getByText('Joint', { selector: 'span' })).toBeInTheDocument()
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
    expect(within(more).getAllByRole('link').map((l) => l.textContent)).toEqual(['Forecast', 'Import', 'Accounts'])
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

describe('Overview account', () => {
  it('starts on the first active account and remembers a choice', async () => {
    mockViewport(true)
    const { unmount } = renderLayout()
    expect(await screen.findByText('Showing Joint')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Pick savings' }))
    expect(screen.getByText('Showing Savings')).toBeInTheDocument()
    unmount()

    renderLayout()
    expect(await screen.findByText('Showing Savings')).toBeInTheDocument()
  })

  it('falls back to the first account when the remembered one is gone', async () => {
    window.localStorage.setItem('reconciled.overviewAccount', '99')
    mockViewport(true)
    renderLayout()

    expect(await screen.findByText('Showing Joint')).toBeInTheDocument()
  })

  it('ignores archived accounts', async () => {
    accountsApi.listAccounts.mockResolvedValue([{ ...ACCOUNTS[0], archived: true }, ACCOUNTS[1]])
    window.localStorage.setItem('reconciled.overviewAccount', '1')
    mockViewport(true)
    renderLayout()

    expect(await screen.findByText('Showing Savings')).toBeInTheDocument()
  })
})
