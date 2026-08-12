/*
The route table 9.1 gained at the P8 kickoff on 2026-08-10, as code.

Transcribed from that table and not invented here. The one entry worth knowing
the reason for is My Day: it is `/app` rather than `/app/my-day` because 10.6
fixes the installed app's start_url there, and a separate path would leave the
installed app opening on a redirect. Whoever changes one of these changes the
manifest with it.

Three surfaces deliberately have no path, and nothing below should acquire
one: the 9.9 search overlay opens over whatever page is beneath it, Planned's
list and calendar modes are a client-side choice rather than two pages, and
the unverified-email page of 9.2 is the server's response to one request.
*/

export const paths = {
  landing: '/',
  myDay: '/app',
  tasks: '/app/tasks',
  planned: '/app/planned',
  important: '/app/important',
  all: '/app/all',
  done: '/app/done',
  folder: (id: string) => `/app/folders/${id}`,
  settings: '/app/settings',
  people: '/app/people',
} as const

/**
 * The sidebar's six pages in 9.1's fixed order, each with the 9.7 setting that
 * decides whether the sidebar lists it.
 *
 * `setting: null` is 9.7's "My Day, Tasks, and Planned are always shown". The
 * three booleans are a filter over three pages, never over six: an
 * implementation reading them as a filter over all six hides the permanent
 * ones the moment a settings read fails, which AC-095's third case is written
 * to catch.
 */
export const sidebarPages = [
  { name: 'My Day', path: paths.myDay, setting: null },
  { name: 'Tasks', path: paths.tasks, setting: null },
  { name: 'Planned', path: paths.planned, setting: null },
  { name: 'Important', path: paths.important, setting: 'show_important' },
  { name: 'All', path: paths.all, setting: 'show_all' },
  { name: 'Done', path: paths.done, setting: 'show_done' },
] as const

export type SidebarPage = (typeof sidebarPages)[number]
