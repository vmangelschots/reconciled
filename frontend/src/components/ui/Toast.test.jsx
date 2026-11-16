import { act, render, screen, waitFor } from '@testing-library/react'
import { useRef } from 'react'
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

  it('runs a success toast action and closes the toast', async () => {
    const undo = vi.fn()
    function WithAction() {
      const toast = useToast()
      return <Button onClick={() => toast.success('Limit removed', { action: { label: 'Undo', onClick: undo } })}>Go</Button>
    }
    render(
      <ToastProvider>
        <WithAction />
      </ToastProvider>,
    )
    await act(async () => {
      screen.getByRole('button', { name: 'Go' }).click()
    })
    await act(async () => {
      ;(await screen.findByRole('button', { name: 'Undo' })).click()
    })
    expect(undo).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.queryByText('Limit removed')).not.toBeInTheDocument())
  })
})

function Replacing() {
  const toast = useToast()
  const n = useRef(0)
  return (
    <Button
      onClick={() => {
        n.current += 1
        toast.success(`Saved ${n.current}`, { replace: 'draft-save' })
      }}
    >
      Save
    </Button>
  )
}

describe('a toast that replaces', () => {
  it("takes the place of the last one with its key", async () => {
    render(
      <ToastProvider>
        <Replacing />
      </ToastProvider>,
    )
    await act(async () => screen.getByRole('button', { name: 'Save' }).click())
    await act(async () => screen.getByRole('button', { name: 'Save' }).click())

    expect(await screen.findByText('Saved 2')).toBeInTheDocument()
    expect(screen.queryByText('Saved 1')).toBeNull()
  })
})
