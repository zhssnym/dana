/*
The sidebar's Focus group (round 8): a heading styled as Library's, a "+"
that adds a list, and the viewer's lists in their own order. Drag a row to
reorder it; its "…" hides a default (Today, Upcoming, Assigned) or removes an
added list. Either one comes back from the "+". Assigned is neither drawn nor
offered to a viewer with no page shared with anyone (M4, `focusRows`).
*/
import { useRef } from 'react'

import { useBundle, useMultiMemberFolderIds } from '../api/queries.js'
import { Button } from '../components/ui/button.js'
import { MORE_ACTIONS } from '../components/ui/copy.js'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu.js'
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '../components/ui/sidebar.js'
import { cn } from '../components/ui/utils.js'
import { EyeOff, MoreHorizontal, Plus, Trash2 } from '../lib/icons.js'
import { moved, swallowNextClick, useSortableList } from '../lib/use-sortable-list.js'
import type { SortableItemState } from '../lib/use-sortable-list.js'
import { focusMark, focusOffers, focusRows } from './focus-lists.js'
import type { FocusList, FocusListKey, FocusMark } from './focus-lists.js'
import { grip } from './library-drag.js'

const ROW =
  'my-(--sidebar-row-gap) h-(--shell-sidebar-row-height) max-md:h-(--row-height) gap-2 rounded-md px-2 pr-8 text-sm font-normal text-muted-foreground hover:bg-(--sidebar-row-hover) hover:text-foreground group-hover/focus-row:bg-(--sidebar-row-hover) data-active:bg-sidebar-accent data-active:hover:bg-sidebar-accent data-active:font-normal data-active:text-foreground [&_svg]:!size-4 [&_svg]:shrink-0'

const ICON_BUTTON =
  'size-6 shrink-0 rounded-sm text-muted-foreground hover:bg-sidebar-accent hover:text-foreground'

export function FocusGroup({
  lists,
  onChange,
  currentPath,
  link,
}: {
  readonly lists: readonly FocusListKey[]
  readonly onChange: (next: readonly FocusListKey[]) => void
  readonly currentPath: string
  /** The router link a row renders as (the sidebar's `routerLink`). */
  readonly link: (to: string) => React.ReactElement
}): React.JSX.Element {
  const appearance = useBundle().data?.focus_appearance
  const shared = useMultiMemberFolderIds().size > 0
  const shown = focusRows(lists, shared)
  /* A solo viewer's stored Assigned stays stored, only undrawn, so a reorder
     or removal among the drawn rows carries it along unchanged. */
  const hidden = lists.filter((key) => !shown.some((list) => list.key === key))
  const offers = focusOffers(lists).filter((offer) => shared || offer.key !== 'assignments')
  const sortable = useSortableList({
    count: shown.length,
    onLift: swallowNextClick,
    describe: (index) => shown[index]?.name ?? 'List',
    onReorder: (from, to) => {
      onChange([...moved(shown.map((list) => list.key), from, to), ...hidden])
    },
  })
  return (
    /* The sidebar's first group: it starts at the top, with no gap above it. */
    <SidebarGroup className="px-2 pt-0 pb-0">
      <div className="flex h-(--shell-sidebar-row-height) items-center pr-1 pl-2">
        <h2 className="min-w-0 flex-1 truncate text-xs font-medium text-muted-foreground">Focus</h2>
        {offers.length === 0 ? null : (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={ICON_BUTTON}
                  aria-label="Add a list"
                  title="Add a list"
                />
              }
            >
              <Plus className="size-4" strokeWidth={1.75} aria-hidden="true" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-auto min-w-40">
              {offers.map((offer) => {
                const mark = focusMark(offer.key, appearance)
                const Icon = mark.icon
                return (
                  <DropdownMenuItem
                    key={offer.key}
                    onClick={() => {
                      onChange([...lists, offer.key])
                    }}
                  >
                    <Icon
                      strokeWidth={1.75}
                      style={mark.color === undefined ? undefined : { color: mark.color }}
                      aria-hidden="true"
                    />
                    {offer.name}
                  </DropdownMenuItem>
                )
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <SidebarGroupContent>
        <SidebarMenu>
          {shown.map((list, index) => (
            <FocusRow
              key={list.key}
              list={list}
              mark={focusMark(list.key, appearance)}
              link={link}
              active={currentPath === list.path}
              itemRef={sortable.setItemRef(index)}
              onPointerDown={grip(sortable.handleProps(index)).onPointerDown}
              state={sortable.itemState(index)}
              onDrop={() => {
                onChange(lists.filter((key) => key !== list.key))
              }}
            />
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

function FocusRow({
  list,
  mark,
  link,
  active,
  itemRef,
  onPointerDown,
  state,
  onDrop,
}: {
  readonly list: FocusList
  readonly mark: FocusMark
  readonly link: (to: string) => React.ReactElement
  readonly active: boolean
  readonly itemRef: (element: HTMLElement | null) => void
  readonly onPointerDown: (event: React.PointerEvent) => void
  readonly state: SortableItemState
  readonly onDrop: () => void
}): React.JSX.Element {
  const menuTrigger = useRef<HTMLButtonElement>(null)
  const offset = state.offset
  /* The Library row's drag look (`folder-row.tsx`): the carried row follows
     the pointer with no easing; the rows it passes ease out of its way. */
  const style: React.CSSProperties | undefined =
    offset === 0 && !state.isActive
      ? undefined
      : {
          transform:
            state.isActive && !state.isSettling
              ? `translate(var(--space-inline), calc(${String(offset)}px + var(--space-inline)))`
              : `translateY(${String(offset)}px)`,
          transition:
            state.isActive && !state.isSettling ? 'none' : 'transform 150ms cubic-bezier(0.2, 0, 0, 1)',
          zIndex: state.isActive ? 30 : undefined,
          position: state.isActive ? 'relative' : undefined,
          pointerEvents: state.isActive ? 'none' : undefined,
        }
  const Icon = mark.icon
  return (
    <SidebarMenuItem
      ref={itemRef}
      onPointerDown={onPointerDown}
      style={style}
      data-focus-list={list.key}
      onContextMenu={(event) => {
        event.preventDefault()
        menuTrigger.current?.click()
      }}
      className={cn('group/focus-row relative rounded-md', state.isActive && 'cursor-grabbing bg-sidebar')}
    >
      <SidebarMenuButton
        render={link(list.path)}
        isActive={active}
        aria-current={active ? 'page' : undefined}
        className={ROW}
      >
        <Icon
          strokeWidth={1.75}
          style={mark.color === undefined ? undefined : { color: mark.color }}
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1 truncate">{list.name}</span>
      </SidebarMenuButton>
      <div
        data-no-drag
        className="absolute top-1/2 right-1 z-20 -translate-y-1/2 opacity-0 transition-opacity duration-150 group-focus-within/focus-row:opacity-100 group-hover/focus-row:opacity-100 has-data-popup-open:opacity-100 [@media(hover:none)]:opacity-100"
      >
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                ref={menuTrigger}
                type="button"
                variant="ghost"
                size="icon"
                className={ICON_BUTTON}
                aria-label={`${MORE_ACTIONS}: ${list.name}`}
              />
            }
          >
            <MoreHorizontal className="size-4" strokeWidth={1.75} aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-auto min-w-32">
            <DropdownMenuItem onClick={onDrop}>
              {list.isDefault ? (
                <EyeOff strokeWidth={1.75} aria-hidden="true" />
              ) : (
                <Trash2 strokeWidth={1.75} aria-hidden="true" />
              )}
              {list.isDefault ? 'Hide' : 'Remove'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </SidebarMenuItem>
  )
}
