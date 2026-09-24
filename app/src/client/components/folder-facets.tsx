/*
A page's tabs (its facets): a row of plain text tabs and one "+", and nothing
else. The row is the one place tabs are managed.

**The row reads intro, work, conclusion** (round 2): Purpose · Work · Results ·
Discussion, then the custom tabs in their stored order (`tabOrder`). `main` is
named "Work" and `consultation` "Discussion" by the server's own table
(`DEFAULT_FACET_NAMES`); the stored kinds and the stored order are unchanged,
so the four built-in tabs keep their places and only custom tabs move.

**A tab's own acts are on the tab**: right-click it (or Shift+F10 / the menu
key) for Rename, Hide (Purpose, Results, Discussion), Share (a private tab) and
Delete (a custom tab). Work can be neither renamed nor hidden, so its menu
offers what "+" offers. **The "+"** lists the hidden tabs to show again above
"New tab"; with nothing hidden it goes straight to the name field. Drag, or
Alt+←/→, reorders. Arrow keys move between tabs.

**Every act is gated by the same table the routes resolve against**
(`FacetCapabilities`, built by FolderPage from `shared/folder-actions.ts`), so
the row offers nothing a 403 would answer.
*/
import type { Facet, FacetKind } from '../../shared/facets.js'
import {
  isHideableFacetKind,
  isRenameableFacetKind,
  NATIVE_TAB_ORDER,
} from '../../shared/facets.js'
import { moved } from '../lib/use-sortable-list.js'
import { useEffect, useRef, useState } from 'react'
import { Button } from './ui/button.js'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu.js'
import { Tab, TabList } from './ui/tabs.js'
import { cn } from './ui/utils.js'
import { Plus } from '../lib/icons.js'

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
 * True while a page's tabs are still in the order it was made with: the
 * built-ins at their creation keys (`createNativeFacets`: Main `a0`, Purpose
 * `a1`, Consultation `a2`, Results `a3`), which no written order reproduces --
 * `PUT /facets/order` keys from `a1` on. Such a page draws the default order.
 *
 * Asked of every tab, hidden ones included, and a built-in that is absent does
 * not count against it: hiding Discussion (the Desk does) is not reordering,
 * and must not drop the row back to stored order (Work · Purpose · Results).
 */
const CREATION_KEYS: Readonly<Record<string, string>> = {
  main: 'a0',
  purpose: 'a1',
  consultation: 'a2',
  results: 'a3',
}

