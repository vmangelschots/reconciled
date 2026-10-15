import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { Input } from './Input'
import { Label } from './Label'

describe('Input', () => {
  it('accepts typed input', async () => {
    render(
      <>
        <Label htmlFor="name">Name</Label>
        <Input id="name" />
      </>,
    )
    const input = screen.getByLabelText('Name')
    await userEvent.type(input, 'Main Checking')
    expect(input).toHaveValue('Main Checking')
  })

  it('is disabled when the disabled prop is set', () => {
    render(<Input disabled aria-label="disabled field" />)
    expect(screen.getByLabelText('disabled field')).toBeDisabled()
  })
})
