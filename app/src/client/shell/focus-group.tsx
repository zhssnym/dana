/*
The sidebar's Focus group (M4): a heading styled as Library's, then Today and
Upcoming, and Assigned when the viewer is on a page with another member
(`focus-lists.ts`). The rows are fixed: no "+", no "…", no reordering.

`lists` and `onChange` are the old props of the round-8 group, still passed by
the sidebar; the stored `focus_lists` they carry is neither read nor written
here, so an account holding a retired list is left as it is.
*/
import { useMultiMemberFolderIds } from '../api/queries.js'
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '../components/ui/sidebar.js'
import { focusRows } from './focus-lists.js'
import type { FocusListKey } from './focus-lists.js'

const ROW =
  'my-(--sidebar-row-gap) h-(--shell-sidebar-row-height) max-md:h-(--row-height) gap-2 rounded-md px-2 text-sm font-normal text-muted-foreground hover:bg-(--sidebar-row-hover) hover:text-foreground data-active:bg-sidebar-accent data-active:hover:bg-sidebar-accent data-active:font-normal data-active:text-foreground [&_svg]:!size-4 [&_svg]:shrink-0'

export function FocusGroup({
  currentPath,
  link,
}: {
  /** Retired (see the file comment). */
  readonly lists?: readonly FocusListKey[]
  /** Retired (see the file comment). */
  readonly onChange?: (next: readonly FocusListKey[]) => void
  readonly currentPath: string
  /** The router link a row renders as (the sidebar's `routerLink`). */
  readonly link: (to: string) => React.ReactElement
}): React.JSX.Element {
  const shared = useMultiMemberFolderIds().size > 0
  return (
    /* The sidebar's first group: it starts at the top, with no gap above it. */
    <SidebarGroup className="px-2 pt-0 pb-0">
      <div className="flex h-(--shell-sidebar-row-height) items-center pr-1 pl-2">
        <h2 className="min-w-0 flex-1 truncate text-xs font-medium text-muted-foreground">Focus</h2>
      </div>
      <SidebarGroupContent>
        <SidebarMenu>
          {focusRows(shared).map((list) => {
            const active = currentPath === list.path
            const Icon = list.icon
            return (
              <SidebarMenuItem key={list.key} data-focus-list={list.key} className="rounded-md">
                <SidebarMenuButton
                  render={link(list.path)}
                  isActive={active}
                  aria-current={active ? 'page' : undefined}
                  className={ROW}
                >
                  <Icon strokeWidth={1.75} aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{list.name}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
