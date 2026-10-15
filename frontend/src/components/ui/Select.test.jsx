import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './Select'

function Example({ onValueChange }) {
  return (
    <Select onValueChange={onValueChange}>
      <SelectTrigger aria-label="Account type">
        <SelectValue placeholder="Select a type" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="checking">Checking</SelectItem>
        <SelectItem value="savings">Savings</SelectItem>
      </SelectContent>
    </Select>
  )
}

describe('Select', () => {
  it('opens, lists options, and reports the chosen value', async () => {
    const onValueChange = vi.fn()
    render(<Example onValueChange={onValueChange} />)

    await userEvent.click(screen.getByRole('combobox'))
    const savings = await screen.findByText('Savings')
    await userEvent.click(savings)

    expect(onValueChange).toHaveBeenCalledWith('savings')
  })
})
