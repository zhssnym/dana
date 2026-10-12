/*
 * Resolve the primary screen's location separately from its presentation.
 * Folder ancestry is already access-filtered by the server; callers must never
 * invent missing parent names from the library or from the entry point.
 *
 * Sidebars are deliberately excluded: opening Team or Discussion beside Work
 * does not change the location of the primary page.
 */
import { DEFAULT_TAB_NAMES } from '../../shared/folders.js'
import type { PageKind } from '../../shared/folders.js'
import { paths, navPages } from '../routes.js'
import { focusList, isFocusKey } from './focus-lists.js'

export interface BreadcrumbSegment {
  readonly name: string
  readonly to?: string
}

export interface BreadcrumbLocation {
  readonly folderId: string | null
  readonly current?: string
  readonly extra?: readonly BreadcrumbSegment[]
  /** A phone's focused thread owns the compact top bar. */
  readonly mobileThread?: boolean
}

interface LocatedPage {
  readonly id: string
  readonly project_id: string
  readonly kind: PageKind | null
  readonly tab_position: string | null
}

interface LocatedTeam {
  readonly members: readonly {
    readonly user: { readonly id: string; readonly display_name: string | null }
  }[]
}

export interface BreadcrumbContext {
  readonly pathname: string
  readonly search: string
  readonly page?: LocatedPage
  readonly task?: { readonly title: string; readonly folder: { readonly id: string } }
  readonly shelf?: { readonly name: string }
  readonly discussion?: { readonly title: string }
  readonly team?: LocatedTeam
}

const FOLDER_PREFIX = '/app/folders/'
const TASK_PREFIX = '/app/tasks/'
const SHELF_PREFIX = '/app/shelves/'

export function resolveBreadcrumbLocation({
  pathname,
  search,
  page,
  task,
  shelf,
  discussion,
  team,
}: BreadcrumbContext): BreadcrumbLocation | null {
  if (pathname.startsWith(FOLDER_PREFIX)) {
    // A failed/forbidden page read must never become a guessed breadcrumb.
    if (page === undefined) return null
    const query = new URLSearchParams(search)
    const memberId = query.get('member')
    if (query.get('team') === 'full') {
      const teamList = new URLSearchParams(search)
      teamList.delete('member')
      const teamTo = `${pathname}${teamList.size === 0 ? '' : `?${teamList.toString()}`}`
      const name = team?.members.find((member) => member.user.id === memberId)?.user.display_name ?? 'Teammate'
      return {
        folderId: page.project_id,
        extra: [
          { name: 'Team', ...(memberId === null ? {} : { to: teamTo }) },
          ...(memberId === null ? [] : [{ name }]),
        ],
      }
    }

    const discussionId = query.get('discussion')
    // A stored Discussion tab and an open Discussion URL are focused surfaces.
    // Opening a side panel does not add any of these query parameters.
    if (page.kind === 'discussion' || discussionId !== null || query.get('conversation') === 'open') {
      const list = new URLSearchParams(search)
      list.delete('discussion')
      list.delete('outcome')
      const listTo = `${pathname}${list.size === 0 ? '' : `?${list.toString()}`}`
      return {
        folderId: page.project_id,
        extra: [
          { name: 'Discussion', ...(discussionId === null ? {} : { to: listTo }) },
          ...(discussionId === null ? [] : [{ name: discussion?.title || 'Thread' }]),
        ],
        mobileThread: discussionId !== null,
      }
    }

    // The project root is both a project and its own stored Work/Doc tab.
    // Its tab label is virtual, but must be visible just like any other tab.
    const rootTab = page.id === page.project_id && page.tab_position !== null && page.kind !== null
    return {
      folderId: page.id,
      ...(rootTab ? { current: DEFAULT_TAB_NAMES[page.kind!] } : {}),
    }
  }

  if (pathname.startsWith(TASK_PREFIX)) {
    return task === undefined ? null : { folderId: task.folder.id, current: task.title || 'Untitled task' }
  }

  if (pathname.startsWith(SHELF_PREFIX)) {
    return shelf === undefined ? null : { folderId: null, current: shelf.name }
  }

  const focus = navPages.find((view) => view.path === pathname)
  if (focus !== undefined) return { folderId: null, current: focus.name }

  if (pathname.startsWith('/app/lists/')) {
    const key = pathname.slice('/app/lists/'.length)
    return isFocusKey(key) ? { folderId: null, current: focusList(key).name } : { folderId: null, current: 'Not found' }
  }

  if (pathname === paths.archivedWork) {
    return { folderId: null, extra: [{ name: 'Settings', to: paths.settings }, { name: 'Archived work' }] }
  }
  if (pathname === paths.settings) return { folderId: null, current: 'Settings' }
  if (pathname === paths.trash) return { folderId: null, current: 'Trash' }
  if (pathname === paths.stats) return { folderId: null, current: 'Stats' }

  // /app redirects to Today. Other unknown in-app addresses have a real 404.
  if (pathname.startsWith('/app/')) return { folderId: null, current: 'Not found' }
  return null
}
