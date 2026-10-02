/*
A project's tabs (step 7): a row of plain text tabs and one "+". Work also
places its Filter and View controls on this row. Each tab is a page of the project (`tab_position` set), in stored order,
which is the drawn order: migration 0061 wrote the order the old facet row
drew. The project root is one of them, labelled by its kind ("Work", "Doc",
"Discussion"), since its own name is the project's and sits in the header.

**With one tab the tab itself is not drawn**. A Work page keeps the hairline
for its controls and "+"; other pages keep "+" in the header (`AddTabMenu`).

**The "+"** offers Doc and Work, and Discussion only while the project has
none (one per project; the server answers a second 409). Desk is the deliberate
exception: it is private Work plus documentation, so its "+" offers Doc only,
its Work root stays first, and any legacy Discussion tab is not drawn.

**A tab's own acts are on the tab**: right-click it (or Shift+F10 / the menu
key) for Rename and Delete. The root's tab has neither: its name is the
project's, and deleting it is deleting the project, which the header's "…"
does. Drag, or Alt+←/→, reorders. Arrow keys move between tabs. On Desk the
Work root is fixed and its Doc tabs keep those acts.

Every act is offered only to a viewer who may edit the project's pages
(`editable`, from `shared/folder-actions.ts`). Desk is the one-person default
project, so its Doc tabs remain editable even though the page historically
passed `editable=false` to keep the old facet row fixed.
*/
import { useEffect, useRef, useState } from 'react'

import type { Folder, PageKind } from '../../shared/folders.js'
import { DEFAULT_TAB_NAMES } from '../../shared/folders.js'
import { moved } from '../lib/use-sortable-list.js'
import { Plus } from '../lib/icons.js'
import { Button } from './ui/button.js'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu.js'
import { Tab, TabList } from './ui/tabs.js'
import { cn } from './ui/utils.js'
import { DiscussionTabName } from './consultation/DiscussionTabName.js'

type TabPage = Pick<Folder, 'id' | 'project_id' | 'kind' | 'name' | 'tab_position'> &
  Partial<Pick<Folder, 'is_default'>>

function isDeskRow(tabs: readonly TabPage[]): boolean {
  return tabs.some((tab) => tab.id === tab.project_id && tab.is_default === true)
}

/** What a tab says: the root's kind, any other tab's own name. */
export function tabLabel(tab: TabPage): string {
  if (tab.id === tab.project_id) return DEFAULT_TAB_NAMES[tab.kind ?? 'work']
  return tab.name
}

/** The kinds the "+" offers. Desk can add documentation only. */
export function addableKinds(tabs: readonly TabPage[]): PageKind[] {
  if (isDeskRow(tabs)) return ['doc']
  return tabs.some((tab) => tab.kind === 'discussion') ? ['doc', 'work'] : ['doc', 'work', 'discussion']
}

