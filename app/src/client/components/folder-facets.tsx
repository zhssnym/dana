/*
A page's tabs (its facets): a row of plain text tabs and nothing else, and
the "Tabs…" dialog the page's "…" opens to rename, reorder, hide, add and
remove them.

**The row reads intro, work, conclusion** (round 2): Purpose · Work · Results ·
Discussion, then the custom tabs in their stored order (`tabOrder`). `main` is
named "Work" and `consultation` "Discussion" by the server's own table
(`DEFAULT_FACET_NAMES`); the stored kinds and the stored order are unchanged,
so the four built-in tabs keep their places and only custom tabs move.

**The row under the header is only the tabs** (the Quiet spec). No icons, no
"+", no eye, no view controls: hidden facets simply do not show, and every act
on a tab lives in one place, the dialog. Arrow keys move between tabs.

**Every act is gated by the same table the routes resolve against**
(`FacetCapabilities`, built by FolderPage from `shared/folder-actions.ts`), so
the dialog offers nothing a 403 would answer.
*/
import type { Facet, FacetKind } from '../../shared/facets.js'
import {
  isHideableFacetKind,
  isRenameableFacetKind,
  NATIVE_TAB_ORDER,
} from '../../shared/facets.js'
import type { PageView } from '../../shared/pages.js'
import { moved } from '../lib/use-sortable-list.js'
import { useEffect, useRef, useState } from 'react'
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

/**
 * True while a page's tabs are still in the order it was made with: the four
 * built-ins at their creation keys (`createNativeFacets`: Main `a0`, Purpose
 * `a1`, Consultation `a2`, Results `a3`), which no written order reproduces --
 * `PUT /facets/order` keys from `a1` on. Such a page draws the default order.
 */
function untouched(facets: readonly Pick<Facet, 'kind' | 'position'>[]): boolean {
  const at = (kind: FacetKind): string | undefined =>
    facets.find((facet) => facet.kind === kind)?.position
  return at('main') === 'a0' && at('purpose') === 'a1' && at('consultation') === 'a2' && at('results') === 'a3'
}

/**
 * The drawn order. **Purpose · Work · Results · Discussion is only the
 * default**: a page nobody has reordered draws the built-ins in that order and
 * its custom tabs after them, in their stored order; once a person drags a tab,
 * the stored order is the order.
 */
export function tabOrder<T extends Pick<Facet, 'kind' | 'position'>>(facets: readonly T[]): T[] {
  if (!untouched(facets)) return [...facets]
  const rank = (facet: T): number => {
    const native = NATIVE_TAB_ORDER.indexOf(facet.kind as (typeof NATIVE_TAB_ORDER)[number])
    return native < 0 ? NATIVE_TAB_ORDER.length : native
  }
  return facets
    .map((facet, index) => ({ facet, index }))
    .sort((a, b) => rank(a.facet) - rank(b.facet) || a.index - b.index)
    .map((entry) => entry.facet)
}

/** How long a finger rests on a tab before it lifts (touch only). */
const LONG_PRESS_MS = 400
/** How far a mouse moves before a press becomes a drag rather than a click. */
const DRAG_SLOP_PX = 4

interface TabDrag {
  readonly id: string
  readonly pointerId: number
  readonly startX: number
  /** The pointer's x now, for the lifted tab's offset. */
  readonly x: number
  /** Lifted: following the pointer. Before that it is only a press. */
  readonly lifted: boolean
  /** The gap the tab would land in, 0..visible.length. */
  readonly gap: number
}

/**
 * The tab row. Only visible facets; the active one in the foreground.
 *
 * **Tabs are reordered by dragging them on the row itself**, the way browser
 * tabs are: a mouse press that moves lifts the tab, a finger lifts it after a
 * long press; the lifted tab follows the pointer at reduced opacity and a thin
 * accent line marks the gap it will land in. Esc puts it back. Alt+← / Alt+→
 * on a focused tab moves it one place. The row is the one home of reordering;
 * the Tabs… dialog shows, hides and renames.
 */
