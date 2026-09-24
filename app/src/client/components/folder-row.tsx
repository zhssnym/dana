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
*/
import { useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'

import { Folder, FolderPlus, Folders } from '../lib/icons.js'
import type { LucideIcon } from '../lib/icons.js'
import { ObjectMenu } from './object-menu.js'
import { Button } from './ui/button.js'
import { MORE_ACTIONS } from './ui/copy.js'
import {
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
} from './ui/dropdown-menu.js'
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
  groupLabels?: readonly string[]
  currentLabel?: string | null
  /* The drag engine's four props; absent for a row nobody is sorting. */
  itemRef?: (element: HTMLLIElement | null) => void
  rowProps?: React.ComponentProps<'li'>
  dragState?: SortableItemState
  /** What a release would do, said on the carried row only. */
  proposal?: string | null
  onSelect?: () => void
  /** "New shelf…" inside the move picker: an act on this folder's shelf. */
  onNewGroup?: () => void
  /* The contract's acts. Each is optional and an act with no handler is not
     drawn. */
  onOpenInNewTab?: () => void
  onHistory?: () => void
  onMoveToLabel?: (label: string | null) => void
  onRename?: () => void
  onCopyLink?: () => void
  onDuplicate?: () => void
  onSaveAsWorkflow?: () => void
  onLeave?: () => void
  onDelete?: () => void
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
  groupLabels = [],
  currentLabel = null,
  itemRef,
  rowProps,
  dragState,
  proposal = null,
  onSelect,
  onNewGroup,
  onOpenInNewTab,
  onHistory,
  onMoveToLabel,
  onRename,
  onCopyLink,
  onDuplicate,
  onSaveAsWorkflow,
  onLeave,
  onDelete,
}: FolderRowProps) {
  const hasActions = Boolean(
    onNewGroup ??
      onOpenInNewTab ??
      onHistory ??
      onMoveToLabel ??
      onRename ??
      onCopyLink ??
      onDuplicate ??
      onSaveAsWorkflow ??
      onLeave ??
      onDelete,
  )
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
          transform: `translateY(${String(offset)}px)`,
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
              menuTrigger.current?.click()
            }
          : undefined
      }
      className={cn(
        'group/folder-row rounded-md',
        dragState?.isActive && 'cursor-grabbing bg-popover shadow-md ring-1 ring-border',
        dragState?.isDwelling && 'bg-sidebar-accent ring-1 ring-ring/30',
        dragState?.isArmed && 'bg-sidebar-accent ring-2 ring-ring',
        rowProps?.className,
      )}
    >
      <SidebarMenuButton
        render={render ?? <a href={href} />}
        data-sidebar-tier="folder"
        isActive={active}
        aria-current={active ? 'page' : undefined}
        title={name}
        onClick={onSelect}
        className={cn(
          'h-8 gap-2 rounded-md px-2 text-sm font-normal text-muted-foreground hover:bg-sidebar-accent hover:text-foreground group-hover/folder-row:bg-sidebar-accent data-active:bg-sidebar-accent data-active:font-medium data-active:text-foreground',
          nested && 'pl-7',
          hasActions && 'pr-8',
        )}
      >
        <Mark className="!size-4 shrink-0" style={{ color }} strokeWidth={1.75} aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">
          {name}
          {qualifier === undefined ? null : <span className="sr-only">{` ${qualifier}`}</span>}
        </span>
      </SidebarMenuButton>

      {hasActions ? (
        /* Opacity and never a collapsed box: a control with an empty box
           cannot be addressed. `data-no-drag`: a press here is not the grip. */
        <div
          data-no-drag
          className="absolute top-1/2 right-1 z-20 flex -translate-y-1/2 items-center opacity-0 transition-opacity duration-150 group-focus-within/folder-row:opacity-100 group-hover/folder-row:opacity-100 has-data-popup-open:opacity-100 [@media(hover:none)]:opacity-100"
        >
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
            handlers={{
              open: onOpenInNewTab,
              history: onHistory,
              rename: onRename,
              'copy-link': onCopyLink,
              duplicate: onDuplicate,
              workflow: onSaveAsWorkflow,
              leave: onLeave,
              delete: onDelete,
              move:
                onMoveToLabel === undefined
                  ? undefined
                  : {
                      choose: (
                        <DropdownMenuRadioGroup
                          value={currentLabel ?? '__none'}
                          onValueChange={(value) => {
                            onMoveToLabel(value === '__none' ? null : value)
                          }}
                        >
                          {groupLabels.map((label) => (
                            <DropdownMenuRadioItem key={label} value={label} closeOnClick>
                              {label}
                            </DropdownMenuRadioItem>
                          ))}
                          <DropdownMenuSeparator />
                          <DropdownMenuRadioItem value="__none" closeOnClick>
                            Not on a shelf
                          </DropdownMenuRadioItem>
                          {onNewGroup === undefined ? null : (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={onNewGroup}>
                                <Folders className="size-4" aria-hidden="true" />
                                New shelf…
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuRadioGroup>
                      ),
                    },
            }}
          />
        </div>
      ) : null}

      {proposal === null ? null : (
        <Proposal
          text={proposal}
          holding={dragState?.isDwelling ?? false}
          armed={dragState?.isArmed ?? false}
        />
      )}
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