/** The "+": a small menu of the kinds a new tab can be. */
export function AddTabMenu({
  tabs,
  onAdd,
}: {
  readonly tabs: readonly TabPage[]
  readonly onAdd: (kind: PageKind) => void
}): React.JSX.Element {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon" className="shrink-0 text-muted-foreground" />}
        aria-label="Add tab"
        title="Add tab"
      >
        <Plus strokeWidth={1.75} aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-auto">
        {addableKinds(tabs).map((kind) => (
          <DropdownMenuItem key={kind} onClick={() => onAdd(kind)}>
            {DEFAULT_TAB_NAMES[kind]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
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
  /** The gap the tab would land in, 0..tabs.length. */
  readonly gap: number
}

/**
 * The tab row, or nothing when the project has one tab.
 *
 * Tabs are reordered by dragging them on the row itself, the way browser tabs
 * are: a mouse press that moves lifts the tab, a finger lifts it after a long
 * press; the lifted tab follows the pointer at reduced opacity and a thin
 * accent line marks the gap it will land in. Esc puts it back.
 */
export function FolderTabs<T extends TabPage>({
  tabs,
  activeId,
  onSelect,
  editable,
  onReorder,
  onAdd,
  onRename,
  onDelete,
  tools,
}: {
  /** The project's tabs, in order (`projectTabs`). */
  readonly tabs: readonly T[]
  readonly activeId: string
  readonly onSelect: (tab: T) => void
  /** The viewer may add, rename, delete and move tabs. */
  readonly editable: boolean
  /** The whole row in its new order, the moved tab named. */
  readonly onReorder: (dragged: T, ordered: readonly T[]) => void
  readonly onAdd: (kind: PageKind) => void
  readonly onRename: (tab: T, name: string) => void
  readonly onDelete: (tab: T) => void
  readonly tools?: React.ReactNode
}): React.JSX.Element | null {
  const desk = isDeskRow(tabs)
  const deskRoot = desk ? tabs.find((tab) => tab.id === tab.project_id) : undefined
  /* 0071 preserves old Discussion rows because deleting shared history would
     be data loss. The row simply has no Discussion surface in Desk. Keep the
     Work root first even while a pre-0071 client cache still carries its old
     position. */
  const rowTabs: readonly T[] = desk
    ? [
        ...(deskRoot === undefined ? [] : [deskRoot]),
        ...tabs.filter((tab) => tab.id !== deskRoot?.id && tab.kind !== 'discussion'),
      ]
    : tabs
  const rowEditable = editable || desk
  const mayMove = (tab: T): boolean => rowEditable && (!desk || tab.id !== deskRoot?.id)

  const [drag, setDrag] = useState<TabDrag | null>(null)
  const dragRef = useRef<TabDrag | null>(null)
  const rowRef = useRef<HTMLDivElement | null>(null)
  const pressTimer = useRef<number | null>(null)
  /* A drag's release is not also a click on the tab under it. */
  const swallowClick = useRef(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  /* Right-click's menu: the tab it is for, opened where the pointer was. */
  const [menu, setMenu] = useState<{ readonly tab: T; readonly x: number; readonly y: number } | null>(null)
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
    const drawn = Array.from(row.querySelectorAll<HTMLElement>('[role="tab"]'))
    const index = drawn.findIndex((tab) => {
      const box = tab.getBoundingClientRect()
      /* The lifted tab is measured where it stands, not where it is drawn. */
      const shift = tab.id === `page-tab-${held.id}` && held.lifted ? held.x - held.startX : 0
      return x < box.left - shift + box.width / 2
    })
    return index < 0 ? drawn.length : index
  }

  const reorderTo = (tab: T, gap: number): void => {
    if (!mayMove(tab)) return
    const from = rowTabs.findIndex((candidate) => candidate.id === tab.id)
    if (from < 0) return
    const landing = desk ? Math.max(1, gap) : gap
    const to = landing > from ? landing - 1 : landing
    if (to === from || to < 0 || to >= rowTabs.length) return
    onReorder(tab, moved(rowTabs, from, to))
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

  /* The current tab is never left scrolled out of a narrow row. The row is
     scrolled by hand: Chrome's scrollIntoView moves the Tab starting point to
     the tab, so a page's first Tab skipped the skip link and the sidebar. */
  useEffect(() => {
    const row = rowRef.current
    const tab = globalThis.document.getElementById(`page-tab-${activeId}`)
    if (row === null || tab === null) return
    const box = row.getBoundingClientRect()
    const at = tab.getBoundingClientRect()
    if (at.left < box.left) row.scrollLeft -= box.left - at.left
    else if (at.right > box.right) row.scrollLeft += at.right - box.right
  }, [activeId])

  /* One tab is not a choice. Work still needs its controls on the hairline. */
  if (rowTabs.length < 2) return tools === undefined ? null : (
    <div className="flex min-w-0 items-end justify-end gap-2 border-b border-border">
      {rowEditable && rowTabs.length === 1 ? <AddTabMenu tabs={rowTabs} onAdd={onAdd} /> : null}
      <div className="flex shrink-0 items-center border-l border-border pl-2 pb-0.5">{tools}</div>
    </div>
  )
  const active = rowTabs.find((tab) => tab.id === activeId)

  function moveFocus(tab: T, direction: -1 | 1): void {
    const index = rowTabs.findIndex((candidate) => candidate.id === tab.id)
    const next = rowTabs[(index + direction + rowTabs.length) % rowTabs.length]
    if (next === undefined) return
    onSelect(next)
    globalThis.requestAnimationFrame(() => {
      globalThis.document.getElementById(`page-tab-${next.id}`)?.focus()
    })
  }

  /* The root's tab is the project: no rename, no delete here. */
  const hasMenu = (tab: T): boolean => rowEditable && tab.id !== tab.project_id

  const openMenu = (tab: T, x: number, y: number): void => {
    menuFor.current = tab.id
    fieldOpening.current = false
    setMenu({ tab, x, y })
  }

  const finalFocus = (): HTMLElement | boolean => {
    if (fieldOpening.current) return false
    const doc = globalThis.document
    return (
      doc.getElementById(`page-tab-${menuFor.current ?? ''}`) ??
      doc.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]') ??
      true
    )
  }

  const target = menu?.tab

  return (
    /* The hairline is the row's, under the tabs and the "+" alike. */
    <div className="flex min-w-0 items-end gap-2 border-b border-border">
      <TabList
        ref={rowRef}
        label="Page tabs"
        /* Padded out and pulled back: the focus outline and the underline
           overhang the tabs, and a scroller clips whatever overhangs it. */
        className="-my-1 -ms-1 min-w-0 flex-[0_1_auto] border-b-0 py-1 ps-1 pe-3"
      >
        {rowTabs.map((tab, index) => {
          const current = tab.id === active?.id
          const lifted = drag?.lifted === true && drag.id === tab.id
          /* The accent line sits in the gap before this tab, or after the last. */
          const lineBefore = drag?.lifted === true && drag.gap === index
          const lineAfter = drag?.lifted === true && drag.gap === rowTabs.length && index === rowTabs.length - 1
          const label = tabLabel(tab)
          if (renamingId === tab.id) {
            return (
              <TabNameField
                key={tab.id}
                initial={tab.name}
                label={`Name of ${tab.name}`}
                onDone={(next) => {
                  setRenamingId(null)
                  /* Enter or Escape left focus nowhere: give it back to the tab. */
                  globalThis.requestAnimationFrame(() => {
                    const doc = globalThis.document
                    if (doc.activeElement === null || doc.activeElement === doc.body) {
                      doc.getElementById(`page-tab-${tab.id}`)?.focus({ preventScroll: true })
                    }
                  })
                  if (next === null || next === '' || next === tab.name) return
                  onRename(tab, next)
                }}
              />
            )
          }
          return (
            <Tab
              key={tab.id}
              id={`page-tab-${tab.id}`}
              selected={current}
              aria-label={label}
              aria-haspopup={hasMenu(tab) ? 'menu' : undefined}
              aria-keyshortcuts={mayMove(tab) ? 'Alt+ArrowLeft Alt+ArrowRight' : undefined}
              onClick={() => {
                if (swallowClick.current) {
                  swallowClick.current = false
                  return
                }
                onSelect(tab)
              }}
              onKeyDown={(event) => {
                if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
                  if (!hasMenu(tab)) return
                  event.preventDefault()
                  const box = event.currentTarget.getBoundingClientRect()
                  openMenu(tab, box.left, box.bottom)
                  return
                }
                if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
                event.preventDefault()
                const direction = event.key === 'ArrowLeft' ? -1 : 1
                if (event.altKey) {
                  if (!mayMove(tab)) return
                  /* Alt+←/→ moves the tab one place and keeps it focused. */
                  reorderTo(tab, direction < 0 ? index - 1 : index + 2)
                  globalThis.requestAnimationFrame(() => {
                    globalThis.document.getElementById(`page-tab-${tab.id}`)?.focus()
                  })
                  return
                }
                moveFocus(tab, direction)
              }}
              onPointerDown={(event) => {
                if (!mayMove(tab) || event.button !== 0) return
                put({ id: tab.id, pointerId: event.pointerId, startX: event.clientX, x: event.clientX, lifted: false, gap: index })
                if (event.pointerType === 'touch') {
                  const element = event.currentTarget
                  clearTimer()
                  pressTimer.current = globalThis.setTimeout(() => {
                    const held = dragRef.current
                    if (held === null || held.id !== tab.id) return
                    try {
                      element.setPointerCapture(held.pointerId)
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
                reorderTo(tab, held.gap)
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
                if (!hasMenu(tab)) return
                event.preventDefault()
                /* A keyboard's menu key reports no pointer: open under the tab. */
                const box = event.currentTarget.getBoundingClientRect()
                const keyboard = event.clientX === 0 && event.clientY === 0
                openMenu(tab, keyboard ? box.left : event.clientX, keyboard ? box.bottom : event.clientY)
              }}
              style={{
                ...(lifted && drag !== null ? { transform: `translateX(${String(drag.x - drag.startX)}px)` } : {}),
                ...(mayMove(tab) ? { WebkitTouchCallout: 'none' } : {}),
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
              {tab.kind === 'discussion' ? <DiscussionTabName folderId={tab.id} name={label} /> : label}
            </Tab>
          )
        })}
      </TabList>
      {/* The "+" sits outside the scroller, so a narrow screen never clips it. */}
      {rowEditable ? <AddTabMenu tabs={rowTabs} onAdd={onAdd} /> : null}
      <div className="min-w-0 flex-1" aria-hidden="true" />
      {tools === undefined ? null : (
        <div className="flex shrink-0 items-center border-l border-border pl-2 pb-0.5">{tools}</div>
      )}
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
          {target !== undefined ? (
            <>
              <DropdownMenuItem
                onClick={() => {
                  fieldOpening.current = true
                  setRenamingId(target.id)
                }}
              >
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onClick={() => onDelete(target)}>
                Delete
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

/*
A tab's name being typed, in place. Enter or leaving the field keeps it,
Escape answers null (nothing changes). It sits where the tab text sits, at the
tab's size, underlined like the current tab.
*/
function TabNameField({
  initial,
  label,
  onDone,
}: {
  readonly initial: string
  readonly label: string
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
        maxLength={100}
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
