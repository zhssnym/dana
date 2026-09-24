/*
One folder in the sidebar's Library: its mark and its name, and nothing else.

**It is a link.** `href` is required; `render` lets the shell hand it the
router's own link element.

**The mark is the folder's own**, icon and colour resolved once by
`parts/presenters.ts`, so the row and a task's folder chip agree.

**One menu, two ways in.** The "…" appears on hover in space the row always
reserves, so the name never shifts; a right-click presses that same button.
The acts are the object contract's (`lib/object-acts.ts`), drawn by
`object-menu.tsx`; an act with no handler is not drawn, which is how the role
split of 9.6 reaches this row without a branch. What stays here is the shelf
picker's contents, which belong to the surface.

**A page in a tree** (wave 2): `depth` indents it under its parent, and a page
with children carries a fold. The fold is its mark turned into a chevron under
the pointer, in the same box, the way a collection heading folds, so nothing
shifts. The one other control is the "+" beside the "…", which adds a page
inside this one. It is mounted only while the row is under the pointer or holds
focus, in space the row always reserves, so it is not one more control on every
row and nothing shifts when it appears; a touch screen has no hover, so there
the same act is an item in the "…". `children` is the page's own rows,
drawn inside its item so that carrying a page carries its subtree.
*/
import { useEffect, useRef, useState } from 'react'
import type { ReactElement, ReactNode } from 'react'

import { ChevronRight, Folder, FolderPlus, Plus } from '../lib/icons.js'
import type { LucideIcon } from '../lib/icons.js'
import type { ActHandlers } from '../lib/object-acts.js'
import { ObjectMenu } from './object-menu.js'
import { Button } from './ui/button.js'
import { Input } from './ui/input.js'
import { MORE_ACTIONS } from './ui/copy.js'
import { SidebarMenuButton, SidebarMenuItem } from './ui/sidebar.js'
import { cn } from './ui/utils.js'
import { DWELL_MS } from '../lib/use-sortable-list.js'
import type { SortableItemState } from '../lib/use-sortable-list.js'

export interface FolderRowProps {
  name: string
  color: string
  /** The folder's chosen glyph (4.3); the plain folder when unset. */
  icon?: LucideIcon
  /** A word appended to the accessible name and never drawn. */
  qualifier?: string
  /** 9.1's routes table: `/app/folders/:id`. */
  href: string
  /** The element the row renders as; it must produce an anchor carrying `href`. */
  render?: ReactElement<Record<string, unknown>>
  active?: boolean
  /** Inside a shelf: indented under its heading. */
  nested?: boolean
  /* The drag engine's four props; absent for a row nobody is sorting. */
  itemRef?: (element: HTMLLIElement | null) => void
  rowProps?: React.ComponentProps<'li'>
  dragState?: SortableItemState
  /** What a release would do, said on the carried row only. */
  proposal?: string | null
  onSelect?: () => void
  /* The folder menu's acts, `lib/object-acts.ts`'s one folder list: the same
     handlers the folder page's header "…" passes. An act with no handler is
     not drawn. */
  acts?: ActHandlers
  /** The page's id, marking the row for the tree's drop hit test. */
  pageId?: string
  /** How deep in the page tree: 0 for a root. */
  depth?: number
  /** Present on a page with children: whether they show, and the fold. */
  fold?: { readonly open: boolean; readonly onToggle: () => void }
  /** Adds a page inside this one; absent where the viewer may not. */
  onAddInside?: () => void
  /** What a drop here would do, drawn while a page is carried over this row. */
  dropMark?: 'inside' | 'before' | 'after' | 'first-child' | null
  /** Carried along under a page that is being dragged. */
  dimmed?: boolean
  /** The page's own rows, drawn inside its item. */
  children?: ReactNode
  /** Renaming in place: the row is a field. `onRename(null)` cancels. */
  renaming?: boolean
  onRename?: (name: string | null) => void
}

