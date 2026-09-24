/*
The route table of 9.1, as code, and the navigation model behind it.

`/app` is the installed app's start_url (10.6) and lands on Today, so the
manifest never needs to change when the landing page does. Desk is the
account's default folder and has no page of its own: it is a folder like any
other, at `/app/folders/<id>`.

Three surfaces deliberately have no path: the 9.9 search overlay opens over
whatever page is beneath it, a page's list, board and calendar modes are a
client-side choice named by `?mode=`, and the unverified-email page of 9.2 is
the server's response to one request.

`/privacy` and `/terms` sit outside `/app` because AC-239 sends any
unauthenticated visit to an `/app` route to `/`, and a privacy policy is read
by people with no session: Google's OAuth consent screen fetches it with none.
*/
import { CalendarDays, SunMedium, UserRoundCheck } from './lib/icons.js'
import type { LucideIcon } from './lib/icons.js'
import type { NativeView } from '../shared/bundle.js'

export const paths = {
  landing: '/',
  privacy: '/privacy',
  terms: '/terms',
  /** The app's entry and the installed app's start_url (10.6); it lands on Today. */
  home: '/app',
  today: '/app/today',
  scheduled: '/app/scheduled',
  assignments: '/app/assignments',
  folder: (id: string) => `/app/folders/${id}`,
  shelf: (id: string) => `/app/shelves/${id}`,
  task: (id: string) => `/app/tasks/${id}`,
  /** #320's Dana Link addresses; each redirects into its Folder's Consultation facet. */
  discussion: (id: string) => `/app/discussions/${id}`,
  outcome: (id: string) => `/app/outcomes/${id}`,
  trash: '/app/trash',
  settings: '/app/settings',
  people: '/app/people',
} as const

/**
 * Paths that no longer have a page, and where each lands.
 *
 * A redirect rather than a 404 because bookmarks exist, and a redirect rather
 * than an alias so the address bar carries the surviving path afterwards
 * (AC-215). Finished and abandoned work is a folder's "Show completed", not a
 * page, so Done and Abandoned land on Today like the other retired views.
 * `/app/desk` is not here: it needs the default folder's id, which is data.
 */
export const retiredPaths = [
  { from: '/app/planned', to: paths.scheduled },
  { from: '/app/tasks', to: paths.today },
  { from: '/app/all', to: paths.today },
  { from: '/app/anytime', to: paths.today },
  { from: '/app/important', to: paths.today },
  { from: '/app/done', to: paths.today },
  { from: '/app/abandoned', to: paths.today },
] as const

/**
 * The pin keys of 4.19, which are what `pinned_views` holds and what the
 * Settings pin list of 9.7 writes.
 *
 * The shared union still names views this client no longer draws (the server
 * contract is unchanged), so a stored pin for one of them is simply ignored:
 * `pinnedNavPages` filters this file's list, never the stored one.
 */
export type NativeViewKey = NativeView

/** The cross-project pages, in the order the sidebar draws them. */
export interface NavPage {
  readonly key: NativeViewKey
  /** The fixed string 9.1 names it by, which is what a criterion addresses. */
  readonly name: string
  readonly path: string
  /** What the page answers; the description under its title. */
  readonly question: string
  /** The page's own mark, shared by the sidebar and the Settings pin list. */
  readonly icon: LucideIcon
  readonly pinnable: boolean
}

export const navPages = [
  {
    key: 'today',
    name: 'Today',
    path: paths.today,
    question: 'Keep today clear and focus on what matters now.',
    icon: SunMedium,
    pinnable: true,
  },
  {
    key: 'scheduled',
    name: 'Scheduled',
    path: paths.scheduled,
    question: 'See what is coming and when it needs your attention.',
    icon: CalendarDays,
    pinnable: true,
  },
  {
    key: 'assignments',
    name: 'Assignments',
    path: paths.assignments,
    question: 'See who is carrying each task.',
    icon: UserRoundCheck,
    pinnable: true,
  },
] as const satisfies readonly NavPage[]

/** The pins a fresh account carries, in the sidebar's order. */
export const DEFAULT_PINNED_KEYS: readonly NativeViewKey[] = [
  'today',
  'scheduled',
  'assignments',
]

/**
 * The pages the sidebar draws, given the viewer's pin list.
 *
 * The order is this file's rather than the pin list's, since a pin list is a
 * set. A missing or failed settings read falls back to the defaults rather
 * than to nothing (AC-095): a sidebar that empties when a read fails strands a
 * person on whatever page they are standing on.
 */
export function pinnedNavPages(
  pinned: readonly string[] | undefined,
): readonly NavPage[] {
  const keys = new Set<string>(pinned ?? DEFAULT_PINNED_KEYS)
  return navPages.filter((page) => !page.pinnable || keys.has(page.key))
}
