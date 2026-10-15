import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Card, CardContent, CardHeader, CardTitle } from './Card'

describe('Card', () => {
  it('renders header, title, and content', () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Accounts</CardTitle>
        </CardHeader>
        <CardContent>Body content</CardContent>
      </Card>,
    )
    expect(screen.getByText('Accounts')).toBeInTheDocument()
    expect(screen.getByText('Body content')).toBeInTheDocument()
  })
})
