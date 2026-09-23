// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import type { Facet } from '../../shared/facets.js'
import { FolderFacetNavigator } from './folder-facets.js'

const id = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
function facet(n: number, kind: Facet['kind'], name: string, extra: Partial<Facet> = {}): Facet {
  return {
    id: id(n), kind, name, display_name: null, hidden: false, private: false,
    owner_id: null, position: `0${n}`, h1_block_id: null,
    updated_at: '2026-09-22T00:00:00.000Z', ...extra,
  }
}
const yes = () => ({
  createShared: true, createPrivate: true, reorderShared: true,
  reorderPrivate: true, rename: true, hide: true, delete: true, share: true,
})
afterEach(cleanup)

function renderNavigator(rows: Facet[], overrides: Partial<React.ComponentProps<typeof FolderFacetNavigator>> = {}) {
  return render(
    <FolderFacetNavigator
      facets={rows}
      activeId={rows[0]?.id ?? ''}
      capabilities={yes}
      onSelect={() => {}}
      onCreate={() => {}}
      onCreateWorkSection={() => {}}
      onReorder={() => {}}
      onRename={() => {}}
      onHide={() => {}}
      onDelete={() => {}}
      onShare={() => {}}
      page={undefined}
      {...overrides}
    />,
  )
}

describe('FolderFacetNavigator', () => {
  test('draws the server sequence, marks privacy, and keeps Add last', () => {
    const rows = [
      facet(1, 'main', 'Main'),
      facet(2, 'purpose', 'Purpose'),
      facet(3, 'private_blank', 'My notes', { private: true, owner_id: id(9), display_name: 'My notes' }),
    ]
    renderNavigator(rows)
    expect(screen.getByRole('tab', { name: 'Main' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('tab', { name: 'My notes — Private, only you' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Add or manage facets' })).toBeTruthy()
  })

  test('manages hidden natives in the compact Add popover', () => {
    const hide = vi.fn()
    const rows = [
      facet(1, 'main', 'Main'),
      facet(2, 'results', 'Results', { hidden: true }),
      facet(3, 'shared_blank', 'Project notes', { display_name: 'Project notes' }),
    ]
    renderNavigator(rows, { onHide: hide })
    expect(screen.queryByRole('tab', { name: 'Results' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Add or manage facets' }))
    expect(screen.getByText('New facet')).toBeTruthy()
    expect(screen.getByText('Private facet')).toBeTruthy()
    expect(screen.getByText('Work section')).toBeTruthy()
    expect(screen.getByRole('switch', { name: 'Show Main' }).getAttribute('aria-disabled')).toBe('true')
    expect(screen.getByRole('switch', { name: 'Show Project notes' }).getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(screen.getByRole('switch', { name: 'Show Results' }))
    expect(hide).toHaveBeenCalledWith(rows[1], false)
  })

  test('reorders from the tab itself and reports the complete visible order', () => {
    const reorder = vi.fn()
    const rows = [facet(1, 'main', 'Main'), facet(2, 'purpose', 'Purpose'), facet(3, 'results', 'Results')]
    renderNavigator(rows, { onReorder: reorder })
    const results = screen.getByRole('tab', { name: 'Results' })
    expect(results.getAttribute('data-sort-handle')).toBe('true')
    expect(results.getAttribute('data-drag-through')).toBe('true')
    fireEvent.keyDown(results, { key: 'ArrowLeft' })
    expect(reorder).toHaveBeenCalledWith(rows[2], [rows[0], rows[2], rows[1]])
  })

  test('renames a renameable facet directly on double click', () => {
    const rename = vi.fn()
    const rows = [facet(1, 'main', 'Main'), facet(2, 'shared_blank', 'Planning', { display_name: 'Planning' })]
    renderNavigator(rows, { activeId: rows[1]!.id, onRename: rename })
    fireEvent.doubleClick(screen.getByRole('tab', { name: 'Planning' }))
    const input = screen.getByRole('textbox', { name: 'Facet name' })
    fireEvent.change(input, { target: { value: 'Delivery' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(rename).toHaveBeenCalledWith(rows[1], 'Delivery')
  })

  test('the eye cleanly hides and restores the complete row', () => {
    const rows = [facet(1, 'main', 'Main'), facet(2, 'purpose', 'Purpose')]
    renderNavigator(rows)
    fireEvent.click(screen.getByRole('button', { name: 'Hide facet row' }))
    expect(screen.queryByRole('tab', { name: 'Main' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Show facet row' }))
    expect(screen.getByRole('tab', { name: 'Main' })).toBeTruthy()
  })
})
