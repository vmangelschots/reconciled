import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './Table'

describe('Table', () => {
  it('renders header and body rows', () => {
    render(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>Main Checking</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    )
    expect(screen.getByText('Name')).toBeInTheDocument()
    expect(screen.getByText('Main Checking')).toBeInTheDocument()
  })
})
