/*
 * The route table (spec 9.1). `/app` is the installed start_url and lands on Today. `/privacy` and `/terms` sit
 * outside `/app`: they must load with no session (AC-239).
 */
import { CalendarDays, SunMedium, UserRoundCheck } from './lib/icons.js'
import type { LucideIcon } from './lib/icons.js'
import type { NativeView } from '../shared/bundle.js'

export const paths = {
  landing: '/',
  privacy: '/privacy',
  terms: '/terms',
  help: '/help',
  helpArticle: (slug: string) => '/help/' + slug,
  /** The app's entry and the installed app's start_url (10.6); it lands on Today. */
  home: '/app',
  today: '/app/today',
  scheduled: '/app/scheduled',
  assignments: '/app/assignments',
  focusList: (key: string) => `/app/lists/${key}`,
  folder: (id: string) => `/app/folders/${id}`,
  shelf: (id: string) => `/app/shelves/${id}`,
  task: (id: string) => `/app/tasks/${id}`,
  discussion: (id: string) => `/app/discussions/${id}`,
  outcome: (id: string) => `/app/outcomes/${id}`,
  trash: '/app/trash',
  settings: '/app/settings',
  archivedWork: '/app/settings/archived-work',
  /** A 404 for everyone but operators; not in any menu. */
  stats: '/app/stats',
  people: '/app/people',
} as const

/**
 * Retired paths and where each lands: a redirect so bookmarks work and the bar shows the new path (AC-215).
 * `/app/desk` is not here: it needs the default folder's id.
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

/** The stored pin keys. The union still names views no longer drawn; `pinnedNavPages` ignores them. */
export type NativeViewKey = NativeView

export interface NavPage {
  readonly key: NativeViewKey
  /** The fixed name a criterion addresses. */
  readonly name: string
  readonly path: string
  /** What the page answers; the description under its title. */
  readonly question: string
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
    name: 'Upcoming',
    path: paths.scheduled,
    question: 'See what is coming and when it needs your attention.',
    icon: CalendarDays,
    pinnable: true,
  },
  {
    key: 'assignments',
    name: 'Assigned',
    path: paths.assignments,
    question: 'See who is carrying each task.',
    icon: UserRoundCheck,
    pinnable: true,
  },
] as const satisfies readonly NavPage[]