/* The row as a name field: Enter or leaving commits, Escape cancels. */
function RenameField({
  name,
  onRename,
}: {
  readonly name: string
  readonly onRename: (name: string | null) => void
}): React.JSX.Element {
  const done = useRef(false)
  const finish = (next: string | null): void => {
    if (done.current) return
    done.current = true
    const clean = next?.replace(/\s+/g, ' ').trim() ?? ''
    onRename(clean === '' || clean === name ? null : clean)
  }
  return (
    <Input
      bare
      data-no-drag
      aria-label="Page name"
      defaultValue={name}
      maxLength={100}
      autoFocus
      onFocus={(event) => {
        event.currentTarget.select()
      }}
      onBlur={(event) => {
        finish(event.currentTarget.value)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
          event.preventDefault()
          finish(event.currentTarget.value)
        } else if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          finish(null)
        }
      }}
      className="min-w-0 flex-1"
    />
  )
}

/* A device with no hover (touch): read once, as the row mounts. */
function noHover(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(hover: none)').matches
}

/* A row's indent in spacing steps: the row's own padding, or a collection's
   step, then four steps per level of the tree. */
function indentOf(nested: boolean, depth: number): string {
  const steps = (nested ? 7 : 2) + depth * 4
  return `calc(var(--spacing) * ${String(steps)})`
}

/* The name shows as a tooltip only when the row cuts it short. */
function titleIfTruncated(name: string) {
  return (event: React.PointerEvent<HTMLElement>): void => {
    const label = event.currentTarget.querySelector('span.truncate')
    const cut = label !== null && label.scrollWidth > label.clientWidth
    if (cut) event.currentTarget.title = name
    else event.currentTarget.removeAttribute('title')
  }
}

