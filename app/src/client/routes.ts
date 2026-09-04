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

**Two paths below are not rows of 9.1's table, and a row there would be a
defect rather than a tidier arrangement (S16; RFC 0005 change control items
29 and 30).** `/privacy` and `/terms` are the public pages of DES-032, linked
from the landing footer since S13 and defined by no route until this package,
so both answered 200 carrying the client's own not-found page.

The reason they stay out is AC-239. That criterion sends **any**
unauthenticated visit to an `/app` route to `/`, and a privacy policy is read
overwhelmingly by people with no session: Google's OAuth consent
configuration fetches it with none at all. Putting these two under `/app`
would bounce the exact audience they exist for, and would break the
obligation they were built to satisfy in the act of satisfying it. So the
table stays the application's, every row of it under `/app` but the landing,
and these two are the landing's neighbours. Recorded rather than done
quietly, on the `saved-views.ts` precedent, because a route not in that table
is a deviation whoever reads the table next is owed an explanation of.
*/
import {
  Ban,
  CalendarDays,
  CalendarX,
  CheckCircle2,
  LampDesk,
  Layers3,
  Star,
  SunMedium,
  UserRoundCheck,
} from './lib/icons.js'
import type { LucideIcon } from './lib/icons.js'
import type { NativeView } from '../shared/bundle.js'

export const paths = {
  landing: '/',
  /** DES-032's two public pages; the header says why they are not 9.1's. */
  privacy: '/privacy',
  terms: '/terms',
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
 * Settings pin list of 9.7 writes. They come from `shared/bundle.ts`, so the
 * client no longer gets a separate vote on which native views exist. Kept as
 * the join between a sidebar entry and the person's stored choice, so neither
 * side matches on a display name.
 */
export type NativeViewKey = NativeView

/**
 * DES-152's page block: one page per question, in 9.1's fixed order.
 *
 * Ruled by Imran on 2026-08-21 after the research in
 * `docs/design/six-pages-review.md`, a document deleted (`a7886df`,
 * 2026-09-01) and in git history before that commit. The six v1 pages mixed
 * four classification schemes and presented them as peers; the replacement
 * locks one axis per page and frees every other, so no page can be turned
 * into another by adjusting controls.
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
  /**
   * The page's own mark, which belongs to no numbered section and is the
   * designer's.
   *
   * It lived in `shell/app-sidebar.tsx` as a map keyed by path until S16,
   * whose own comment wished it were here: "keyed by path rather than by name
   * so that a rename in 9.1's page set is one edit in `routes.ts` and not
   * two". The pin list of 9.7 is the second reader, and 9.7 requires it to
   * draw "the page's own mark" so that the list and the sidebar show one
   * page rather than two descriptions of it. That is only guaranteed by there
   * being one mark, so the mark moved to the page.
   */
  readonly icon: LucideIcon
  readonly pinnable: boolean
}

export const navPages = [
  {
    key: 'desk',
    name: 'Desk',
    path: paths.desk,
    question: 'A home for things you have not sorted yet.',
    /* Desk wears a desk lamp (DES-181). */
    icon: LampDesk,
    pinnable: false,
  },
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
  {
    key: 'important',
    name: 'Important',
    path: paths.important,
    question: 'Keep the tasks that matter most close at hand.',
    icon: Star,
    pinnable: true,
  },
  {
    key: 'all',
    name: 'All',
    path: paths.all,
    question: 'See every task together, including finished work.',
    icon: Layers3,
    pinnable: true,
  },
  {
    key: 'done',
    name: 'Done',
    path: paths.done,
    question: 'Look back on everything you have completed.',
    icon: CheckCircle2,
    pinnable: true,
  },
  {
    key: 'abandoned',
    name: 'Abandoned',
    path: paths.abandoned,
    question: 'Keep track of what you chose not to continue.',
    icon: Ban,
    pinnable: true,
  },
  {
    key: 'anytime',
    name: 'Anytime',
    path: paths.anytime,
    question: 'Keep undated tasks ready for whenever the time is right.',
    /* A calendar with an X: the filter's own "No due date", and the other
       value of the axis Scheduled's calendar carries. It wore All's glyph for
       one revision and read as a repeated row (DES-152's own note). */
    icon: CalendarX,
    pinnable: true,
  },
] as const satisfies readonly NavPage[]

/* Every native view has a page. The annotation on navPages had to go for
   this to mean anything: `readonly NavPage[]` widens each key back to the
   full union, so the check passed vacuously. `satisfies` keeps the check
   and keeps the literal keys. */
const _everyNativeViewDraws: NativeView extends (typeof navPages)[number]['key']
  ? true
  : never = true
void _everyNativeViewDraws

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
