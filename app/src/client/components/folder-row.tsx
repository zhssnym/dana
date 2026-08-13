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
which AC-180 cannot address.** A folder carries exactly one personal label, so
a radio group is what that choice is, and the state a screen reader announces
is which group the folder is in. AC-180 reaches for `menuitem` or `option`.
Escalated rather than degraded; see the session report.
*/
import type { ReactElement } from 'react'
import {
  Folder,
  FolderInput,
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
  groupLabels?: string[]
  currentLabel?: string | null
  onSelect?: () => void
  onAddTask?: () => void
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
  onSelect,
  onAddTask,
  onMoveToLabel,
  onRename,
  onEditAppearance,
  onDelete,
}: FolderRowProps) {
  const hasFolderMenu = Boolean(
    onRename || onEditAppearance || onMoveToLabel || onDelete,
  )
  const hasActions = Boolean(onAddTask || hasFolderMenu)

  return (
    <SidebarMenuItem
      className={cn(
        'group/folder-row',
        tree &&
          "before:absolute before:-top-0.5 before:left-6 before:z-0 before:h-[calc(50%+2px)] before:w-1.5 before:rounded-bl-[6px] before:border-b before:border-l before:border-[var(--color-graphite-300)] before:content-[''] after:absolute after:top-1/2 after:-bottom-0.5 after:left-6 after:z-0 after:border-l after:border-[var(--color-graphite-300)] after:content-['']",
        tree && treeLast && 'after:hidden',
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
        <div className="absolute top-1/2 right-1 z-20 flex -translate-y-1/2 items-center gap-0.5 opacity-0 transition-opacity group-hover/folder-row:opacity-100 group-focus-within/folder-row:opacity-100">
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
    </SidebarMenuItem>
  )
}
