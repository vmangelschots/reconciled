import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Button } from './Button'
import { ToastProvider, useToast } from './Toast'

function Example() {
  const toast = useToast()
  return (
    <>
      <Button onClick={() => toast.success('Account created')}>Trigger success</Button>
      <Button onClick={() => toast.error('Could not save account')}>Trigger error</Button>
    </>
  )
}

function renderWithProvider() {
  return render(
    <ToastProvider>
      <Example />
    </ToastProvider>,
  )
}

describe('ToastProvider / useToast', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows a success toast that auto-dismisses after its delay', async () => {
    renderWithProvider()
    await act(async () => {
      screen.getByRole('button', { name: 'Trigger success' }).click()
    })
    expect(await screen.findByText('Account created')).toBeInTheDocument()

    await act(async () => {
      vi.advanceTimersByTime(5000)
    })

    await waitFor(() => {
      expect(screen.queryByText('Account created')).not.toBeInTheDocument()
    })
  })

  it('shows an error toast that does NOT auto-dismiss', async () => {
    renderWithProvider()
    await act(async () => {
      screen.getByRole('button', { name: 'Trigger error' }).click()
    })
    expect(await screen.findByText('Could not save account')).toBeInTheDocument()

    await act(async () => {
      vi.advanceTimersByTime(60000)
    })

    expect(screen.getByText('Could not save account')).toBeInTheDocument()
  })

  it('an error toast can be dismissed manually', async () => {
    renderWithProvider()
    await act(async () => {
      screen.getByRole('button', { name: 'Trigger error' }).click()
    })
    expect(await screen.findByText('Could not save account')).toBeInTheDocument()

    await act(async () => {
      screen.getByRole('button', { name: 'Dismiss' }).click()
    })

    await waitFor(() => {
      expect(screen.queryByText('Could not save account')).not.toBeInTheDocument()
    })
  })
})
