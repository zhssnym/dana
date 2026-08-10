/*
The Playwright layer of the acceptance suite, the P8 analogue of
`views-harness.ts`: the sign-in path of 11.10, the seed rows every spec
addresses, section 9's normative copy restated, and the addressing helpers
that turn 9.1's addressing sentence into something a test can act on.

Five decisions this file is built around, each of which a spec would
otherwise make differently five times.

**Controls are addressed by accessible role and normative name, never by
class, DOM shape or test identifier.** That is 9.1's addressing sentence,
landed at the P8 kickoff, and it is the reason this file exports no CSS
selector. Where section 9 spells a control's name, the helper spells it
back character for character; where the section describes a control without
naming it, the helper says so in a comment and matches the description, and
the gap is escalated rather than papered over with an invented string.

**Section 9's copy is restated here, never imported from `src/client`.** The
standing Steward ruling for the frozen response shapes applies with more
force to copy: a suite that imports the string it asserts measures nothing.
Copy is compared character for character, whitespace normalized by
Playwright's own text engine, which is the only difference between a
rendered string and a specified one that is not a rewording.

**Fixtures are real rows through the real API.** No acceptance test runs
against mocked data (the P8 kickoff), so where a spec needs a row the seed
does not carry, it creates one through section 7 with the session it already
holds and the CSRF header 11.6 requires. That is the same transport a client
uses, so a fixture that cannot be created is itself a finding.

**Specs share one seeded database and run in one worker.** The runner
reseeds once before the first spec and never again, so a spec that mutates
a row changes what a later spec sees. The rule this file imposes: never
transition, edit or delete a seed row, always create your own and give it a
title no other spec uses. Reads of seed rows are free.

**The browser's zone is pinned to UTC by the specs that need it.**
`db/seed.ts` dates its rows with `toISOString().slice(0, 10)`, which is the
UTC date, and the client reports the browser's zone as `tz` on every view
request (7.0). A spec reading a date-relative seed row therefore declares
`test.use({ timezoneId: 'UTC' })` so the two agree; `seedDate()` below
computes the same dates the same way. The residual is the seconds between
the seed and the spec crossing a UTC midnight, which the vitest suite avoids
with `middayZone()` and this leg cannot, the seed's dates not being ours to
choose.
*/
import { expect } from '@playwright/test'
import type { BrowserContext, Locator, Page, Request } from '@playwright/test'

import { seedIds } from '../../db/seed.js'

export { seedIds }

/* ------------------------------------------------------------------ *
 * Sign-in (spec 11.10, 11.6)
 * ------------------------------------------------------------------ */

/**
 * The seeded accounts, keyed by `google_sub`.
 *
 * By sub and never by email, and the difference is not a preference. The
 * development login provisions a fresh sub for an email it does not know,
 * so posting `hassan@example.com` collides with the seeded row on 4.1's
 * unique email and answers 500. Posting the sub finds the seeded user
 * through the same `google_sub` uniqueness the provisioning transaction of
 * 7.1 is idempotent under, and syncs no timezone, because a login carrying
 * no tz syncs nothing. Measured by the Platform session that landed the
 * runner and routed the collision itself.
 */
export const seedSubs = {
  hassan: 'seed-google-sub-hassan',
  imran: 'seed-google-sub-imran',
} as const

/**
 * Signs in through 11.10's one sanctioned session source and leaves both
 * cookies in the browser context, so the page under test is authenticated
 * before its first load.
 */
export async function signIn(page: Page, sub: string): Promise<void> {
  const response = await page.request.post('/api/v1/auth/dev-login', {
    data: { sub },
  })
  expect(
    response.status(),
    `POST /api/v1/auth/dev-login for ${sub} is 11.10's session source for this leg; ` +
      `it answered ${response.status()}: ${await response.text()}`,
  ).toBe(200)
}

/**
 * The CSRF token 11.6's double-submit pattern puts in a second cookie.
 *
 * Identified by property and never by name, the discipline the vitest
 * harness already runs on: 11.6 fixes that the session cookie is httpOnly
 * and the CSRF cookie is not, and fixes neither name.
 */
export async function csrfToken(context: BrowserContext): Promise<string> {
  const readable = (await context.cookies()).filter((cookie) => !cookie.httpOnly)
  const token = readable[0]
  expect(
    readable.length,
    'spec 11.6 sets exactly one non-httpOnly cookie at sign-in, the CSRF token; ' +
      `this context holds ${readable.length}: ${readable.map((c) => c.name).join(', ')}`,
  ).toBe(1)
  if (token === undefined) throw new Error('unreachable: length asserted above')
  return token.value
}

