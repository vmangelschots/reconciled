import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Button } from './Button'

describe('Button', () => {
  it('renders children and responds to clicks', async () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Save</Button>)
    const button = screen.getByRole('button', { name: 'Save' })
    await userEvent.click(button)
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('applies a different class set per variant', () => {
    const { rerender } = render(<Button variant="default">A</Button>)
    const defaultClasses = screen.getByRole('button').className
    rerender(<Button variant="destructive">A</Button>)
    const destructiveClasses = screen.getByRole('button').className
    expect(defaultClasses).not.toBe(destructiveClasses)
    expect(destructiveClasses).toContain('bg-critical')
  })

  it('is disabled when the disabled prop is set', () => {
    render(<Button disabled>Save</Button>)
    expect(screen.getByRole('button')).toBeDisabled()
  })
})
