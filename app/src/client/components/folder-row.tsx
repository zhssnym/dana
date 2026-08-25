/*
The designer's `src/components/folder-row.tsx`, ported at P8R session R3: one
folder in the sidebar's folder list, with its colour dot, its pending count
and its own menu.

**It is a link now, and that is 9.1's roles table rather than a preference.**
Measured against the running prototype on 2026-08-13: every entry in his
sidebar is a `button`, and the only anchor anywhere in it is the brand. That
table fixes "the six page entries, and each folder row" as links, on the
ground the section already carried: the routes table makes every surface a
URL, and a page you can reach at a URL is navigated to. AC-175 asserts both
halves, the role and the `href`, and asserts `aria-current` on the row for the
folder currently open.

So `href` is required. `render` is offered beside it because this client
routes with React Router in library mode and a router's own link element has
to be the thing that carries the destination; the shell passes it and the
default stays a plain anchor, which is also what makes the row work with
scripting unavailable. Whichever arrives, it is an anchor with an `href`, and
that is what the criterion reads.

**The colour is data and not a token.** 11.4's own ruling of 2026-08-12: a
folder's colour is a person's runtime choice on 7.4's `my_color`, free-form
under 4.4's hex check, so it arrives as a prop and is written into `style`.
The rule that raw values live only in `tokens.css` governs the values the
design fixes, and the dot's size and shape are still there. AC-173 reads the
paint inside the row and would fail a client that painted every dot from one
swatch.

**The menu is "More actions", corrected here.** This file shipped his
`Manage {folder} folder` on the reading that the row's menu was not the
control the task row's overflow is. 9.1 ruled the other way at the P8R
mid-package change control of 2026-08-13, re-accepted by the owner the same
day: a sidebar folder row's menu and a folder group's menu take "More
actions", making four controls that share it, because they are the same
control pointed at different objects and a fourth name would assert a
difference in kind that is not there. The interpolation is the other half of
the fault and the general one: a name in that table is a fixed string, and
what tells four instances apart is 9.1's region rule, this one being reached
inside the row that names its folder. The menu's entries are unchanged, 9.6
supplying "Rename" and "Label and color" as its own words and "Move to group"
being one of the four folder-group actions that table names.

**The move-to-group submenu renders `menuitemradio`, which is accurate and
which AC-180 now admits.** A folder carries exactly one personal label, so a
radio group is what that choice is, and the state a screen reader announces is
which group the folder is in. That criterion reached for `menuitem` or `option`
alone when this was written, so R3 escalated rather than degrading the
primitive; the Adversarial Test Engineer corrected the locator on 2026-08-13,
9.1's roles table not reaching this control and sending it to "its role in the
ordinary sense of the word", which all three are true of. Nothing here changed.

**The menu's entries are wired at R10 and each is a prop that may be absent.**
9.1 puts "New folder group" and "Move to group" on a folder's own menu and 9.6
puts rename, "Label and color" and delete in the folder page's header, so the
sidebar supplies the first two and leaves the rest to that page rather than
offering two routes to one write. The row renders only the entries whose
callback it was given.
*/
import type { ReactElement } from 'react'
import {
  Folder,
  FolderInput,
  Folders,
  MoreHorizontal,
  Palette,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'

import { Button } from './ui/button.js'
import { MORE_ACTIONS } from './ui/copy.js'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from './ui/dropdown-menu.js'
import {
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from './ui/sidebar.js'
import { cn } from './ui/utils.js'
import type { SortableItemState } from '../lib/use-sortable-list.js'

export interface FolderRowProps {
  name: string
  color: string
  pending: number
  /** 9.1's routes table: `/app/folders/:id`. Asserted by AC-175. */
  href: string
  /**
   * The element the row renders as, for a router that owns navigation. It
   * must produce an anchor carrying `href`; the default is a plain one.
   */
  render?: ReactElement<Record<string, unknown>>
  active?: boolean
  nested?: boolean
  tree?: boolean
  treeLast?: boolean
  groupLabels?: readonly string[]
  currentLabel?: string | null
  /*
  The four props the S11 drag adds. Each is optional and absent by default, so
  a row nobody is dragging renders exactly as it did: DES-171's "a sidebar
  nobody has touched still reads exactly as it did" is a property of this
  component as much as of the order above it.

  `itemRef` is the engine's measurement ref, `rowProps` is the grip plus
  whatever the surface hit-tests against, `dragState` is how this row is drawn
  while a drag is in the air, and `proposal` is the sentence the carried row
  says about where it would land.
  */
  itemRef?: (element: HTMLLIElement | null) => void
  rowProps?: React.ComponentProps<'li'>
  dragState?: SortableItemState
  /** What a release would do, said on the carried row only. */
  proposal?: string | null
  onSelect?: () => void
  onAddTask?: () => void
  /** 9.1's "New folder group", which is an action on this folder's label. */
  onNewGroup?: () => void
  onMoveToLabel?: (label: string | null) => void
  onRename?: () => void
  onEditAppearance?: () => void
  onDelete?: () => void
}

export function FolderRow({
  name,
  color,
  pending,
  href,
  render,
  active = false,
  nested = false,
  tree = false,
  treeLast = false,
  groupLabels = [],
  currentLabel = null,
  itemRef,
  rowProps,
  dragState,
  proposal = null,
  onSelect,
  onAddTask,
  onNewGroup,
  onMoveToLabel,
  onRename,
  onEditAppearance,
  onDelete,
}: FolderRowProps) {
  const hasFolderMenu = Boolean(
    onRename || onEditAppearance || onNewGroup || onMoveToLabel || onDelete,
  )
  const hasActions = Boolean(onAddTask || hasFolderMenu)
  /*
  Geometry inline rather than in a class, because the offset is a measured
  number of pixels and a class cannot carry one. The tokens file stays the
  only place a colour, a type size, a spacing step or a radius is written; a
  transform is none of those.

  The carried row does not transition and the rows it passes do: the carried
  one is following a pointer, where any easing reads as lag, and the others
  are making space, where the movement is the whole message. `isSettling` is
  the one frame band where the carried row transitions too, travelling to the
  slot the list held open before the array underneath it changes.
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
              : 'transform 180ms cubic-bezier(0.2, 0, 0, 1)',
          zIndex: dragState.isActive ? 30 : undefined,
          position: dragState.isActive ? 'relative' : undefined,
        }

  return (
    <SidebarMenuItem
      ref={itemRef}
      {...rowProps}
      style={{ ...dragStyle, ...rowProps?.style }}
      data-dragging={dragState?.isActive ? 'true' : undefined}
      className={cn(
        'group/folder-row',
        tree &&
          "before:absolute before:-top-0.5 before:left-6 before:z-0 before:h-[calc(50%+2px)] before:w-1.5 before:rounded-bl-[6px] before:border-b before:border-l before:border-[var(--color-graphite-300)] before:content-[''] after:absolute after:top-1/2 after:-bottom-0.5 after:left-6 after:z-0 after:border-l after:border-[var(--color-graphite-300)] after:content-['']",
        tree && treeLast && 'after:hidden',
        dragState?.isActive && 'shadow-lg',
        dragState?.isDwelling && 'ring-2 ring-ring/40',
        rowProps?.className,
      )}
    >
      <SidebarMenuButton
        // 9.1's roles table: a folder row is a link to that folder's path.
        render={render ?? <a href={href} />}
        data-sidebar-tier="folder"
        isActive={active}
        aria-current={active ? 'page' : undefined}
        title={name}
        tooltip={name}
        onClick={onSelect}
        className={cn(
          "relative h-[var(--shell-sidebar-row-height)] gap-2 border-0 bg-transparent px-3 text-[13px] font-medium text-[var(--color-graphite-600)] hover:bg-transparent hover:text-[var(--color-graphite-600)] data-active:bg-transparent data-active:font-semibold data-active:text-[var(--color-graphite-900)] before:pointer-events-none before:absolute before:inset-x-1 before:inset-y-px before:rounded-md before:content-[''] hover:before:bg-[var(--color-graphite-100)] group-hover/folder-row:before:bg-[var(--color-graphite-100)] data-active:before:bg-[var(--color-graphite-100)] [&>*]:relative [&>*]:z-10",
          nested && !tree && 'pl-7',
          tree && 'pl-10 before:!left-8',
          (pending > 0 || hasActions) && 'pr-[4.75rem]',
        )}
      >
        <Folder
          className="!size-4 shrink-0 opacity-90"
          style={{ color }}
          strokeWidth={1.75}
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1 truncate">{name}</span>
      </SidebarMenuButton>

      {pending > 0 ? (
        <SidebarMenuBadge
          className={cn(
            'right-3 h-5 min-w-5 rounded-full bg-[var(--color-graphite-200)] px-1.5 text-[0.625rem] text-[var(--color-graphite-600)] peer-data-active/menu-button:bg-[var(--color-graphite-200)] peer-data-active/menu-button:text-[var(--color-graphite-800)]',
            hasActions &&
              'transition-opacity group-hover/folder-row:pointer-events-none group-hover/folder-row:opacity-0 group-focus-within/folder-row:pointer-events-none group-focus-within/folder-row:opacity-0',
          )}
        >
          {pending}
        </SidebarMenuBadge>
      ) : null}

      {hasActions ? (
        // Opacity alone, never a collapsed box, for the reason task-row.tsx
        // records at length: a control with an empty bounding box is not
        // visible to anything that addresses it by role and name, which is
        // what 9.1's addressing sentence requires of every control.
        <div
          // The whole row is the drag's grip where a list is sorting it
          // (`shell/library-drag.ts`), and a press on a control belongs to
          // that control, so the row's own actions say they are not the grip.
          data-no-drag
          className="absolute top-1/2 right-1 z-20 flex -translate-y-1/2 items-center gap-0.5 opacity-0 transition-opacity group-hover/folder-row:opacity-100 group-focus-within/folder-row:opacity-100"
        >
          {onAddTask ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-6 rounded-md text-[var(--color-graphite-600)] hover:bg-[var(--color-graphite-200)] hover:text-[var(--color-graphite-900)]"
              aria-label={`Add task to ${name}`}
              onClick={onAddTask}
            >
              <Plus className="size-4" strokeWidth={1.75} aria-hidden="true" />
            </Button>
          ) : null}

          {hasFolderMenu ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-6 rounded-md text-[var(--color-graphite-600)] hover:bg-[var(--color-graphite-200)] hover:text-[var(--color-graphite-900)]"
                    // 9.1's names table: a fixed string, the row that names
                    // this folder being what separates it from the other
                    // three controls answering to it.
                    aria-label={MORE_ACTIONS}
                  />
                }
              >
                <MoreHorizontal className="size-4" strokeWidth={1.75} aria-hidden="true" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {onRename ? (
                  <DropdownMenuItem onClick={onRename}>
                    <Pencil className="size-4" aria-hidden="true" />Rename
                  </DropdownMenuItem>
                ) : null}
                {onEditAppearance ? (
                  <DropdownMenuItem onClick={onEditAppearance}>
                    <Palette className="size-4" aria-hidden="true" />Label and color
                  </DropdownMenuItem>
                ) : null}
                {/* 9.1's names table, added to this menu at P8R session R10:
                    "creating one is naming it on a folder", so the action that
                    makes a group is an action on the folder whose label it
                    will be. His prototype puts it in a folder-directory menu
                    the sidebar does not carry; see `shell/folder-groups.tsx`
                    for why that menu is not here. */}
                {onNewGroup ? (
                  <DropdownMenuItem onClick={onNewGroup}>
                    <Folders className="size-4" aria-hidden="true" />New folder group
                  </DropdownMenuItem>
                ) : null}
                {onMoveToLabel ? (
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <FolderInput className="size-4" aria-hidden="true" />Move to group
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="w-44">
                      <DropdownMenuRadioGroup
                        value={currentLabel || '__none'}
                        onValueChange={(value) =>
                          onMoveToLabel(value === '__none' ? null : value)
                        }
                      >
                        {groupLabels.map((label) => (
                          <DropdownMenuRadioItem
                            key={label}
                            value={label}
                            closeOnClick
                          >
                            {label}
                          </DropdownMenuRadioItem>
                        ))}
                        <DropdownMenuSeparator />
                        <DropdownMenuRadioItem value="__none" closeOnClick>
                          No group
                        </DropdownMenuRadioItem>
                      </DropdownMenuRadioGroup>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                ) : null}
                {onDelete ? <DropdownMenuSeparator /> : null}
                {onDelete ? (
                  <DropdownMenuItem variant="destructive" onClick={onDelete}>
                    <Trash2 className="size-4" aria-hidden="true" />Delete folder…
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      ) : null}

      {/*
      What a release would do, said in words on the row being carried.

      9.1 fixes the sentence for the container case, "the drop reads 'Into
      {shelf}'", and DES-171 gives the reason it is words at all: a closed
      group is never sprung open by a drag hovering it, because opening it
      would move every row below it after the engine had measured where they
      sit. So the closed group takes the drop and says so instead. The same
      line carries the hold's two states and the way out of a group, each of
      which is equally a promise about the release.
      */}
      {proposal === null ? null : (
        <span className="pointer-events-none absolute top-1/2 right-2 z-40 -translate-y-1/2 rounded-full bg-[var(--color-graphite-900)] px-2 py-0.5 text-[0.625rem] font-medium whitespace-nowrap text-[var(--color-graphite-50)]">
          {proposal}
        </span>
      )}
    </SidebarMenuItem>
  )
}
