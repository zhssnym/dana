/*
The route table of 9.1, as code, and the navigation model behind it.

Transcribed from that section and not invented here. RFC 0005 replaced 9.1
wholesale at S0 and this file caught up at S9: the six v1 pages became the
DES-152 page block, three surfaces gained paths (Abandoned, Anytime, Trash)
and two v1 paths retired into redirects.

The one entry worth knowing the reason for is Desk: it is `/app` rather than
`/app/desk` because 10.6 fixes the installed app's start_url there, and a
separate path would leave the installed app opening on a redirect. It is also
what My Day used to be, which is the same reason under a different page:
whoever changes this changes the manifest with it.

Three surfaces deliberately have no path, and nothing below should acquire
one: the 9.9 search overlay opens over whatever page is beneath it, a page's
list, board and calendar modes are a client-side choice named by `?mode=`
rather than separate pages, and the unverified-email page of 9.2 is the
server's response to one request.
*/

export const paths = {
  landing: '/',
  /** Desk, the default folder, and the installed app's start_url (10.6). */
  desk: '/app',
  today: '/app/today',
  scheduled: '/app/scheduled',
  assignments: '/app/assignments',
  important: '/app/important',
  all: '/app/all',
  done: '/app/done',
  abandoned: '/app/abandoned',
  anytime: '/app/anytime',
  folder: (id: string) => `/app/folders/${id}`,
  shelf: (id: string) => `/app/shelves/${id}`,
  task: (id: string) => `/app/tasks/${id}`,
  trash: '/app/trash',
  settings: '/app/settings',
  people: '/app/people',
} as const

/**
 * The two v1 paths that retired at RFC 0005, and where each lands.
 *
 * 9.1's own sentence is the reason and it is worth keeping: "the two retired
 * v1 paths redirect rather than 404, because bookmarks exist". A redirect and
 * not an alias, so the address bar carries the page's real path afterwards
 * and a bookmark taken today is a bookmark of the surviving name. AC-215
 * reads exactly that.
 */
export const retiredPaths = [
  { from: '/app/planned', to: paths.scheduled },
  { from: '/app/tasks', to: paths.desk },
] as const

/**
 * The pin keys of 4.19, which are what `pinned_views` holds and what the
 * Settings pin list of 9.7 writes. Kept as the join between a sidebar entry
 * and the person's stored choice, so neither side matches on a display name.
 */
export type NativeViewKey =
  | 'desk'
  | 'today'
  | 'scheduled'
  | 'assignments'
  | 'important'
  | 'all'
  | 'done'
  | 'abandoned'
  | 'anytime'

/**
 * DES-152's page block: one page per question, in 9.1's fixed order.
 *
 * Ruled by Imran on 2026-08-21 after the research in
 * `docs/design/six-pages-review.md`. The six v1 pages mixed four
 * classification schemes and presented them as peers; the replacement locks
 * one axis per page and frees every other, so no page can be turned into
 * another by adjusting controls.
 *
 * **`pinnable: false` is Desk alone**, and it is structural rather than a
 * preference (Imran, 2026-08-22). Desk is the default folder, the destination
 * every entry default in 9.3 names, and where a task goes when nobody chose.
 * A person who hid it would still be filling it with no way back to what they
 * had filed. Everything else is a view over tasks that exist elsewhere too,
 * so hiding one costs nothing but the shortcut.
 *
 * **The order here is the order on screen** and 9.1 fixes it, which is why
 * the sidebar filters this list rather than building its own from the pins:
 * a person's pin list is a set, and a set has no order to trust.
 */
export interface NavPage {
  readonly key: NativeViewKey
  /** The fixed string 9.1 names it by, which is what a criterion addresses. */
  readonly name: string
  readonly path: string
  /** What the page answers, from DES-152; the description under its title. */
  readonly question: string
  readonly pinnable: boolean
}

export const navPages: readonly NavPage[] = [
  {
    key: 'desk',
    name: 'Desk',
    path: paths.desk,
    question: 'Nothing decided about it yet',
    pinnable: false,
  },
  {
    key: 'today',
    name: 'Today',
    path: paths.today,
    question: 'What I am doing today',
    pinnable: true,
  },
  {
    key: 'scheduled',
    name: 'Scheduled',
    path: paths.scheduled,
    question: 'Everything with a date',
    pinnable: true,
  },
  {
    key: 'assignments',
    name: 'Assignments',
    path: paths.assignments,
    question: "Who's carrying what",
    pinnable: true,
  },
  {
    key: 'important',
    name: 'Important',
    path: paths.important,
    question: 'Starred tasks',
    pinnable: true,
  },
  {
    key: 'all',
    name: 'All',
    path: paths.all,
    question: 'Every task, finished ones included',
    pinnable: true,
  },
  {
    key: 'done',
    name: 'Done',
    path: paths.done,
    question: 'Everything you have finished',
    pinnable: true,
  },
  {
    key: 'abandoned',
    name: 'Abandoned',
    path: paths.abandoned,
    question: 'Things you decided not to do',
    pinnable: true,
  },
  {
    key: 'anytime',
    name: 'Anytime',
    path: paths.anytime,
    question: 'No date on it, whenever you get to it',
    pinnable: true,
  },
] as const

/**
 * 9.1's fixed order, and the pins a fresh account carries.
 *
 * The same six the shared schema's `DEFAULT_PINNED` names, restated here
 * rather than imported because this list is an *order* and that one is the
 * server's default *set*; they agree today and the sidebar depends on this
 * one's sequence, which is 9.1's rather than 4.19's to fix.
 */
export const DEFAULT_PINNED_KEYS: readonly NativeViewKey[] = [
  'desk',
  'today',
  'scheduled',
  'assignments',
  'important',
  'all',
]

/**
 * The page block the sidebar draws, given the viewer's pin list.
 *
 * Desk is present whatever the pins say, per `pinnable: false` above, and the
 * order is this file's rather than the pin list's. A missing or failed
 * settings read falls back to the defaults rather than to nothing, which is
 * AC-095's third case generalised: a sidebar that empties when a read fails
 * strands a person on whatever page they are standing on.
 */
export function pinnedNavPages(
  pinned: readonly string[] | undefined,
): readonly NavPage[] {
  const keys = new Set<string>(pinned ?? DEFAULT_PINNED_KEYS)
  return navPages.filter((page) => !page.pinnable || keys.has(page.key))
}