export function FolderRow({
  name,
  color,
  icon: Mark = Folder,
  qualifier,
  href,
  render,
  active = false,
  nested = false,
  itemRef,
  rowProps,
  dragState,
  proposal = null,
  onSelect,
  acts = {},
  pageId,
  depth = 0,
  fold,
  onAddInside,
  dropMark = null,
  dimmed = false,
  children,
  renaming = false,
  onRename,
}: FolderRowProps) {
  const [touch] = useState(noHover)
  /* Under the pointer or holding focus: when the "+" is drawn. */
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const near = hovered || focused
  const addInMenu = touch && onAddInside !== undefined
  const addButton = !touch && onAddInside !== undefined
  const menuActs: ActHandlers = addInMenu ? { ...acts, 'add-page': onAddInside } : acts
  const hasActions = Object.values(menuActs).some((act) => act !== undefined)
  const menuTrigger = useRef<HTMLButtonElement>(null)
  /*
  The carried row follows the pointer with no easing (any easing reads as lag);
  the rows it passes ease into the space they make.
  */
  const offset = dragState?.offset ?? 0
  const dragStyle: React.CSSProperties | undefined =
    dragState === undefined || (offset === 0 && !dragState.isActive)
      ? undefined
      : {
          /* The carried row sits one inline step right and down of the
             pointer, so the row it is over stays readable. */
          transform: dragState.isActive && !dragState.isSettling
            ? `translate(var(--space-inline), calc(${String(offset)}px + var(--space-inline)))`
            : `translateY(${String(offset)}px)`,
          transition:
            dragState.isActive && !dragState.isSettling
              ? 'none'
              : 'transform 150ms cubic-bezier(0.2, 0, 0, 1)',
          zIndex: dragState.isActive ? 30 : undefined,
          position: dragState.isActive ? 'relative' : undefined,
          /* The carried row must not catch the point it follows: the
             Library's containerAt asks the document what is under it. */
          pointerEvents: dragState.isActive ? 'none' : undefined,
        }

  return (
    <SidebarMenuItem
      ref={itemRef}
      {...rowProps}
      style={{ ...dragStyle, ...rowProps?.style }}
      data-dragging={dragState?.isActive ? 'true' : undefined}
      onContextMenu={
        hasActions
          ? (event) => {
              event.preventDefault()
              /* A sub-page's row sits inside its parent's item: one menu opens. */
              event.stopPropagation()
              menuTrigger.current?.click()
            }
          : undefined
      }
      className={cn(
        'rounded-md',
        dragState?.isActive && 'cursor-grabbing bg-sidebar',
        rowProps?.className,
      )}
    >
      <div
        data-page-row={pageId}
        onPointerEnter={addButton ? () => setHovered(true) : undefined}
        onPointerLeave={addButton ? () => setHovered(false) : undefined}
        onFocus={addButton ? () => setFocused(true) : undefined}
        onBlur={
          addButton
            ? (event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false)
              }
            : undefined
        }
        className={cn(
          'group/folder-row relative rounded-md',
          dimmed && 'opacity-50',
          dropMark === 'inside' && 'bg-sidebar-accent ring-1 ring-ring/40',
        )}
      >
        {renaming && onRename !== undefined ? (
          <div
            style={{ paddingLeft: indentOf(nested, depth) }}
            className="my-(--sidebar-row-gap) flex h-(--shell-sidebar-row-height) items-center gap-2 rounded-md bg-sidebar-accent pr-2 max-md:h-(--row-height)"
          >
            <Mark className="size-4 shrink-0" style={{ color }} strokeWidth={1.75} aria-hidden="true" />
            <RenameField name={name} onRename={onRename} />
          </div>
        ) : (
        <SidebarMenuButton
          render={render ?? <a href={href} />}
          isActive={active}
          aria-current={active ? 'page' : undefined}
          onPointerEnter={titleIfTruncated(name)}
          onClick={onSelect}
          style={{ paddingLeft: indentOf(nested, depth) }}
          className={cn(
            'my-(--sidebar-row-gap) h-(--shell-sidebar-row-height) gap-2 rounded-md px-2 text-sm font-normal max-md:h-(--row-height) text-muted-foreground hover:bg-(--sidebar-row-hover) hover:text-foreground group-hover/folder-row:bg-(--sidebar-row-hover) data-active:bg-sidebar-accent data-active:hover:bg-sidebar-accent data-active:font-normal data-active:text-foreground',
            hasActions && addButton
              ? 'pr-14'
              : (hasActions || addButton) && 'pr-8',
          )}
        >
          <Mark
            className={cn(
              '!size-4 shrink-0',
              fold !== undefined &&
                'transition-opacity duration-150 group-hover/folder-row:opacity-0 [@media(hover:none)]:opacity-0',
            )}
            style={{ color }}
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <span className="min-w-0 flex-1 truncate">
            {name}
            {qualifier === undefined ? null : <span className="sr-only">{` ${qualifier}`}</span>}
          </span>
        </SidebarMenuButton>
        )}

        {fold === undefined || renaming ? null : (
          /* Over the mark, in the same box, so nothing shifts when it shows. */
          <button
            type="button"
            data-fold
            data-no-drag
            aria-expanded={fold.open}
            aria-label={fold.open ? `Hide the pages in ${name}` : `Show the pages in ${name}`}
            onClick={fold.onToggle}
            style={{ left: `calc(${indentOf(nested, depth)} - var(--spacing))` }}
            className="absolute top-1/2 z-20 flex size-6 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground opacity-0 outline-none group-hover/folder-row:opacity-100 hover:text-foreground focus-visible:bg-sidebar-accent focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
          >
            <ChevronRight
              className={cn('size-4 transition-transform duration-150', fold.open && 'rotate-90')}
              strokeWidth={1.75}
              aria-hidden="true"
            />
          </button>
        )}

        {(hasActions || addButton) && !renaming ? (
          /* Opacity and never a collapsed box: a control with an empty box
             cannot be addressed. `data-no-drag`: a press here is not the grip. */
          <div
            data-no-drag
            className="absolute top-1/2 right-1 z-20 flex -translate-y-1/2 items-center opacity-0 transition-opacity duration-150 group-focus-within/folder-row:opacity-100 group-hover/folder-row:opacity-100 has-data-popup-open:opacity-100 [@media(hover:none)]:opacity-100"
          >
            {/* "+" left of "…", so "…" keeps the rightmost slot on every row. */}
            {addButton && near ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={(event) => {
                  /* The press is spent: focus must not stay here, where Enter
                     or Space would add another page. The new page's name
                     field takes it. */
                  event.currentTarget.blur()
                  onAddInside()
                }}
                className="size-6 rounded-sm text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
                aria-label="Add a page inside"
                title="Add a page inside"
              >
                <Plus className="size-4" strokeWidth={1.75} aria-hidden="true" />
              </Button>
            ) : null}
            {hasActions ? (
              <ObjectMenu
                kind="folder"
                name={name}
                align="start"
                trigger={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    ref={menuTrigger}
                    className="size-6 rounded-sm text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
                    aria-label={MORE_ACTIONS}
                  />
                }
                handlers={menuActs}
              />
            ) : null}
          </div>
        ) : null}

        {dropMark === 'before' || dropMark === 'after' || dropMark === 'first-child' ? (
          /* Where the page would land: a line at the depth it would take. */
          <span
            aria-hidden="true"
            className={cn(
              'pointer-events-none absolute right-2 z-20 h-0.5 rounded-full bg-primary',
              dropMark === 'before' ? '-top-px' : '-bottom-px',
            )}
            style={{
              left: indentOf(nested, dropMark === 'first-child' ? depth + 1 : depth),
            }}
          />
        ) : null}

        {proposal === null ? null : (
          <Proposal
            text={proposal}
            holding={dragState?.isDwelling ?? false}
            armed={dragState?.isArmed ?? false}
          />
        )}
      </div>
      {children}
    </SidebarMenuItem>
  )
}

