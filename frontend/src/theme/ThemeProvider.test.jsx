import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Button } from '../components/ui/Button'
import { ThemeProvider, useTheme } from './ThemeProvider'

function mockMatchMedia(matchesDark) {
  const listeners = new Set()
  window.matchMedia = (query) => ({
    matches: query.includes('dark') ? matchesDark : false,
    media: query,
    addEventListener: (_, handler) => listeners.add(handler),
    removeEventListener: (_, handler) => listeners.delete(handler),
  })
  return {
    fireChange: (matches) => listeners.forEach((handler) => handler({ matches })),
  }
}

function Example() {
  const { theme, setTheme } = useTheme()
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <Button onClick={() => setTheme('dark')}>Dark</Button>
      <Button onClick={() => setTheme('light')}>Light</Button>
    </div>
  )
}

describe('ThemeProvider', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => {
    document.documentElement.classList.remove('dark')
  })

  it('follows the OS preference when no explicit choice has been made', () => {
    mockMatchMedia(true)
    render(
      <ThemeProvider>
        <Example />
      </ThemeProvider>,
    )
    expect(screen.getByTestId('theme')).toHaveTextContent('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('an explicit choice overrides the OS preference', async () => {
    mockMatchMedia(false) // OS says light
    render(
      <ThemeProvider>
        <Example />
      </ThemeProvider>,
    )
    expect(screen.getByTestId('theme')).toHaveTextContent('light')

    await userEvent.click(screen.getByRole('button', { name: 'Dark' }))

    expect(screen.getByTestId('theme')).toHaveTextContent('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('persists the explicit choice across a simulated reload', async () => {
    mockMatchMedia(false)
    const { unmount } = render(
      <ThemeProvider>
        <Example />
      </ThemeProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Dark' }))
    expect(screen.getByTestId('theme')).toHaveTextContent('dark')
    unmount()

    // Simulate a fresh page load: OS preference still reports light, but a
    // brand-new ThemeProvider instance should read the stored choice.
    render(
      <ThemeProvider>
        <Example />
      </ThemeProvider>,
    )
    await waitFor(() => {
      expect(screen.getByTestId('theme')).toHaveTextContent('dark')
    })
  })
})