export function FolderTabs({
  facets,
  activeId,
  onSelect,
  canMove,
  onReorder,
}: {
  readonly facets: readonly Facet[]
  readonly activeId: string
  readonly onSelect: (facet: Facet) => void
  /** Whether this viewer may move this tab (the reorder capability). */
  readonly canMove?: (facet: Facet) => boolean
  /** The whole visible row in its new order, the moved tab named. */
  readonly onReorder?: (dragged: Facet, orderedVisible: readonly Facet[]) => void
}): React.JSX.Element | null {
  const visible = tabOrder(facets.filter((facet) => !facet.hidden))
  const [drag, setDrag] = useState<TabDrag | null>(null)
  const dragRef = useRef<TabDrag | null>(null)
  const rowRef = useRef<HTMLDivElement | null>(null)
  const pressTimer = useRef<number | null>(null)
  /* A drag's release is not also a click on the tab under it. */
  const swallowClick = useRef(false)

  const put = (next: TabDrag | null): void => {
    dragRef.current = next
    setDrag(next)
  }
  const clearTimer = (): void => {
    if (pressTimer.current !== null) globalThis.clearTimeout(pressTimer.current)
    pressTimer.current = null
  }

  /* The gap under the pointer: before the first tab whose middle is right of it. */
  const gapAt = (x: number, held: TabDrag): number => {
    const row = rowRef.current
    if (row === null) return 0
    const tabs = Array.from(row.querySelectorAll<HTMLElement>('[role="tab"]'))
    const index = tabs.findIndex((tab) => {
      const box = tab.getBoundingClientRect()
      /* The lifted tab is measured where it stands, not where it is drawn. */
      const shift = tab.id === `facet-tab-${held.id}` && held.lifted ? held.x - held.startX : 0
      return x < box.left - shift + box.width / 2
    })
    return index < 0 ? tabs.length : index
  }

  const reorderTo = (facet: Facet, gap: number): void => {
    const from = visible.findIndex((candidate) => candidate.id === facet.id)
    if (from < 0 || onReorder === undefined) return
    const to = gap > from ? gap - 1 : gap
    if (to === from) return
    onReorder(facet, moved(visible, from, to))
  }

  /* Esc cancels a lifted tab; a touch-drag must not scroll the row. */
  useEffect(() => {
    if (drag === null) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      clearTimer()
      swallowClick.current = dragRef.current?.lifted === true
      put(null)
    }
    const onTouchMove = (event: TouchEvent): void => {
      if (dragRef.current?.lifted === true) event.preventDefault()
    }
    globalThis.addEventListener('keydown', onKey, true)
    globalThis.addEventListener('touchmove', onTouchMove, { passive: false })
    return () => {
      globalThis.removeEventListener('keydown', onKey, true)
      globalThis.removeEventListener('touchmove', onTouchMove)
    }
  }, [drag === null])

  useEffect(() => clearTimer, [])

  /* One tab is not a choice: a page showing only Work draws no row. */  if (visible.length < 2) return null
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
    <div
      ref={rowRef}
      role="tablist"
      aria-label="Page tabs"
      className="flex min-w-0 items-center gap-5 overflow-x-auto border-b border-border [&::-webkit-scrollbar]:hidden"
      style={{ scrollbarWidth: 'none' }}
    >
      {visible.map((facet, index) => {
        const current = facet.id === active?.id
        const movable = onReorder !== undefined && (canMove?.(facet) ?? false)
        const lifted = drag?.lifted === true && drag.id === facet.id
        /* The accent line sits in the gap before this tab, or after the last. */
        const lineBefore = drag?.lifted === true && drag.gap === index
        const lineAfter = drag?.lifted === true && drag.gap === visible.length && index === visible.length - 1
        return (
          <button
            key={facet.id}
            id={`facet-tab-${facet.id}`}
            type="button"
            role="tab"
            aria-selected={current}
            aria-label={facet.private ? `${facet.name} — Private, only you` : facet.name}
            aria-keyshortcuts={movable ? 'Alt+ArrowLeft Alt+ArrowRight' : undefined}
            title={facet.private ? 'Private — only you can see this tab' : undefined}
            tabIndex={current ? 0 : -1}
            onClick={() => {
              if (swallowClick.current) {
                swallowClick.current = false
                return
              }
              onSelect(facet)
            }}
            onKeyDown={(event) => {
              if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
              event.preventDefault()
              const direction = event.key === 'ArrowLeft' ? -1 : 1
              if (event.altKey) {
                if (!movable) return
                /* Alt+←/→ moves the tab one place and keeps it focused. */
                reorderTo(facet, direction < 0 ? index - 1 : index + 2)
                globalThis.requestAnimationFrame(() => {
                  globalThis.document.getElementById(`facet-tab-${facet.id}`)?.focus()
                })
                return
              }
              moveFocus(facet, direction)
            }}
            onPointerDown={(event) => {
              if (!movable || event.button !== 0) return
              const press: TabDrag = {
                id: facet.id,
                pointerId: event.pointerId,
                startX: event.clientX,
                x: event.clientX,
                lifted: false,
                gap: index,
              }
              put(press)
              if (event.pointerType === 'touch') {
                const target = event.currentTarget
                clearTimer()
                pressTimer.current = globalThis.setTimeout(() => {
                  const held = dragRef.current
                  if (held === null || held.id !== facet.id) return
                  try {
                    target.setPointerCapture(held.pointerId)
                  } catch {
                    /* The finger already left. */
                  }
                  put({ ...held, lifted: true })
                }, LONG_PRESS_MS)
              }
            }}
            onPointerMove={(event) => {
              const held = dragRef.current
              if (held === null || held.pointerId !== event.pointerId) return
              if (!held.lifted) {
                const distance = Math.abs(event.clientX - held.startX)
                if (event.pointerType === 'touch') {
                  /* Moving before the long press is a scroll, not a drag. */
                  if (distance > 8) {
                    clearTimer()
                    put(null)
                  }
                  return
                }
                if (distance <= DRAG_SLOP_PX) return
                event.currentTarget.setPointerCapture(event.pointerId)
              }
              put({ ...held, lifted: true, x: event.clientX, gap: gapAt(event.clientX, held) })
            }}
            onPointerUp={(event) => {
              clearTimer()
              const held = dragRef.current
              if (held === null || held.pointerId !== event.pointerId) return
              put(null)
              if (!held.lifted) return
              swallowClick.current = true
              reorderTo(facet, held.gap)
            }}
            onPointerCancel={() => {
              clearTimer()
              put(null)
            }}
            onLostPointerCapture={() => {
              if (dragRef.current?.lifted === true) put(null)
            }}
            onContextMenu={(event) => {
              /* A long press lifts the tab rather than opening the menu. */
              if (dragRef.current !== null && event.nativeEvent instanceof PointerEvent && event.nativeEvent.pointerType === 'touch') event.preventDefault()
            }}
            style={{
              ...(lifted && drag !== null ? { transform: `translateX(${String(drag.x - drag.startX)}px)` } : {}),
              ...(movable ? { WebkitTouchCallout: 'none' } : {}),
            }}
            className={cn(
              'relative -mb-px shrink-0 border-b-2 py-2 text-sm whitespace-nowrap outline-none transition-colors select-none focus-visible:text-foreground',
              current
                ? 'border-foreground font-medium text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
              lifted && 'z-10 cursor-grabbing opacity-50 transition-none',
              lineBefore &&
                (index === 0
                  ? 'before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-primary'
                  : 'before:absolute before:inset-y-1.5 before:-left-3 before:w-0.5 before:rounded-full before:bg-primary'),
              lineAfter &&
                'after:absolute after:inset-y-1.5 after:-right-3 after:w-0.5 after:rounded-full after:bg-primary',
            )}
          >
            {facet.name}
          </button>
        )
      })}
    </div>
  )
}