/* ------------------------------------------------------------------ *
 * Fixtures through section 7
 * ------------------------------------------------------------------ */

interface NewTask {
  title: string
  folder_id?: string
  due_date?: string | null
  due_time?: string | null
  important?: boolean
  assignee_id?: string | null
  recurrence_rule?: string | null
  notes?: string
}

/** POST /tasks with the CSRF header of 11.6. Answers the created TaskDetail. */
export async function createTask(page: Page, body: NewTask): Promise<{ id: string }> {
  const token = await csrfToken(page.context())
  const response = await page.request.post('/api/v1/tasks', {
    data: body,
    headers: { 'X-CSRF-Token': token },
  })
  expect(
    response.status(),
    `POST /tasks for the fixture ${JSON.stringify(body.title)} answered ` +
      `${response.status()}: ${await response.text()}`,
  ).toBe(201)
  return (await response.json()) as { id: string }
}

/** PATCH /tasks/:id. Present fields only, per 7.6. */
export async function patchTask(
  page: Page,
  id: string,
  body: Record<string, unknown>,
): Promise<void> {
  const token = await csrfToken(page.context())
  const response = await page.request.patch(`/api/v1/tasks/${id}`, {
    data: body,
    headers: { 'X-CSRF-Token': token },
  })
  expect(
    response.status(),
    `PATCH /tasks/${id} answered ${response.status()}: ${await response.text()}`,
  ).toBe(200)
}

/** One of 5.1's four transition endpoints. `tz` rides complete and abandon (7.6). */
export async function transition(
  page: Page,
  id: string,
  event: 'complete' | 'uncomplete' | 'abandon' | 'restore',
  tz?: string,
): Promise<void> {
  const token = await csrfToken(page.context())
  const query = tz === undefined ? '' : `?tz=${encodeURIComponent(tz)}`
  const response = await page.request.post(`/api/v1/tasks/${id}/${event}${query}`, {
    headers: { 'X-CSRF-Token': token },
  })
  expect(
    response.status(),
    `POST /tasks/${id}/${event} answered ${response.status()}: ${await response.text()}`,
  ).toBe(200)
}

/* ------------------------------------------------------------------ *
 * Dates
 * ------------------------------------------------------------------ */

/**
 * The date `db/seed.ts` means by "today plus N", computed the way that file
 * computes it: an offset from the current instant read as a UTC date. Specs
 * that call this pin the browser to UTC so the client's own `today` agrees.
 */
export function seedDate(daysFromToday: number): string {
  return new Date(Date.now() + daysFromToday * 86_400_000).toISOString().slice(0, 10)
}

/** The first day of the month N months from this one, as YYYY-MM-DD in UTC. */
export function firstOfMonth(monthsAhead: number): string {
  const now = new Date()
  const target = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + monthsAhead, 1),
  )
  return target.toISOString().slice(0, 10)
}

/* ------------------------------------------------------------------ *
 * Routes (spec 9.1's table)
 * ------------------------------------------------------------------ */

/**
 * The route table 9.1 gained at the P8 kickoff, restated rather than
 * imported. AC-095 asserts that a page hidden from the sidebar still renders
 * at its URL, which is unaskable without these paths being specification
 * text; every other spec here navigates through them for the same reason.
 */
