import { useState } from 'react'

import { GripVertical, Lock, Plus } from '../lib/icons.js'
import { cn } from './ui/utils.js'

export type FolderFacetOrientation = 'horizontal' | 'vertical'

export interface FolderFacetNavItem {
  id: string
  label: string
  private?: boolean
  fixed?: boolean
  disabled?: boolean
}

export function FolderFacetNav({
  items,
  activeId,
  orientation = 'horizontal',
  onSelect,
  onReorder,
  onAdd,
}: {
  items: readonly FolderFacetNavItem[]
  activeId: string
  orientation?: FolderFacetOrientation
  onSelect: (id: string) => void
  onReorder?: (draggedId: string, targetId: string) => void
  onAdd?: () => void
}): React.JSX.Element {
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const vertical = orientation === 'vertical'

  return (
    <nav aria-label="Folder facets">
      <div
        className={cn(
          'flex gap-1',
          vertical
            ? 'w-full flex-col items-stretch'
            : 'w-full items-center overflow-x-auto pb-0.5',
        )}
      >
        {items.map((item) => {
          const active = item.id === activeId
          const draggable =
            onReorder !== undefined && item.fixed !== true && item.disabled !== true

          return (
            <button
              key={item.id}
              type="button"
              aria-current={active ? 'page' : undefined}
              aria-label={item.private ? `${item.label} — Private, only you` : item.label}
              title={item.private ? 'Private — Only you' : undefined}
              disabled={item.disabled}
              draggable={draggable}
              onDragStart={() => {
                if (draggable) setDraggedId(item.id)
              }}
              onDragEnd={() => {
                setDraggedId(null)
              }}
              onDragOver={(event) => {
                if (draggedId !== null && draggable) event.preventDefault()
              }}
              onDrop={() => {
                if (
                  draggedId !== null &&
                  draggedId !== item.id &&
                  onReorder !== undefined
                ) {
                  onReorder(draggedId, item.id)
                }
                setDraggedId(null)
              }}
              onClick={() => {
                onSelect(item.id)
              }}
              className={cn(
                'group/facet inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-sm outline-none transition-colors',
                'focus-visible:ring-2 focus-visible:ring-[var(--color-dana-accent-600)]',
                active
                  ? 'bg-[var(--color-graphite-100)] font-medium text-[var(--color-graphite-900)]'
                  : 'text-[var(--color-graphite-600)] hover:bg-[var(--color-graphite-50)] hover:text-[var(--color-graphite-900)]',
                item.disabled === true && 'cursor-not-allowed opacity-40',
                vertical && 'w-full justify-start',
              )}
            >
              {draggable ? (
                <GripVertical
                  className="size-3.5 text-[var(--color-graphite-400)] opacity-0 transition-opacity group-hover/facet:opacity-100 group-focus-visible/facet:opacity-100"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
              ) : null}
              {item.private === true ? (
                <Lock className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
              ) : null}
              <span className="truncate">{item.label}</span>
            </button>
          )
        })}

        <button
          type="button"
          aria-label="Add facet"
          disabled={onAdd === undefined}
          onClick={onAdd}
          className={cn(
            'inline-flex size-8 shrink-0 items-center justify-center rounded-md text-[var(--color-graphite-500)] outline-none transition-colors',
            'hover:bg-[var(--color-graphite-50)] hover:text-[var(--color-graphite-900)]',
            'focus-visible:ring-2 focus-visible:ring-[var(--color-dana-accent-600)]',
            'disabled:cursor-not-allowed disabled:opacity-40',
            vertical && 'self-start',
          )}
        >
          <Plus className="size-4" strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>
    </nav>
  )
}