/**
 * "Tabs…": a plain list of every tab, shown or hidden, in the row's order.
 * Each row is its name (renamed in place where it may be), text actions only
 * where they apply ("Share" on a private tab, "Delete" on a custom one) and a
 * Show switch where it may be hidden. "Add tab" at the foot. No per-row menu
 * and no grip: tabs are reordered by dragging them on the row itself.
 */
export function FolderTabsDialog({
  open,
  onOpenChange,
  facets,
  capabilities,
  page,
  onCreate,
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
  readonly onRename: (facet: Facet, name: string | null) => void
  readonly onHide: (facet: Facet, hidden: boolean) => void
  readonly onDelete: (facet: Facet) => void
  readonly onShare: (facet: Facet) => void
}): React.JSX.Element {
  const general = capabilities(null)
  const linked = new Set(facets.flatMap((facet) => (facet.h1_block_id ? [facet.h1_block_id] : [])))
  const sections =
    page?.blocks.filter(
      (block) => block.kind === 'section' && block.section_block_id === null && !linked.has(block.id),
    ) ?? []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Tabs</DialogTitle>
        </DialogHeader>
        <ul className="-mx-1">
          {tabOrder(facets).map((facet) => {
            const caps = capabilities(facet)
            const renameable = facet.kind !== 'main' && isRenameable(facet) && caps.rename
            const hideable = isHideableFacetKind(facet.kind) && caps.hide
            const custom = facet.private || facet.kind === 'work' || facet.kind.endsWith('_blank')
            return (
              <li key={facet.id} className="flex h-9 items-center gap-2 rounded-md px-2 hover:bg-muted">
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
                    <DropdownMenuSubTrigger>A section of Work</DropdownMenuSubTrigger>
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
