/*
A folder's tabs (its facets): a row of plain text tabs and nothing else, and
the "Tabs…" dialog the folder's "…" opens to rename, reorder, hide, add and
remove them.

**The row under the header is only the tabs** (the Quiet spec). No icons, no
"+", no eye, no view controls: hidden facets simply do not show, and every act
on a tab lives in one place, the dialog. Arrow keys move between tabs.

**Every act is gated by the same table the routes resolve against**
(`FacetCapabilities`, built by FolderPage from `shared/folder-actions.ts`), so
the dialog offers nothing a 403 would answer.
*/
import type { Facet, FacetKind } from '../../shared/facets.js'
import { isHideableFacetKind, isRenameableFacetKind } from '../../shared/facets.js'
import type { PageView } from '../../shared/pages.js'
import { moved } from '../lib/use-sortable-list.js'
import { useState } from 'react'
import type { ReactNode } from 'react'
import { GripVertical } from '../lib/icons.js'
import { Button } from './ui/button.js'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog.js'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from './ui/dropdown-menu.js'
import { Switch } from './ui/switch.js'
import { cn } from './ui/utils.js'

export interface FacetCapabilities {
  readonly createShared: boolean
  readonly createPrivate: boolean
  readonly reorderShared: boolean
  readonly reorderPrivate: boolean
  readonly rename: boolean
  readonly hide: boolean
  readonly delete: boolean
  readonly share: boolean
}

export interface CreateFacetInput {
  readonly kind: Extract<FacetKind, 'work' | 'shared_blank' | 'private_blank'>
  readonly name?: string
  readonly h1BlockId?: string
}

