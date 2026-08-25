/*
The tab strip of 9.1: a row of tabs above the window bar.

**Roles come from 9.1's table**: a tab in the strip is a tab, current when
active, which means a `tablist` holding `tab`s with `aria-selected`. That is
what AC-216 addresses and it is not decoration: a strip built from buttons
tells a screen reader there are six buttons, where this one says there are six
tabs and which is current.

**The close control is named "Close tab" exactly.** The prototype interpolates
the title into it, and the correction is the one `components/README.md`
records against four other controls: a name in 9.1's table is a fixed string,
and a control that appears once per tab is separated from its siblings by the
region it sits in, which is the tab its title names, never by folding that
title into the control's own name. The names table says so in the same words:
"Close tab", addressed within the tab its title names.

**The plus is named "New tab"**, also from that table, and it offers what the
section says it offers: any shelf or folder as a tab. New folder, New shelf
and Import are the acts it also lists; they arrive with the surfaces that make
them, and this menu grows those entries rather than a second control.

**The drag is a pointer drag and not a keyboard reorder.** 9.1 says tabs are
"reorderable by drag", so this listens to pointer events and commits an index
move when the pointer is released over another tab. A threshold of a few
pixels separates a drag from a click, because a strip where a slightly shaky
click reorders the row is worse than one that cannot reorder at all.
*/
import { useRef, useState } from 'react'

import { Button } from '../components/ui/button.js'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu.js'
import { Folder as FolderIcon, Plus, X } from '../lib/icons.js'
import type { LucideIcon } from '../lib/icons.js'

import { closeTab, openInNewTab, reorderTabs, selectTab, useTabs } from './tabs.js'
import type { Folder } from '../../shared/folders.js'

/** 9.1's names table, transcribed. */
const NEW_TAB = 'New tab'
const CLOSE_TAB = 'Close tab'

/** How far a pointer must travel before a press becomes a drag. */
const DRAG_THRESHOLD_PX = 4

export interface TabFace {
  readonly title: string
  readonly icon: LucideIcon | undefined
  readonly iconColor: string | undefined
}

export function TabStrip({
  face,
  folders,
  onNavigate,
}: {
  /** What a path looks like as a tab, which the shell already computes. */
  readonly face: (path: string) => TabFace
  readonly folders: readonly Folder[]
  readonly onNavigate: (path: string) => void
}): React.JSX.Element {
  const { tabs, activeId } = useTabs()
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null)
  const origin = useRef<{ x: number; index: number } | null>(null)

  function onPointerDown(event: React.PointerEvent, index: number): void {
    // Only the primary button starts a drag; a middle click is a close on
    // every strip a person has used and is not this package's to invent.
    if (event.button !== 0) return
    origin.current = { x: event.clientX, index }
  }

  function onPointerMove(event: React.PointerEvent): void {
    const start = origin.current
    if (start === null) return
    if (draggingIndex === null && Math.abs(event.clientX - start.x) >= DRAG_THRESHOLD_PX) {
      setDraggingIndex(start.index)
    }
  }

  function onPointerUp(event: React.PointerEvent, index: number): void {
    const start = origin.current
    origin.current = null
    if (draggingIndex === null) return
    setDraggingIndex(null)
    // The tab under the pointer at release is where it lands, which is what
    // makes dropping on a neighbour move by one rather than by the distance
    // travelled.
    void event
    if (start !== null && start.index !== index) reorderTabs(start.index, index)
  }

  return (
    <div className="flex min-h-[var(--shell-pagebar-height)] items-end gap-1 px-2">
      <div
        role="tablist"
        aria-label="Open tabs"
        className="flex min-w-0 flex-1 items-end gap-1 overflow-x-auto"
        onPointerMove={onPointerMove}
        onPointerLeave={() => {
          origin.current = null
          setDraggingIndex(null)
        }}
      >
        {tabs.map((tab, index) => {
          const { title, icon: Icon, iconColor } = face(tab.path)
          const active = tab.id === activeId
          return (
            <div
              key={tab.id}
              role="tab"
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              onPointerDown={(event) => onPointerDown(event, index)}
              onPointerUp={(event) => onPointerUp(event, index)}
              onClick={() => onNavigate(selectTab(tab.id))}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return
                event.preventDefault()
                onNavigate(selectTab(tab.id))
              }}
              className={`flex h-7 min-w-0 max-w-56 shrink-0 cursor-pointer items-center gap-1.5 rounded-t-md px-2 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring/30 ${
                active
                  ? 'bg-card font-medium text-foreground'
                  : 'text-muted-foreground hover:bg-[var(--color-graphite-100)]'
              } ${draggingIndex === index ? 'opacity-60' : ''}`}
            >
              {Icon === undefined ? null : (
                <Icon
                  className="size-3.5 shrink-0"
                  strokeWidth={1.75}
                  style={iconColor === undefined ? undefined : { color: iconColor }}
                  aria-hidden="true"
                />
              )}
              <span className="truncate">{title}</span>
              <button
                type="button"
                aria-label={CLOSE_TAB}
                title={CLOSE_TAB}
                className="ml-0.5 grid size-4 shrink-0 place-items-center rounded text-muted-foreground hover:bg-[var(--color-graphite-200)] hover:text-foreground"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation()
                  const to = closeTab(tab.id)
                  if (to !== null) onNavigate(to)
                }}
              >
                <X className="size-3" strokeWidth={1.75} aria-hidden="true" />
              </button>
            </div>
          )
        })}
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={NEW_TAB}
              title={NEW_TAB}
              className="mb-0.5 size-6 shrink-0"
            />
          }
        >
          <Plus className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {folders.map((folder) => (
            <DropdownMenuItem
              key={folder.id}
              onClick={() => onNavigate(openInNewTab(`/app/folders/${folder.id}`))}
            >
              <FolderIcon
                className="size-4"
                strokeWidth={1.75}
                style={{ color: folder.my_color ?? undefined }}
                aria-hidden="true"
              />
              {folder.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