function untouched(facets: readonly Pick<Facet, 'kind' | 'position'>[]): boolean {
  const at = (kind: FacetKind): string | undefined =>
    facets.find((facet) => facet.kind === kind)?.position
  return (
    at('main') === 'a0' &&
    Object.entries(CREATION_KEYS).every(([kind, key]) => {
      const position = at(kind as FacetKind)
      return position === undefined || position === key
    })
  )
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
 * on a focused tab moves it one place.
 */
export function FolderTabs({
  facets,
  activeId,
  onSelect,
  canMove,
  onReorder,
  capabilities,
  onAdd,
  onRename,
  onHide,
  onShare,
  onDelete,
}: {
  readonly facets: readonly Facet[]
  readonly activeId: string
  readonly onSelect: (facet: Facet) => void
  /** Whether this viewer may move this tab (the reorder capability). */
  readonly canMove?: (facet: Facet) => boolean
  /** The whole visible row in its new order, the moved tab named. */
  readonly onReorder?: (dragged: Facet, orderedVisible: readonly Facet[]) => void
  /** The gate for every act; absent offers no add, rename, hide or delete. */
  readonly capabilities?: (facet: Facet | null) => FacetCapabilities
  /** The "+": a blank shared tab with this name. */
  readonly onAdd?: (name: string) => void
  /** Rename in place; null gives a built-in tab its own name back. */
  readonly onRename?: (facet: Facet, name: string | null) => void
  /** Hide a built-in tab, or show it again from the "+". */
  readonly onHide?: (facet: Facet, hidden: boolean) => void
  /** Share a private tab with the page. */
  readonly onShare?: (facet: Facet) => void
  /** Delete a custom tab. */
  readonly onDelete?: (facet: Facet) => void
}): React.JSX.Element | null {
  const ordered = tabOrder(facets)
  /* Ordered over every tab, then filtered: a hidden built-in is not a reorder. */
  const visible = ordered.filter((facet) => !facet.hidden)
  const [drag, setDrag] = useState<TabDrag | null>(null)
  const dragRef = useRef<TabDrag | null>(null)
  const rowRef = useRef<HTMLDivElement | null>(null)
  const pressTimer = useRef<number | null>(null)
  /* A drag's release is not also a click on the tab under it. */
  const swallowClick = useRef(false)
  /* The "+" field while it is open, and the tab being renamed in place. */
  const [adding, setAdding] = useState(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  /* Right-click's menu: the tab it is for, opened where the pointer was. */
  const [menu, setMenu] = useState<{ readonly facet: Facet; readonly x: number; readonly y: number } | null>(null)
  /* Where focus goes when a menu closes: back to its tab, or nowhere when the
     chosen item opened a name field that has already taken it. */
  const menuFor = useRef<string | null>(null)
  const fieldOpening = useRef(false)

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

  /* The current tab is never left scrolled out of a narrow row. */
  useEffect(() => {
    globalThis.document
      .getElementById(`facet-tab-${activeId}`)
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [activeId])

  const canAdd = onAdd !== undefined && capabilities?.(null).createShared === true
  const mayRename = (facet: Facet): boolean =>
    onRename !== undefined && isRenameable(facet) && capabilities?.(facet).rename === true
  const mayHide = (facet: Facet): boolean =>
    onHide !== undefined && isHideableFacetKind(facet.kind) && capabilities?.(facet).hide === true
  const mayShare = (facet: Facet): boolean =>
    onShare !== undefined && facet.private && capabilities?.(facet).share === true
  const mayDelete = (facet: Facet): boolean =>
    onDelete !== undefined && isCustom(facet) && capabilities?.(facet).delete === true
  /* The tabs "+" can bring back. */
  const showable = ordered.filter((facet) => facet.hidden && mayHide(facet))
  const plusOffers = canAdd || showable.length > 0

  /* One tab is not a choice: a page showing only Work draws no row, unless
     the "+" is there to make or show a second. */
  if (visible.length < 2 && !plusOffers) return null
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

  const hasMenu = (facet: Facet): boolean =>
    mayRename(facet) || mayHide(facet) || mayShare(facet) || mayDelete(facet) || plusOffers

  const openMenu = (facet: Facet, x: number, y: number): void => {
    menuFor.current = facet.id
    fieldOpening.current = false
    setMenu({ facet, x, y })
  }

  const finalFocus = (): HTMLElement | boolean => {
    if (fieldOpening.current) return false
    const doc = globalThis.document
    return (
      doc.getElementById(`facet-tab-${menuFor.current ?? ''}`) ??
      doc.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]') ??
      true
    )
  }

  const startAdding = (): void => {
    fieldOpening.current = true
    setAdding(true)
  }

  /* What "+" offers: the hidden tabs to show again, then "New tab". */
  const plusItems = (
    <>
      {showable.map((facet) => (
        <DropdownMenuItem key={facet.id} onClick={() => onHide?.(facet, false)}>
          Show {facet.name}
        </DropdownMenuItem>
      ))}
      {showable.length > 0 && canAdd ? <DropdownMenuSeparator /> : null}
      {canAdd ? <DropdownMenuItem onClick={startAdding}>New tab</DropdownMenuItem> : null}
    </>
  )

  const target = menu?.facet
  const tabActs = target !== undefined && (mayRename(target) || mayHide(target) || mayShare(target) || mayDelete(target))

  return (
    /* The hairline is the row's, under the tabs and the "+" alike. */
    <div className="flex min-w-0 items-end gap-2 border-b border-border">
      <TabList
        ref={rowRef}
        label="Page tabs"
        /* Padded out and pulled back: the focus outline and the underline
           overhang the tabs, and a scroller clips whatever overhangs it. */
        className="-my-1 -ms-1 border-b-0 py-1 ps-1 pe-3"
      >
        {visible.map((facet, index) => {
          const current = facet.id === active?.id
          const movable = onReorder !== undefined && (canMove?.(facet) ?? false)
          const lifted = drag?.lifted === true && drag.id === facet.id
          /* The accent line sits in the gap before this tab, or after the last. */
          const lineBefore = drag?.lifted === true && drag.gap === index
          const lineAfter = drag?.lifted === true && drag.gap === visible.length && index === visible.length - 1
          if (renamingId === facet.id) {
            return (
              <TabNameField
                key={facet.id}
                initial={facet.name}
                label={`Name of ${facet.name}`}
                onDone={(next) => {
                  setRenamingId(null)
                  /* Enter or Escape left focus nowhere: give it back to the tab. */
                  globalThis.requestAnimationFrame(() => {
                    const doc = globalThis.document
                    if (doc.activeElement === null || doc.activeElement === doc.body) {
                      doc.getElementById(`facet-tab-${facet.id}`)?.focus({ preventScroll: true })
                    }
                  })
                  if (next === null || next === facet.name) return
                  /* Clearing a built-in tab's name gives its own back. */
                  if (next === '') {
                    if (isRenameableFacetKind(facet.kind)) onRename?.(facet, null)
                    return
                  }
                  onRename?.(facet, next)
                }}
              />
            )
          }
          return (
            <Tab
              key={facet.id}
              id={`facet-tab-${facet.id}`}
              selected={current}
              aria-label={facet.private ? `${facet.name} — Private, only you` : facet.name}
              aria-haspopup={hasMenu(facet) ? 'menu' : undefined}
              aria-keyshortcuts={movable ? 'Alt+ArrowLeft Alt+ArrowRight' : undefined}
              title={facet.private ? 'Private — only you can see this tab' : undefined}
              onClick={() => {
                if (swallowClick.current) {
                  swallowClick.current = false
                  return
                }
                onSelect(facet)
              }}
              onKeyDown={(event) => {
                if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
                  if (!hasMenu(facet)) return
                  event.preventDefault()
                  const box = event.currentTarget.getBoundingClientRect()
                  openMenu(facet, box.left, box.bottom)
                  return
                }
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
                if (dragRef.current !== null && event.nativeEvent instanceof PointerEvent && event.nativeEvent.pointerType === 'touch') {
                  event.preventDefault()
                  return
                }
                if (!hasMenu(facet)) return
                event.preventDefault()
                /* A keyboard's menu key reports no pointer: open under the tab. */
                const box = event.currentTarget.getBoundingClientRect()
                const keyboard = event.clientX === 0 && event.clientY === 0
                openMenu(facet, keyboard ? box.left : event.clientX, keyboard ? box.bottom : event.clientY)
              }}
              style={{
                ...(lifted && drag !== null ? { transform: `translateX(${String(drag.x - drag.startX)}px)` } : {}),
                ...(movable ? { WebkitTouchCallout: 'none' } : {}),
              }}
              className={cn(
                'relative focus-visible:rounded-sm focus-visible:text-foreground',
                lifted && 'z-10 cursor-grabbing opacity-50 transition-none',
                lineBefore &&
                  (index === 0
                    ? 'before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-primary'
                    : 'before:absolute before:inset-y-1.5 before:-left-2 before:w-0.5 before:rounded-full before:bg-primary'),
                lineAfter &&
                  'after:absolute after:inset-y-1.5 after:-right-2 after:w-0.5 after:rounded-full after:bg-primary',
              )}
            >
              {facet.name}
            </Tab>
          )
        })}
      </TabList>
      {/* The "+" sits outside the scroller, so a narrow screen never clips it. */}
      {adding ? (
        <TabNameField
          initial=""
          label="New tab name"
          placeholder="Tab name"
          onDone={(name) => {
            setAdding(false)
            fieldOpening.current = false
            if (name !== null && name !== '') onAdd?.(name)
          }}
        />
      ) : showable.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="icon" className="shrink-0 text-muted-foreground" />}
            aria-label="Add tab"
            title="Add tab"
          >
            <Plus strokeWidth={1.75} aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-auto" finalFocus={() => !fieldOpening.current}>
            {plusItems}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : canAdd ? (
        <Button
          variant="ghost"
          size="icon"
          aria-label="Add tab"
          title="Add tab"
          onClick={startAdding}
          className="shrink-0 text-muted-foreground"
        >
          <Plus strokeWidth={1.75} aria-hidden="true" />
        </Button>
      ) : null}
      <DropdownMenu
        open={menu !== null}
        onOpenChange={(open) => {
          if (!open) setMenu(null)
        }}
      >
        {/* Where the right-click was: the menu opens at the pointer. */}
        <DropdownMenuTrigger
          nativeButton={false}
          render={<span aria-hidden="true" tabIndex={-1} />}
          style={{ position: 'fixed', left: menu?.x ?? 0, top: menu?.y ?? 0, width: 0, height: 0 }}
        />
        <DropdownMenuContent align="start" className="w-auto" finalFocus={finalFocus}>
          {target !== undefined && tabActs ? (
            <>
              {mayRename(target) ? (
                <DropdownMenuItem
                  onClick={() => {
                    fieldOpening.current = true
                    setRenamingId(target.id)
                  }}
                >
                  Rename
                </DropdownMenuItem>
              ) : null}
              {mayShare(target) ? (
                <DropdownMenuItem onClick={() => onShare?.(target)}>Share…</DropdownMenuItem>
              ) : null}
              {mayHide(target) ? (
                <DropdownMenuItem onClick={() => onHide?.(target, true)}>Hide</DropdownMenuItem>
              ) : null}
              {mayDelete(target) ? (
                <DropdownMenuItem variant="destructive" onClick={() => onDelete?.(target)}>
                  Delete
                </DropdownMenuItem>
              ) : null}
            </>
          ) : (
            /* Work can be neither renamed nor hidden: its menu is the "+"'s. */
            plusItems
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

/*
A tab's name being typed: the "+" making a tab, or a tab renamed in place.
Enter or leaving the field keeps it, Escape answers null (nothing changes).
It sits where the tab text sits, at the tab's size, underlined like the current tab.
*/
function TabNameField({
  initial,
  label,
  placeholder,
  onDone,
}: {
  readonly initial: string
  readonly label: string
  readonly placeholder?: string
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
      <input
        autoFocus
        value={value}
        aria-label={label}
        placeholder={placeholder}
        maxLength={120}
        size={Math.max(8, value.length + 1)}
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

/** A tab someone made (not a built-in), the kind that can be deleted. */
function isCustom(facet: Facet): boolean {
  return facet.private || facet.kind === 'work' || facet.kind.endsWith('_blank')
}

function isRenameable(facet: Facet): boolean {
  return isRenameableFacetKind(facet.kind) || facet.kind.endsWith('_blank')
}
