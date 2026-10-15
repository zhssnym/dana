// A nested Page shows the same Facet strip only when it owns several Facets.
// Reuse the ordinary tab treatment and menu behavior; no second editor.
import { useRef, useState } from 'react'

import type { GetPageFacetsResponse } from '../../../shared/page-facets.js'
import { Plus } from '../../lib/icons.js'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu.js'
import { cn } from '../../components/ui/utils.js'
import { moved, swallowNextClick, useSortableList } from '../../lib/use-sortable-list.js'

type Facet = GetPageFacetsResponse['facets'][number]

export function PageFacetStrip({
  facets, activeId, onSelect, onAdd, editable, canRename, onRename, canDelete, onDelete,
  alwaysShow = false, tools, canReorder = false, onReorder,
}: {
  readonly facets: readonly Facet[]
  readonly activeId: string | null
  readonly onSelect: (facet: Facet) => void
  readonly onAdd: () => void
  readonly editable: boolean
  readonly canRename: boolean
  readonly onRename: (facet: Facet, name: string) => void
  readonly canDelete: boolean
  readonly onDelete: (facet: Facet) => void
  readonly alwaysShow?: boolean
  readonly tools?: React.ReactNode
  readonly canReorder?: boolean
  readonly onReorder?: (order: string[]) => void
}): React.JSX.Element | null {
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ facet: Facet; x: number; y: number } | null>(null)
  const menuFor = useRef<string | null>(null)
  const fieldOpening = useRef(false)
  const sorter = useSortableList({
    count: facets.length,
    axis: 'x',
    disabled: !canReorder || renamingId !== null,
    onReorder: (from, to) => onReorder?.(moved(facets, from, to).map((facet) => facet.id)),
    onLift: swallowNextClick,
    describe: (index) => facets[index]?.name ?? '',
  })
  // Hooks run before the conditional return, so a one-Facet Page can gain a second.
  if (!alwaysShow && facets.length < 2) return null

  const startRename = (facet: Facet): void => {
    if (!canRename) return
    fieldOpening.current = true
    setMenu(null)
    setRenamingId(facet.id)
  }
  const openMenu = (facet: Facet, x: number, y: number): void => {
    if (!canRename && !canReorder && !(canDelete && facet.content_page_id === null)) return
    menuFor.current = facet.id
    fieldOpening.current = false
    setMenu({ facet, x, y })
  }

  const move = (facet: Facet, direction: -1 | 1): void => {
    if (!canReorder || onReorder === undefined) return
    const index = facets.findIndex((entry) => entry.id === facet.id)
    const target = index + direction
    if (index < 0 || target < 0 || target >= facets.length) return
    const ids = facets.map((entry) => entry.id)
    ;[ids[index], ids[target]] = [ids[target]!, ids[index]!]
    onReorder(ids)
  }

  return (
    <div className="flex min-w-0 items-center gap-1 border-b border-border">
      <div role="tablist" aria-label="Page Facets"
        className="flex min-w-0 flex-1 items-end gap-1 overflow-x-auto">
        {facets.map((facet, index) => renamingId === facet.id ? (
          <FacetNameField key={facet.id} initial={facet.name}
            onDone={(name) => {
              setRenamingId(null)
              if (name !== null && name !== '' && name !== facet.name) onRename(facet, name)
            }}
          />
        ) : (
          <button key={facet.id} type="button" role="tab" data-facet-id={facet.id}
            ref={sorter.setItemRef(index)}
            data-sort-handle={canReorder || undefined}
            onPointerDown={sorter.handleProps(index).onPointerDown}
            aria-selected={activeId === facet.id}
            aria-haspopup={canRename || canReorder || (canDelete && facet.content_page_id === null) ? 'menu' : undefined}
            onClick={() => onSelect(facet)}
            onDoubleClick={() => startRename(facet)}
            onContextMenu={(event) => {
              if (!canRename && !canReorder && !(canDelete && facet.content_page_id === null)) return
              event.preventDefault()
              openMenu(facet, event.clientX, event.clientY)
            }}
            onKeyDown={(event) => {
              if (canReorder && event.altKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
                event.preventDefault()
                move(facet, event.key === 'ArrowLeft' ? -1 : 1)
                return
              }
              if (!(canRename || canReorder || (canDelete && facet.content_page_id === null)) || (event.key !== 'ContextMenu' &&
                  !(event.shiftKey && event.key === 'F10'))) return
              event.preventDefault()
              const rect = event.currentTarget.getBoundingClientRect()
              openMenu(facet, rect.left, rect.bottom)
            }}
            style={{
              touchAction: canReorder ? 'none' : undefined,
              transform: sorter.itemState(index).offset === 0 ? undefined
                : `translateX(${sorter.itemState(index).offset}px)`,
            }}
            className={cn(
              'shrink-0 border-b-2 px-3 py-2 text-sm transition-colors',
              sorter.itemState(index).isActive && 'z-10 cursor-grabbing opacity-60',
              activeId === facet.id
                ? 'border-foreground font-medium text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {facet.name}
          </button>
        ))}
      </div>
      {editable ? (
        <button type="button" onClick={onAdd} aria-label="Add Facet"
          className="flex size-8 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground">
          <Plus className="size-4" strokeWidth={1.75} aria-hidden="true" />
        </button>
      ) : null}
      {tools === undefined ? null : <div className="shrink-0 border-l border-border pl-2">{tools}</div>}
      <DropdownMenu open={menu !== null} onOpenChange={(open) => { if (!open) setMenu(null) }}>
        <DropdownMenuTrigger nativeButton={false}
          render={<span aria-hidden="true" tabIndex={-1} />}
          style={{ position: 'fixed', left: menu?.x ?? 0, top: menu?.y ?? 0, width: 0, height: 0 }}
        />
        <DropdownMenuContent align="start" className="w-auto" finalFocus={() => {
          if (fieldOpening.current) return false
          const target = menuFor.current
          return (target === null ? null
            : globalThis.document.querySelector<HTMLElement>(`[role="tab"][data-facet-id="${target}"]`))
            ?? globalThis.document.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
            ?? true
        }}>
          {menu === null ? null : (
            <>
              {canRename ? (
                <DropdownMenuItem onClick={() => startRename(menu.facet)}>Rename</DropdownMenuItem>
              ) : null}
              {canReorder ? (
                <>
                  <DropdownMenuItem disabled={facets[0]?.id === menu.facet.id}
                    onClick={() => move(menu.facet, -1)}>Move left</DropdownMenuItem>
                  <DropdownMenuItem disabled={facets[facets.length - 1]?.id === menu.facet.id}
                    onClick={() => move(menu.facet, 1)}>Move right</DropdownMenuItem>
                </>
              ) : null}
              {canDelete && menu.facet.content_page_id === null ? (
                <DropdownMenuItem variant="destructive" onClick={() => {
                  const target = menu.facet
                  setMenu(null)
                  onDelete(target)
                }}>Move to Trash</DropdownMenuItem>
              ) : null}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

// Match the existing Page-tab inline rename interaction: Enter/blur save,
// Escape cancels. A ref stops blur after Enter from committing twice.
function FacetNameField({ initial, onDone }: {
  readonly initial: string
  readonly onDone: (name: string | null) => void
}): React.JSX.Element {
  const [value, setValue] = useState(initial)
  const settled = useRef(false)
  const finish = (next: string | null): void => {
    if (settled.current) return
    settled.current = true
    onDone(next === null ? null : next.replace(/\s+/g, ' ').trim())
  }
  return (
    <span className="-mb-px inline-flex h-[var(--control-height)] shrink-0 items-center border-b-2 border-foreground">
      <input autoFocus value={value} aria-label={`Name of ${initial}`}
        maxLength={120} size={Math.max(8, value.length + 1)}
        onFocus={(event) => event.currentTarget.select()}
        onChange={(event) => setValue(event.target.value)}
        onBlur={() => finish(value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            finish(value)
          }
          if (event.key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            finish(null)
          }
        }}
        className="bg-transparent text-sm font-medium text-foreground outline-none placeholder:text-muted-foreground"
      />
    </span>
  )
}
