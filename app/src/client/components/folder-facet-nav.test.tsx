import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { FolderFacetNav } from './folder-facet-nav.js'

describe('FolderFacetNav', () => {
  it('marks the active facet, keeps private facets explicit, and exposes Add facet', () => {
    render(
      <FolderFacetNav
        items={[
          { id: 'main', label: 'Main', fixed: true },
          { id: 'notes', label: 'My notes', private: true },
        ]}
        activeId="main"
        onSelect={() => {}}
        onAdd={() => {}}
      />,
    )

    expect(screen.getByRole('button', { name: 'Main' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(
      screen.getByRole('button', { name: 'My notes — Private, only you' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add facet' })).toBeEnabled()
  })

  it('reports a drag reorder without owning persistence', () => {
    const onReorder = vi.fn()

    render(
      <FolderFacetNav
        items={[
          { id: 'main', label: 'Main', fixed: true },
          { id: 'engineering', label: 'Engineering' },
          { id: 'procurement', label: 'Procurement' },
        ]}
        activeId="main"
        onSelect={() => {}}
        onReorder={onReorder}
      />,
    )

    const engineering = screen.getByRole('button', { name: 'Engineering' })
    const procurement = screen.getByRole('button', { name: 'Procurement' })

    fireEvent.dragStart(engineering)
    fireEvent.dragOver(procurement)
    fireEvent.drop(procurement)

    expect(onReorder).toHaveBeenCalledWith('engineering', 'procurement')
  })

  it('disables Add facet until a real creation contract is supplied', () => {
    render(
      <FolderFacetNav
        items={[{ id: 'main', label: 'Main', fixed: true }]}
        activeId="main"
        onSelect={() => {}}
      />,
    )

    expect(screen.getByRole('button', { name: 'Add facet' })).toBeDisabled()
  })
})
