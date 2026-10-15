import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ThemeProvider } from '../theme/ThemeProvider'
import { Layout } from './Layout'

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
          </Route>
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  )
}

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
