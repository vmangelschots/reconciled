import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { Button } from './Button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './Dialog'

function Example() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>Open</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirm</DialogTitle>
          <DialogDescription>Are you sure?</DialogDescription>
        </DialogHeader>
        <button type="button">Inside action</button>
      </DialogContent>
    </Dialog>
  )
}

describe('Dialog', () => {
  it('opens on trigger click and moves focus inside', async () => {
    render(<Example />)
    await userEvent.click(screen.getByRole('button', { name: 'Open' }))
    expect(await screen.findByText('Confirm')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toContainElement(document.activeElement)
    })
  })

  it('closes on Escape', async () => {
    const user = userEvent.setup()
    render(<Example />)
    await user.click(screen.getByRole('button', { name: 'Open' }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()

    await user.keyboard('{Escape}')
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })
})
