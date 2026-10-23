import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as transactionsApi from '../api/transactions'
import { ThemeProvider } from '../theme/ThemeProvider'
import { Layout } from './Layout'

vi.mock('../api/transactions', () => ({ getReviewCount: vi.fn() }))

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ user: { username: 'vincent' }, logout: vi.fn() }),
}))

function mockViewport(isWide) {
  window.matchMedia = (query) => ({
    matches: query.includes('min-width') ? isWide : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })
}

function renderLayout() {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<p>Page content</p>} />
            <Route path="budgets" element={<p>Budgets content</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  )
}

beforeEach(() => {
  transactionsApi.getReviewCount.mockResolvedValue({ count: 0 })
})

describe('Layout navigation', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows every nav link inline at wide viewport width', () => {
    mockViewport(true)
    renderLayout()
    expect(screen.getByRole('link', { name: 'Accounts' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Forecast' })).toBeVisible()
    expect(screen.queryByRole('button', { name: /navigation menu/ })).not.toBeInTheDocument()
  })

  it('hides nav links behind a toggle at narrow viewport width, and the toggle reveals them', async () => {
    mockViewport(false)
    renderLayout()
    expect(screen.queryByRole('link', { name: 'Accounts' })).not.toBeInTheDocument()

    const toggle = screen.getByRole('button', { name: 'Open navigation menu' })
    await userEvent.click(toggle)

    expect(screen.getByRole('link', { name: 'Accounts' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Forecast' })).toBeVisible()
  })
})

describe('Review count in the navigation', () => {
  it('shows how many guesses wait for review', async () => {
    mockViewport(true)
    transactionsApi.getReviewCount.mockResolvedValue({ count: 14 })
    renderLayout()

    const link = screen.getByRole('link', { name: /Review/ })
    await waitFor(() => expect(within(link).getByText('14')).toBeInTheDocument())
    expect(link).toHaveAttribute('href', '/review')
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