export const routes = {
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

/* ------------------------------------------------------------------ *
 * Section 9's normative copy
 * ------------------------------------------------------------------ */

/**
 * Copy is normative in section 9 ("design may restyle, not reword"), so
 * every string below is transcribed character for character from the
 * numbered section named beside it. Nothing here is imported from
 * `src/client`: a suite that reads the string it asserts out of the code
 * under test asserts that the code equals itself.
 */
export const copy = {
  /** 9.1, the global offline banner. */
  offlineBanner:
    "You're offline. Dana needs a connection; changes can't be saved right now.",
  /** 9.1, the toast a write attempted offline shows. */
  offlineWriteToast: "Couldn't save. You're offline.",
  /** 9.1, the global error toast for failed requests. */
  errorToast: 'Something went wrong. Nothing was saved. Try again.',
  /** 9.3, the 8.4 warning shown before a date is cleared. */
  clearDateWarning: 'Clearing the date also ends the repeat and removes the reminder.',
  /** 9.3, the helper text on each of the three date-dependent fields. */
  dateDependentHelper: 'Set a due date first',
  /** 9.3, empty title. */
  titleRequired: 'Give it a title',
  /** 9.3, the delete confirm in the form's overflow menu. */
  deleteTaskConfirm: "Delete this task? This can't be undone.",
  /** 9.4, abandon from My Day. */
  abandonConfirm:
    'Abandon this task? It stops appearing in My Day but stays everywhere else.',
  /** 9.4, the un-pull control's label. */
  removeFromMyDay: 'Remove from My Day',
  /** 9.5, the confirm before an uncomplete that takes the G-SERIES successor. */
  uncompleteSeriesConfirm:
    'This removes the next scheduled occurrence (including any edits to it). Continue?',
  /** 9.5, the banner on a ghost's current occurrence. */
  ghostBanner: 'Upcoming occurrence of a repeating task',
  /** 9.6, the tooltip on a resend refused inside 24 hours. */
  resentRecently: 'Resent recently',
  /** 9.7, the note under the three page toggles. */
  alwaysShown: 'My Day, Tasks, and Planned are always shown.',
  /** 9.7, the danger zone's two sentences. */
  deleteAccount:
    'Folders you share will be handed to their longest-standing member. ' +
    'Private folders and their tasks are permanently deleted.',
  /** 9.8, the People screen's refusal for an address already on the roster. */
  alreadyConnected:
    "You're already connected to this person. They're in your People list.",
  /** 9.8, the roster removal confirm. */
  removeConnection:
    "Remove connection? You can still see shared folders; you'll just need a fresh invite to share new ones.",
  /** 9.9, the search overlay's footer. */
  searchFooter: 'Showing matches from every folder you can access.',
  /** 10.6, the update affordance. */
  updateAvailable: 'Update available, reload',
} as const

/** The empty states of section 6, one per page. Copy is normative. */
export const emptyState = {
  /** Q1, both My Day groups empty. */
  myDay:
    'Nothing on your day. Tasks assigned to you appear here on their due date, ' +
    'or pull anything in yourself.',
  /** Q2. */
  tasks: 'No undated tasks. Anything you capture without a date lands here.',
  /** Q3. */
  planned: 'Nothing scheduled. Give any task a due date and it moves here.',
  /** Q4. */
  important: 'Nothing marked important. Star any task and it shows up here.',
  /** Q5. */
  all: 'Nothing here yet. Add your first task with the + button.',
  /** Q6. */
  done: 'Nothing completed yet. Finished tasks build your history here.',
  /** Q7, both open sections empty. */
  folder: 'No tasks yet. Add one below.',
  /** Q8. */
  search: 'No matches for that search.',
} as const

/** 5.1's 409 copy, which 9.1 requires a conflict to show verbatim. */
export const conflictCopy = {
  completedAbandon: 'complete tasks cannot be abandoned; un-complete first',
  abandonedComplete: 'restore the task first',
  seriesRestore:
    'this repeating task has already moved on; restore is only possible on its latest occurrence',
} as const

/* ------------------------------------------------------------------ *
 * Addressing
 * ------------------------------------------------------------------ */

/**
 * The sidebar's six page links, by the names 9.1 spells for them.
 *
 * A link rather than a button: 9.1's routes are URLs and a page you can
 * reach at a URL is navigated to, which is also what makes AC-095's second
 * half meaningful.
 */
export function sidebarLink(page: Page, name: string): Locator {
  return page.getByRole('link', { name, exact: true })
}

/**
 * The floating add button of 9.1.
 *
 * Section 9 names this control without naming it: "Floating add button" is
 * its description in 9.1 and Q5's empty state calls it "the + button", so
 * unlike "New folder" or "Remove from My Day" there is no string to spell
 * back. The match is therefore on the description, and the silence is
 * escalated rather than closed here with an invented name. Every assertion
 * about this control's absence is paired with the same matcher finding it
 * on a page that must have it, so a matcher that finds nothing anywhere
 * fails loudly instead of passing as an absence.
 */
export function floatingAddButton(page: Page): Locator {
  return page.getByRole('button', { name: /add/i })
}

/**
 * Any text entry on the page other than the global search control of 9.1,
 * which every page carries and which is therefore never the quick-add row.
 */
export function textInputs(page: Page): Locator {
  return page.getByRole('textbox').filter({ hasNotText: /search/i })
}

/* ------------------------------------------------------------------ *
 * Reading what the browser computed
 * ------------------------------------------------------------------ */

/**
 * Computed style values for one element.
 *
 * These specs typecheck under `tsconfig.server.json`, whose lib is es2023
 * with node types and no DOM, which is correct: the files run in node and
 * only the callback below runs in the browser. So the one browser global a
 * callback needs is reached through a locally typed view of `globalThis`
 * rather than by widening a whole project's lib for one function.
 *
 * Reading computed style is not the same as reading markup. 9.5 states that
 * an abandoned row renders "faded and struck", and a strike-through is a
 * computed property of the rendered page whatever CSS produced it, where a
 * class name would be the implementer's internals.
 */
export async function computedStyle(
  locator: Locator,
  properties: readonly string[],
): Promise<Record<string, string>> {
  return locator.evaluate((element, props: readonly string[]) => {
    const view = globalThis as unknown as {
      getComputedStyle: (el: unknown) => Record<string, string>
    }
    const style = view.getComputedStyle(element)
    const out: Record<string, string> = {}
    for (const property of props) out[property] = String(style[property] ?? '')
    return out
  }, properties)
}

/**
 * The text a tooltip announces for a control, however the tooltip is built.
 *
 * Three mechanisms are faithful to "tooltip" and section 9 chooses none of
 * them: an element with the tooltip role, an `aria-describedby` target, and
 * the native `title` attribute. All three are read and concatenated, so an
 * assertion here pins the copy rather than the mechanism. Hover first: two
 * of the three only exist while the pointer is over the control.
 */
export async function tooltipText(locator: Locator): Promise<string> {
  await locator.hover()
  return locator.evaluate((element) => {
    const el = element as unknown as {
      getAttribute: (name: string) => string | null
      ownerDocument: {
        getElementById: (id: string) => { textContent: string | null } | null
        querySelectorAll: (s: string) => Iterable<{ textContent: string | null }>
      }
    }
    const parts: string[] = []
    const title = el.getAttribute('title')
    if (title !== null) parts.push(title)
    const describedBy = el.getAttribute('aria-describedby')
    if (describedBy !== null) {
      for (const id of describedBy.split(/\s+/)) {
        const target = el.ownerDocument.getElementById(id)
        if (target !== null) parts.push(target.textContent ?? '')
      }
    }
    const label = el.getAttribute('aria-label')
    if (label !== null) parts.push(label)
    for (const tip of el.ownerDocument.querySelectorAll('[role="tooltip"]')) {
      parts.push(tip.textContent ?? '')
    }
    return parts.join(' ').replace(/\s+/g, ' ').trim()
  })
}

/* ------------------------------------------------------------------ *
 * Watching the wire
 * ------------------------------------------------------------------ */

export interface WireLog {
  /** Every request the page made to /api/v1, in order. */
  readonly calls: { method: string; url: string; csrf: string | null }[]
  /** Requests to the view and search endpoints of 7.10. */
  viewCalls(): { method: string; url: string; csrf: string | null }[]
  /** Requests that mutate, which 7.0 and 11.6 require a CSRF header on. */
  mutations(): { method: string; url: string; csrf: string | null }[]
}

const VIEW_PATHS = /\/api\/v1\/(views\/|search|folders\/[^/]+\/tasks)/

/**
 * Records what the client actually sent. The end to end obligation of the
 * RFC 0001 P8 row is that the data layer, the tz on every view request and
 * the CSRF header on every mutation are exercised as one thing rather than
 * page by page, and this is what makes those three observable from outside
 * the client.
 */
export function watchWire(page: Page): WireLog {
  const calls: { method: string; url: string; csrf: string | null }[] = []
  page.on('request', (request: Request) => {
    const url = request.url()
    if (!url.includes('/api/v1/')) return
    calls.push({
      method: request.method(),
      url,
      csrf: request.headers()['x-csrf-token'] ?? null,
    })
  })
  return {
    calls,
    viewCalls: () => calls.filter((call) => VIEW_PATHS.test(call.url)),
    mutations: () =>
      calls.filter(
        (call) =>
          call.method !== 'GET' &&
          call.method !== 'HEAD' &&
          !call.url.includes('/auth/dev-login'),
      ),
  }
}

/** The `tz` a request carried, or null when it carried none (7.0). */
export function tzOf(url: string): string | null {
  return new URL(url).searchParams.get('tz')
}