/* What a release would do, in words, on the carried row, with the closing ring
   that says how long a hold takes. */
function Proposal({
  text,
  holding,
  armed,
}: {
  readonly text: string
  readonly holding: boolean
  readonly armed: boolean
}): React.JSX.Element {
  return (
    <span
      className={cn(
        'pointer-events-none absolute top-1/2 right-2 z-20 flex max-w-[70%] -translate-y-1/2 items-center gap-1 rounded-sm py-0.5 pr-2 pl-1 text-xs shadow-md',
        armed ? 'bg-primary text-primary-foreground' : 'bg-popover text-foreground ring-1 ring-border',
      )}
    >
      <span className="relative flex size-4 shrink-0 items-center justify-center">
        {holding ? <DwellRing /> : null}
        <FolderPlus
          className={cn('size-3', armed ? 'text-primary-foreground' : 'text-primary')}
          strokeWidth={2}
          aria-hidden="true"
        />
      </span>
      <span className="truncate">{text}</span>
    </span>
  )
}

/* Mounted only while a hold runs, so the ring always starts from empty. */
function DwellRing(): React.JSX.Element {
  const [grown, setGrown] = useState(false)
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setGrown(true)
    })
    return () => {
      cancelAnimationFrame(frame)
    }
  }, [])

  const radius = 7
  const circumference = 2 * Math.PI * radius

  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="absolute inset-0 size-4 -rotate-90">
      <circle cx="8" cy="8" r={radius} fill="none" strokeWidth="1.5" className="stroke-border" />
      <circle
        cx="8"
        cy="8"
        r={radius}
        fill="none"
        strokeWidth="1.5"
        strokeLinecap="round"
        className="stroke-primary"
        style={{
          strokeDasharray: circumference,
          strokeDashoffset: grown ? 0 : circumference,
          transition: `stroke-dashoffset ${String(DWELL_MS)}ms linear`,
        }}
      />
    </svg>
  )
}