/** The tab row. Only visible facets; the active one in the foreground. */
export function FolderTabs({
  facets,
  activeId,
  onSelect,
  trailing,
}: {
  readonly facets: readonly Facet[]
  readonly activeId: string
  readonly onSelect: (facet: Facet) => void
  /** Drawn at the row's right end: the list's "View" menu, so it takes no row
      of its own. */
  readonly trailing?: ReactNode
}): React.JSX.Element | null {
  const visible = facets.filter((facet) => !facet.hidden)
  /* One tab is not a choice: a folder showing only Main draws no row (the
     page puts "View" beside Share instead). */
  if (visible.length < 2) return null
  const active = visible.find((facet) => facet.id === activeId) ?? visible[0]

  function moveFocus(facet: Facet, direction: -1 | 1): void {
    const index = visible.findIndex((candidate) => candidate.id === facet.id)
    const next = visible[(index + direction + visible.length) % visible.length]
    if (next === undefined) return
    onSelect(next)
    globalThis.requestAnimationFrame(() => {
      globalThis.document.getElementById(`facet-tab-${next.id}`)?.focus()
    })
  }

  return (
    <div className="flex min-w-0 items-center gap-2 border-b border-border">
    <div
      role="tablist"
      aria-label="Folder tabs"
      className="flex min-w-0 flex-1 items-center gap-5 overflow-x-auto [&::-webkit-scrollbar]:hidden"
      style={{ scrollbarWidth: 'none' }}
    >
      {visible.map((facet) => {
        const current = facet.id === active?.id
        return (
          <button
            key={facet.id}
            id={`facet-tab-${facet.id}`}
            type="button"
            role="tab"
            aria-selected={current}
            aria-label={facet.private ? `${facet.name} — Private, only you` : facet.name}
            title={facet.private ? 'Private — only you can see this tab' : undefined}
            tabIndex={current ? 0 : -1}
            onClick={() => onSelect(facet)}
            onKeyDown={(event) => {
              if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
              event.preventDefault()
              moveFocus(facet, event.key === 'ArrowLeft' ? -1 : 1)
            }}
            className={cn(
              '-mb-px shrink-0 border-b-2 py-2 text-sm whitespace-nowrap outline-none transition-colors focus-visible:text-foreground',
              current
                ? 'border-foreground font-medium text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {facet.name}
          </button>
        )
      })}
    </div>
    {trailing === undefined ? null : <div className="shrink-0">{trailing}</div>}
    </div>
  )
}

/**
 * "Tabs…": a plain list of every facet, shown or hidden, in order. Each row is
 * a grip to drag it (arrow keys on the grip move it too), its name (renamed in
 * place where it may be), text actions only where they apply ("Share" on a
 * private tab, "Delete" on a custom one) and a Show switch where it may be
 * hidden. "Add tab" at the foot. No per-row menu.
 */
export function FolderTabsDialog({
  open,
  onOpenChange,
  facets,
  capabilities,
  page,
  onCreate,
  onReorder,
  onRename,
  onHide,
  onDelete,
  onShare,
}: {
  readonly open: boolean
  readonly onOpenChange: (next: boolean) => void
  readonly facets: readonly Facet[]
  readonly capabilities: (facet: Facet | null) => FacetCapabilities
  readonly page: PageView | undefined
  readonly onCreate: (input: CreateFacetInput) => void
  readonly onReorder: (dragged: Facet, orderedVisible: readonly Facet[]) => void
  readonly onRename: (facet: Facet, name: string | null) => void
  readonly onHide: (facet: Facet, hidden: boolean) => void
  readonly onDelete: (facet: Facet) => void
  readonly onShare: (facet: Facet) => void
}): React.JSX.Element {
  const visible = facets.filter((facet) => !facet.hidden)
  const main = visible.find((facet) => facet.kind === 'main') ?? null
  const movable = visible.filter((facet) => facet.kind !== 'main')
  const general = capabilities(null)
  const linked = new Set(facets.flatMap((facet) => (facet.h1_block_id ? [facet.h1_block_id] : [])))
  const sections =
    page?.blocks.filter(
      (block) => block.kind === 'section' && block.section_block_id === null && !linked.has(block.id),
    ) ?? []

  function moveTo(facet: Facet, to: number): void {
    const from = movable.findIndex((candidate) => candidate.id === facet.id)
    if (from < 0 || to < 0 || to >= movable.length || to === from) return
    onReorder(facet, [...(main ? [main] : []), ...moved(movable, from, to)])
  }
  /* The row being dragged, and the row it is over, by id. */
  const [dragging, setDragging] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Tabs</DialogTitle>
        </DialogHeader>
        <ul className="-mx-1">
          {facets.map((facet) => {
            const caps = capabilities(facet)
            const renameable = facet.kind !== 'main' && isRenameable(facet) && caps.rename
            const hideable = isHideableFacetKind(facet.kind) && caps.hide
            const index = movable.findIndex((candidate) => candidate.id === facet.id)
            const reorderable = index >= 0 && (facet.private ? caps.reorderPrivate : caps.reorderShared)
            const custom = facet.private || facet.kind === 'work' || facet.kind.endsWith('_blank')
            return (
              <li
                key={facet.id}
                onDragOver={(event) => {
                  if (dragging === null || index < 0) return
                  event.preventDefault()
                  setOver(facet.id)
                }}
                onDrop={(event) => {
                  event.preventDefault()
                  const carried = movable.find((candidate) => candidate.id === dragging)
                  if (carried !== undefined && index >= 0) moveTo(carried, index)
                  setDragging(null)
                  setOver(null)
                }}
                className={cn(
                  'flex h-9 items-center gap-2 rounded-md px-1 hover:bg-muted',
                  dragging === facet.id && 'opacity-50',
                  over === facet.id && dragging !== facet.id && 'bg-muted',
                )}
              >
                {reorderable ? (
                  <button
                    type="button"
                    draggable
                    aria-label={`Move ${facet.name}`}
                    title="Drag to reorder"
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = 'move'
                      event.dataTransfer.setData('text/plain', facet.id)
                      setDragging(facet.id)
                    }}
                    onDragEnd={() => {
                      setDragging(null)
                      setOver(null)
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
                      event.preventDefault()
                      moveTo(facet, index + (event.key === 'ArrowUp' ? -1 : 1))
                    }}
                    className="flex size-6 shrink-0 cursor-grab items-center justify-center rounded-sm text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
                  >
                    <GripVertical className="size-4" strokeWidth={1.75} aria-hidden="true" />
                  </button>
                ) : (
                  <span className="size-6 shrink-0" aria-hidden="true" />
                )}
                {renameable ? (
                  <input
                    key={facet.name}
                    defaultValue={facet.name}
                    aria-label={`Name of ${facet.name}`}
                    maxLength={120}
                    onBlur={(event) => {
                      const next = event.target.value.trim()
                      if (next === facet.name) return
                      /* Clearing a built-in tab's name gives its own back. */
                      if (next === '') {
                        if (isRenameableFacetKind(facet.kind)) onRename(facet, null)
                        else event.target.value = facet.name
                        return
                      }
                      onRename(facet, next)
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') event.currentTarget.blur()
                      if (event.key === 'Escape') {
                        event.currentTarget.value = facet.name
                        event.currentTarget.blur()
                      }
                    }}
                    className="h-7 min-w-0 flex-1 rounded-sm bg-transparent px-1 text-sm text-foreground outline-none hover:bg-background focus-visible:ring-2 focus-visible:ring-ring"
                  />
                ) : (
                  <span className="min-w-0 flex-1 truncate px-1 text-sm text-foreground">{facet.name}</span>
                )}
                {facet.private ? <span className="shrink-0 text-xs text-muted-foreground">Private</span> : null}
                {facet.private && caps.share ? (
                  <button type="button" onClick={() => onShare(facet)} className="shrink-0 rounded-sm px-1 text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
                    Share…
                  </button>
                ) : null}
                {custom && caps.delete ? (
                  <button type="button" onClick={() => onDelete(facet)} className="shrink-0 rounded-sm px-1 text-xs text-muted-foreground outline-none hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring">
                    Delete
                  </button>
                ) : null}
                {hideable ? (
                  <Switch
                    aria-label={`Show ${facet.name}`}
                    checked={!facet.hidden}
                    onCheckedChange={(checked) => onHide(facet, !checked)}
                  />
                ) : null}
              </li>
            )
          })}
        </ul>
        {general.createShared || general.createPrivate ? (
          <div>
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="ghost" className="-ml-2 text-muted-foreground" />}>
                Add tab
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                {general.createShared ? (
                  <DropdownMenuItem onClick={() => onCreate({ kind: 'shared_blank', name: 'New tab' })}>
                    Blank tab
                  </DropdownMenuItem>
                ) : null}
                {general.createPrivate ? (
                  <DropdownMenuItem onClick={() => onCreate({ kind: 'private_blank', name: 'Private notes' })}>
                    Private tab, only you
                  </DropdownMenuItem>
                ) : null}
                {general.createShared && sections.length > 0 ? (
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>A section of Main</DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="w-56">
                      {sections.map((block) => (
                        <DropdownMenuItem
                          key={block.id}
                          onClick={() => onCreate({ kind: 'work', h1BlockId: block.id })}
                        >
                          <span className="truncate">{block.text || 'Untitled section'}</span>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function isRenameable(facet: Facet): boolean {
  return isRenameableFacetKind(facet.kind) || facet.kind.endsWith('_blank')
}
