// One page in the sidebar Library: a link with its mark and name, a "…" menu
// (also on right-click), and for a tree a fold and a "+" that adds a page inside.
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
  icon?: LucideIcon
  /** Appended to the accessible name, never drawn. */
  qualifier?: string
  href: string
  /** Must render an anchor carrying `href`. */
  render?: ReactElement<Record<string, unknown>>
  active?: boolean
  nested?: boolean
  // The drag engine's props; absent for a row nobody is sorting.
  itemRef?: (element: HTMLLIElement | null) => void
  rowProps?: React.ComponentProps<'li'>
  dragState?: SortableItemState
  /** What a release would do, shown on the carried row only. */
  proposal?: string | null
  onSelect?: () => void
  // Folder menu acts from `lib/object-acts.ts`; an act with no handler is not drawn.
  acts?: ActHandlers
  menuKind?: 'project' | 'folder'
  /** Marks the row for the tree's drop hit test. */
  pageId?: string
  depth?: number
  fold?: { readonly open: boolean; readonly onToggle: () => void }
  /** Absent where the viewer may not add. */
  onAddInside?: () => void
  dropMark?: 'inside' | 'before' | 'after' | 'first-child' | null
  /** Carried along under a page being dragged. */
  dimmed?: boolean
  /** Drawn inside this item, so carrying a page carries its subtree. */
  children?: ReactNode
  /** `onRename(null)` cancels. */
  renaming?: boolean
  onRename?: (name: string | null) => void
}

// Enter or blur commits, Escape cancels.
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

// Read once, as the row mounts.
function noHover(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(hover: none)').matches
}

function indentOf(nested: boolean, depth: number): string {
  const steps = (nested ? 7 : 2) + depth * 4
  return `calc(var(--spacing) * ${String(steps)})`
}

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
  menuKind = 'folder',
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
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const near = hovered || focused
  const addInMenu = touch && onAddInside !== undefined
  const addButton = !touch && onAddInside !== undefined
  const menuActs: ActHandlers = addInMenu ? { ...acts, 'add-page': onAddInside } : acts
  const hasActions = Object.values(menuActs).some((act) => act !== undefined)
  const menuTrigger = useRef<HTMLButtonElement>(null)
  // The carried row follows the pointer with no easing; easing reads as lag.
  const offset = dragState?.offset ?? 0
  const dragStyle: React.CSSProperties | undefined =
    dragState === undefined || (offset === 0 && !dragState.isActive)
      ? undefined
      : {
          // Offset from the pointer so the row underneath stays readable.
          transform: dragState.isActive && !dragState.isSettling
            ? `translate(var(--space-inline), calc(${String(offset)}px + var(--space-inline)))`
            : `translateY(${String(offset)}px)`,
          transition:
            dragState.isActive && !dragState.isSettling
              ? 'none'
              : 'transform 150ms cubic-bezier(0.2, 0, 0, 1)',
          zIndex: dragState.isActive ? 30 : undefined,
          position: dragState.isActive ? 'relative' : undefined,
          // The carried row must not catch the point it follows: the Library's containerAt
          // asks the document what is under it.
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
              // A sub-page's row sits inside its parent's item, so stop here to open one menu.
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
          // Over the mark, in the same box, so nothing shifts when it shows.
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
          // Opacity, never a collapsed box: an empty box cannot be addressed.
          // `data-no-drag`: a press here is not the grip.
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
                  // Drop focus so Enter or Space cannot add another page; the new name field takes it.
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
                kind={menuKind}
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

// Mounted only while a hold runs, so the ring always starts from empty.
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
