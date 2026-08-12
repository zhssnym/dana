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
selector. Every helper spells its control's name back character for
character and matches it exactly. That was true of only some of them when
this file was written: eight controls the section described without naming
were matched by description and escalated, and the P8 change control named
all eight on 2026-08-11, so the descriptions are gone. Exactness is not
fastidiousness here. Three of the eight names begin with the word "add" and
two of them are "More actions", so a loose match puts back exactly the
collision the naming removed, which is the reason 9.1's own paragraph gives
for the two names it explains.

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
import { expect, test } from '@playwright/test'
import type { BrowserContext, Locator, Page, Request } from '@playwright/test'

import { seedIds } from '../../db/seed.js'

export { seedIds }

/**
 * The per-test budget every spec in this leg declares, raised from
 * Playwright's 30 second default in the spec files rather than in
 * `playwright.config.ts`, which is Platform's.
 *
 * It is a property of the window this leg was written in, and it was
 * measured rather than guessed: on the first whole run, 43 of 79 cases were
 * reported as "Test timeout of 30000ms exceeded" and named nothing. Against
 * a client that renders nothing, every locator assertion waits its full
 * expect timeout before failing, so a case making several of them exhausts
 * thirty seconds partway through and the report names the clock instead of
 * the sentence. That is the same defect this suite's README records against
 * the vitest leg's missing global timeout, and it costs the same thing: a
 * red that does not say what it was measuring, arriving at the sessions
 * whose job is to make it green.
 *
 * Raising the budget rather than shortening the per-assertion wait is
 * deliberate. A shorter wait buys the same reports today and pays for them
 * with a false red later, on a page that legitimately takes its time; a
 * longer budget costs only wall clock, and only while the pages are
 * missing, because a case that passes never approaches it.
 */
export const TEST_TIMEOUT_MS = 120_000

/**
 * The per-action budget every spec declares beside the one above, and the
 * half of this that actually decides what a red says.
 *
 * Playwright gives a click, a fill or an evaluate no timeout of its own: it
 * waits out the whole test budget for an element that never appears. So a
 * case whose first action reaches for a control that does not exist yet
 * spends its entire budget inside that one call and is reported as a test
 * timeout, and raising the test budget alone makes that worse rather than
 * better, which is what the second whole run showed. Bounded here, an action
 * on a missing control fails while there is budget left for the assertions
 * after it, and the report names the role and the name it was reaching for.
 *
 * Fifteen seconds rather than something tighter because these actions drive
 * a real build against a real server on a machine that may be sharing its
 * cores, and a false red is worse than a slow one.
 */
export const ACTION_TIMEOUT_MS = 15_000

/**
 * Asserts a control is on the page, in the words of the section that puts it
 * there, and then acts on it.
 *
 * An action is not an assertion and can carry no message of its own, so a
 * click on a control that does not exist reports a locator and a timeout
 * where every other failure in this leg reports a sentence of the
 * specification. These two put the sentence back: the assertion is what
 * fails, and it fails saying which rule went unmet.
 */
export async function clickControl(locator: Locator, why: string): Promise<void> {
  await expect(locator, why).toBeVisible()
  await locator.click()
}

export async function fillControl(
  locator: Locator,
  value: string,
  why: string,
): Promise<void> {
  await expect(locator, why).toBeVisible()
  await locator.fill(value)
}

export async function checkControl(locator: Locator, why: string): Promise<void> {
  await expect(locator, why).toBeVisible()
  await locator.check()
}

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
export async function signIn(
  page: Page,
  sub: string,
  name?: string,
  email?: string,
): Promise<void> {
  // The email is named only where a criterion turns on it. 6 Q12 matches a
  // pending invite to the viewer's lowercased address, so an account that is
  // to receive one has to be provisioned at the address the invite was sent
  // to; every other spec here leaves it to default off the sub, which is what
  // keeps a seeded address from colliding on 4.1's unique email.
  // Before the first request, so a barrier reached for later has been
  // counting since the page's first navigation.
  trackApi(page)

  const body: Record<string, string> = { sub }
  if (name !== undefined) body['name'] = name
  if (email !== undefined) body['email'] = email
  const response = await page.request.post('/api/v1/auth/dev-login', { data: body })
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

/**
 * A row title unique to the case that creates it.
 *
 * The runner seeds once and never resets, so two cases in one file that
 * create "the same" row leave two rows behind, and every locator addressing
 * that title afterwards resolves to both. This file's own header states the
 * rule, and six cases broke it: the first case of each pair passed while
 * only one row existed and the second failed on strict mode, which is a
 * failure that looks like a client defect and is not one.
 *
 * The repair is uniqueness per case rather than cleanup between cases,
 * because cleanup fights the shared database that the single worker and the
 * single seed exist to give us. A case's own rows are its own, they outlive
 * it harmlessly, and the next case's locators cannot see them.
 *
 * The tag is `testInfo.testId`, which is stable for a given case across
 * runs and distinct between any two cases, so a title is reproducible from
 * one run to the next and still cannot collide. Callable only inside a test
 * or a hook, which is why the titles it builds are locals rather than the
 * module constants they replaced: a constant is computed once per file and
 * that is exactly the scope that was too wide.
 */
export function caseTitle(base: string): string {
  return `${base} ${test.info().testId}`
}

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

/**
 * PATCH /me/settings with the CSRF header of 11.6.
 *
 * 9.1 puts six pages in the sidebar "each present only if permanent or
 * toggled visible", and 9.7 owns the three toggles that decide the other
 * half. A criterion asserting all six entries therefore has to put the
 * account into the state where all six are visible rather than assume it,
 * which is what this is for; the defaults are 9.7's and not this suite's to
 * depend on.
 */
export async function patchSettings(
  page: Page,
  body: Record<string, boolean>,
): Promise<void> {
  const token = await csrfToken(page.context())
  const response = await page.request.patch('/api/v1/me/settings', {
    data: body,
    headers: { 'X-CSRF-Token': token },
  })
  expect(
    response.status(),
    `PATCH /me/settings answered ${response.status()}: ${await response.text()}`,
  ).toBe(200)
}

/* ------------------------------------------------------------------ *
 * Sequencing a server read after an interaction
 * ------------------------------------------------------------------ */

/**
 * How long the API must stay quiet before a barrier calls an interaction
 * finished.
 *
 * The window is the whole point rather than a flake guard. A save that takes
 * two serialised round trips, a task write and then frozen 7.9's, is idle in
 * the gap between them, so a barrier that returned at the first moment of
 * zero in flight would return inside the save it is supposed to be waiting
 * for. Against a local server a round trip is single-digit milliseconds, so
 * this is generous by two orders of magnitude and costs a quarter second per
 * barrier.
 */
const API_SETTLE_MS = 250

interface ApiTraffic {
  inFlight: number
  quietSince: number
}

const traffic = new WeakMap<Page, ApiTraffic>()

/**
 * Starts counting this page's requests to the API, once per page.
 *
 * Installed by `signIn`, which every spec in this leg calls before it does
 * anything else, so a barrier can be reached for at any point afterwards and
 * will have been counting since before the first navigation.
 */
export function trackApi(page: Page): void {
  if (traffic.has(page)) return
  const state: ApiTraffic = { inFlight: 0, quietSince: Date.now() }
  traffic.set(page, state)
  const isApi = (request: Request): boolean => request.url().includes('/api/v1/')
  page.on('request', (request) => {
    if (!isApi(request)) return
    state.inFlight += 1
    state.quietSince = Date.now()
  })
  const settled = (request: Request): void => {
    if (!isApi(request)) return
    state.inFlight = Math.max(0, state.inFlight - 1)
    state.quietSince = Date.now()
  }
  page.on('requestfinished', settled)
  page.on('requestfailed', settled)
}

/**
 * Waits until everything the page was going to send has been sent and
 * answered.
 *
 * This is what orders a `page.request` read after an interaction. The two are
 * different HTTP clients: a spec's read goes out on Playwright's own context
 * and is not queued behind whatever the page has in flight, so a case that
 * clicks and then reads is asking the server a question while the answer is
 * still being written. It passed on this machine and would fail on a client
 * one round trip slower, which is a false red against an implementation that
 * satisfies the criterion.
 *
 * Transport-agnostic on purpose. AC-169's and AC-170's own texts refuse to
 * fix which requests a save makes, so waiting for a named endpoint would
 * encode the transport the criteria decline to name; what is waited on is
 * that the page has stopped talking, whatever it said.
 */
export async function waitForApiIdle(page: Page, why: string): Promise<void> {
  trackApi(page)
  const state = traffic.get(page)
  if (state === undefined) throw new Error('unreachable: tracker installed above')

  const deadline = Date.now() + 15_000
  for (;;) {
    if (state.inFlight === 0 && Date.now() - state.quietSince >= API_SETTLE_MS) return
    if (Date.now() > deadline) {
      expect(
        state.inFlight,
        `${why}. Fifteen seconds after the interaction the page still had ${state.inFlight} ` +
          'requests to /api/v1 in flight, so nothing here can read the server and know what ' +
          'it is reading',
      ).toBe(0)
      return
    }
    await page.waitForTimeout(25)
  }
}

/**
 * The barrier a spec crosses between saving the task form and reading what
 * the server stored.
 *
 * Two signals rather than one, and each covers what the other cannot. The
 * form closes only once every write of that save has settled, so its
 * disappearance is the application's own report that the save finished; and
 * API quiet catches whatever follows it, including the 8.3 refetch, which on
 * a single-connection backend (11.15) is exactly what was landing between a
 * save's two writes.
 *
 * The dialog half is synchronization and not an assertion of section 9, which
 * spells no closing behavior. It is written as an expectation anyway so that
 * a client which stopped closing the form fails here saying so, rather than
 * somewhere later saying something else.
 */
export async function waitForSaveToSettle(page: Page): Promise<void> {
  await expect(
    page.getByRole('dialog'),
    'the task form closes once every write of the save has settled, which is what makes its ' +
      'disappearance the signal a read can be sequenced behind rather than a guess at one',
  ).toHaveCount(0)
  await waitForApiIdle(page, 'the save had to finish before the stored row could be read')
}

/* ------------------------------------------------------------------ *
 * The reminder the form writes (9.3, frozen 7.6 and 7.9)
 * ------------------------------------------------------------------ */

export interface StoredReminder {
  offset_minutes: number | null
  time_of_day: string | null
}

/** The task the form saved, found by the title the case typed into it. */
export async function findTaskId(page: Page, title: string): Promise<string> {
  const found = await page.request.get(
    `/api/v1/search?q=${encodeURIComponent(title)}&tz=UTC`,
  )
  expect(
    found.status(),
    `GET /search answered ${found.status()}: ${await found.text()}`,
  ).toBe(200)
  const rows = ((await found.json()) as { rows: { id: string; title: string }[] }).rows.filter(
    (row) => row.title === title,
  )
  expect(
    rows.length,
    `exactly one task is titled ${JSON.stringify(title)}; the server holds ${rows.length}. ` +
      'A zero here is the save failing rather than the reminder failing',
  ).toBe(1)
  const row = rows[0]
  if (row === undefined) throw new Error('unreachable: length asserted above')
  return row.id
}

/**
 * What the server holds for a task's reminder, read through frozen 7.0's
 * TaskDetail rather than off the form. That is what makes AC-169 and AC-170
 * discriminate: a client holding the value in memory and rendering it back
 * into the form satisfies every assertion made against the form.
 */
export async function storedReminder(
  page: Page,
  taskId: string,
): Promise<StoredReminder | null> {
  const detail = await page.request.get(`/api/v1/tasks/${taskId}`)
  expect(
    detail.status(),
    `GET /tasks/:id answered ${detail.status()}: ${await detail.text()}`,
  ).toBe(200)
  return ((await detail.json()) as { reminder: StoredReminder | null }).reminder
}

/**
 * Sets the reminder the form is currently offering and reports what it holds.
 *
 * 9.3 gives the control two modes and this dispatches on the one that is
 * there, the way `chooseOption` dispatches, so a case states a mode rather
 * than a widget. The value comes back out of the control rather than being
 * fixed here, which is what lets an assertion compare the stored row to the
 * form instead of to a number this suite invented: 9.3 calls the offset
 * control preset-driven and which presets it offers is the implementer's.
 *
 * `skip` lets a case ask for a different offset than one it already used,
 * which is what AC-170's change arm needs.
 */
export async function setOfferedReminder(
  page: Page,
  skip?: string,
): Promise<{ mode: 'offset_minutes' | 'time_of_day'; value: string }> {
  const control = formField(page, 'reminder')
  await expect(
    control,
    'spec 9.3: the reminder is visible when the form is expanded and enabled once a date is ' +
      'set, so there is a control to offer a reminder through',
  ).toBeVisible()

  const tag = await control.evaluate((element) =>
    String((element as unknown as { tagName?: string }).tagName ?? '').toLowerCase(),
  )
  if (tag === 'select') {
    const value = await control.evaluate((element, avoid: string | undefined) => {
      const select = element as unknown as { options: Iterable<{ value: string }> }
      for (const option of select.options) {
        if (option.value !== '' && option.value !== avoid) return option.value
      }
      return ''
    }, skip)
    expect(
      value,
      'spec 9.3: with a due time the reminder control is an offset picker, so it offers at ' +
        'least one offset to pick' +
        (skip === undefined ? '' : ', and at least two where a case changes one'),
    ).not.toBe('')
    await control.selectOption(value)
    return { mode: 'offset_minutes', value }
  }

  const time = skip === '09:00' ? '17:30' : '09:00'
  await fillControl(
    control,
    time,
    'spec 9.3: without a due time the reminder control is a time-of-day picker',
  )
  return { mode: 'time_of_day', value: time }
}

/**
 * Puts the reminder control back to holding nothing, whichever mode it is in.
 * 9.3's removal is a person emptying the control, and frozen 7.9 makes the
 * write behind it DELETE /tasks/:id/reminder, no task body expressing one.
 */
export async function clearOfferedReminder(page: Page): Promise<void> {
  const control = formField(page, 'reminder')
  await expect(
    control,
    'spec 9.3: the reminder control is on the form to be emptied',
  ).toBeVisible()
  const tag = await control.evaluate((element) =>
    String((element as unknown as { tagName?: string }).tagName ?? '').toLowerCase(),
  )
  if (tag === 'select') {
    await control.selectOption('')
    return
  }
  await control.fill('')
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
  /**
   * 9.1's inline state copy, written at the second P8 change control because
   * three of the five states section 9 gives every page had no words at all.
   * The truncation notice sits here beside the two AC-171 asserts so that it
   * is one string chosen once rather than one per page, which is the reason
   * 9.1 gives for writing it down while asserting it nowhere.
   */
  readFailed: "Couldn't load this. Nothing was changed.",
  notFound: 'Not found. This may have been deleted, or it may never have been yours to see.',
  truncated:
    'This list is long, so only the first part is shown. Narrow it down to see the rest.',
  /** 9.6's two confirmations, whose names come from the row they act on. */
  leaveFolder: (folder: string) =>
    `Leave ${folder}? You lose access to it, and anything in it assigned to you becomes unassigned.`,
  removeMember: (member: string, folder: string) =>
    `Remove ${member} from ${folder}? They lose access, and anything in this folder assigned ` +
    'to them becomes unassigned.',
  /**
   * 9.6's delete confirm, whose folder name and three counts come from the
   * folder it acts on, exactly as the two above take theirs from a row.
   *
   * Written down here at the RFC 0002 change control because AC-183 asserts
   * it as one of nine strings and AC-162 already spells it inline; a string
   * this suite asserts from two files is one string or it is two things to
   * keep in step with one specification.
   */
  deleteFolder: (folder: string, open: number, completed: number, abandoned: number) =>
    `Delete ${folder}? This permanently deletes ${open} open, ${completed} completed, ` +
    `and ${abandoned} abandoned tasks for every member.`,
  /** 9.3, the 8.4 warning shown before a date is cleared. */
  clearDateWarning: 'Clearing the date also ends the repeat and removes the reminder.',
  /** 9.3, the helper text on each of the three date-dependent fields. */
  dateDependentHelper: 'Set a due date first',
  /** 9.3, empty title. */
  titleRequired: 'Give it a title',
  /** 9.3, the steps editor's cap notice, spelled at the P8 change control. */
  stepCapNotice: 'Limit 50 steps',
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
 * The sidebar of 9.1, which 9.1's roles table fixes as a navigation landmark
 * at the RFC 0002 change control on 2026-08-13.
 *
 * A landmark rather than a container this file recognises some other way,
 * because that table's ground is the section's own: the sidebar is 9.1's only
 * chrome and holds the page set, and a landmark is what lets a person skip to
 * it. AC-174 asserts the landmark itself; every helper below that scopes to
 * the sidebar reads it through here so the suite has one answer to what the
 * sidebar is.
 */
export function sidebar(page: Page): Locator {
  return page.getByRole('navigation')
}

/**
 * The inline quick-add of 9.1 in its collapsed state, a single control
 * carrying the same name its text box carries.
 *
 * One name across two states is 9.1's own ruling of 2026-08-13: collapsed it
 * is a control and expanded it is a text box, they are never on the page at
 * the same time, and they are one affordance to the person using them. The
 * distinction the name has to survive is against the floating add button on
 * the same page, which is what "Add task" against "Add a task" was chosen
 * for and which the state does not affect. So this is exact for the reason
 * `floatingAddButton` is exact.
 */
export function quickAddControl(page: Page): Locator {
  return page.getByRole('button', { name: 'Add a task', exact: true })
}

/**
 * The floating add button of 9.1, named "Add task" by the 9.1 control table
 * added at the P8 change control on 2026-08-11.
 *
 * Exact, and this is the one place in this file where exactness is the whole
 * point rather than good practice. Until that table landed this matched
 * `/add/i` on a description, because Q5 called the control "the + button" and
 * nothing spelled a name; that regex also matches "Add a task" and "Add
 * step", which are two other controls of the same section, and matching
 * loosely now would put back precisely the collision the naming removed.
 * 9.1's own paragraph says as much: "Add task" was chosen to separate this
 * control from the quick-add row beneath it on the same page.
 */
export function floatingAddButton(page: Page): Locator {
  return page.getByRole('button', { name: 'Add task', exact: true })
}

/**
 * The inline quick-add row of 9.1, named "Add a task", the words the design
 * brief already used for it.
 *
 * This replaces a helper that matched every text box whose name did not
 * contain "search", which was the best available reading while the row had
 * no name: an input carries no text content, so nothing but the name
 * distinguishes a quick-add row from a rename field or a search box. The
 * name makes that exact, and it makes AC-096's absence assertion say what
 * the criterion says rather than "no text entry of any kind".
 */
export function quickAddInput(page: Page): Locator {
  return page.getByRole('textbox', { name: 'Add a task', exact: true })
}

/**
 * A named region of 9.1's sections rule, which is how a control inside a
 * page section is addressed: that control within that region.
 *
 * The rule exists because qualifying controls does not scale where the data
 * decides how many there are, and it earns its keep wherever section 9 names
 * one control twice. The folder page is the case that forced it into this
 * file: 9.6 puts an overflow menu in the header, which is a third control
 * answering to "More actions" after the task form's and a task row's, and
 * reaching it as the first match on the page is addressing by position,
 * which this suite may not do. The second P8 change control named "Folder
 * header" and "Sharing panel" for exactly that, declining a third name for
 * the menu itself on the ground that the two named menus share their name
 * deliberately.
 *
 * Exact, for the same reason every control match here is exact.
 */
export function regionOf(page: Page, name: string): Locator {
  return page.getByRole('region', { name, exact: true })
}

/**
 * One task row, addressed by the accessible grouping role a list of rows
 * carries and by the title it shows.
 *
 * Section 9 calls these rows and enumerates what is in one (9.4's row
 * elements), so a row is a real thing in the specification rather than a
 * div this suite is guessing at; what section 9 leaves free is whether the
 * page builds its list as a list or as a grid, so both accessible shapes
 * are admitted and nothing else is. The title is content, not markup.
 */
export function taskRow(page: Page, title: string): Locator {
  return page.getByRole('listitem').or(page.getByRole('row')).filter({ hasText: title })
}

/**
 * The names of the options one of 9.3's pickers offers, whatever it is
 * built from. Dispatches on the element for the reason `chooseOption` does.
 */
export async function optionLabels(page: Page, field: Locator): Promise<string[]> {
  const tag = await field.evaluate((element) =>
    String((element as unknown as { tagName?: string }).tagName ?? '').toLowerCase(),
  )
  if (tag === 'select') {
    return field.evaluate((element) => {
      const select = element as unknown as {
        options: Iterable<{ textContent: string | null }>
      }
      const out: string[] = []
      for (const option of select.options) {
        out.push((option.textContent ?? '').replace(/\s+/g, ' ').trim())
      }
      return out
    })
  }
  await field.click()
  const texts = await page.getByRole('option').allTextContents()
  return texts.map((text) => text.replace(/\s+/g, ' ').trim())
}

/**
 * A field of the 9.3 task form, addressed by the name that section gives it.
 *
 * By accessible name across roles rather than by role plus name, because
 * 9.3's ten fields are ten different roles: title is a text box, important a
 * switch, folder and assignee combo boxes, steps a group. What 9.1's
 * addressing sentence fixes is that the name announces and the name
 * addresses, and a label is exactly that binding.
 *
 * Matched case-insensitively and anchored. 9.3 writes its field names in
 * running prose ("due date", "due time"), where a rendered label is
 * capitalized, and a capital letter is not a rewording; anchoring keeps
 * "due date" from also matching "due date reminder" if an implementation
 * ever spells one that way.
 */
export function formField(page: Page, name: string): Locator {
  return page.getByLabel(new RegExp(`^\\s*${name}\\s*$`, 'i'))
}

/**
 * What a control currently holds, whatever kind of control it is.
 *
 * `inputValue()` would be enough for the text fields and throws on the
 * others, and 9.3's "empty" covers all ten. So the value is read where a
 * control has one and its rendered text where it does not, which is what a
 * person reading the form would call its contents.
 */
export async function fieldValue(locator: Locator): Promise<string> {
  return locator.evaluate((element) => {
    const el = element as unknown as { value?: unknown; textContent: string | null }
    if (typeof el.value === 'string') return el.value
    return (el.textContent ?? '').replace(/\s+/g, ' ').trim()
  })
}

/**
 * What a person reads in a control, where `fieldValue` reads what the form
 * would submit. A folder select holds a uuid and shows a folder name, and
 * 9.3's entry-point table names folders.
 */
export async function fieldDisplay(locator: Locator): Promise<string> {
  return locator.evaluate((element) => {
    const el = element as unknown as {
      selectedOptions?: Iterable<{ textContent: string | null }>
      value?: unknown
      textContent: string | null
    }
    if (el.selectedOptions !== undefined) {
      const labels: string[] = []
      for (const option of el.selectedOptions) labels.push((option.textContent ?? '').trim())
      return labels.join(', ')
    }
    if (typeof el.value === 'string' && el.value !== '') return el.value
    return (el.textContent ?? '').replace(/\s+/g, ' ').trim()
  })
}

/**
 * Picks a named option from one of 9.3's preset-driven controls.
 *
 * 9.1's addressing sentence fixes how a control is identified and says
 * nothing about how it is built, which is deliberate: section 9 specifies
 * structure, states and copy, not widgets. So this dispatches on what the
 * element turned out to be rather than assuming a native select or assuming
 * a listbox, and a spec above stays a statement about the option's name.
 */
export async function chooseOption(page: Page, field: Locator, label: string): Promise<void> {
  const tag = await field.evaluate((element) =>
    String((element as unknown as { tagName?: string }).tagName ?? '').toLowerCase(),
  )
  if (tag === 'select') {
    await field.selectOption({ label })
    return
  }
  await field.click()
  await page.getByRole('option', { name: label, exact: true }).click()
}

/**
 * Waits for the 10.6 service worker to be controlling this page, which is
 * the state AC-091's "one prior online load" describes.
 *
 * A timeout here is converted into a named assertion rather than left as a
 * Playwright error, because an error says only that five seconds passed
 * while the assertion says which sentence of 10.6 went unmet.
 */
export async function expectServiceWorkerControl(page: Page): Promise<void> {
  const controlled = await page
    .waitForFunction(
      () => {
        const view = globalThis as unknown as {
          navigator?: { serviceWorker?: { controller: unknown } }
        }
        return (view.navigator?.serviceWorker?.controller ?? null) !== null
      },
      undefined,
      { timeout: 20_000 },
    )
    .then(() => true)
    .catch(() => false)
  expect(
    controlled,
    'spec 10.6: the service worker precaches the versioned application shell, and nothing ' +
      'below can be asked of a page no service worker controls. Twenty seconds after an ' +
      'online load of this page, navigator.serviceWorker.controller was still null',
  ).toBe(true)
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
 * `#RRGGBB` as the browser reports a computed colour, so a hex from the wire
 * can be compared with what was painted.
 */
export function hexToRgb(hex: string): string {
  const value = hex.replace('#', '')
  const part = (at: number): number => Number.parseInt(value.slice(at, at + 2), 16)
  return `rgb(${part(0)}, ${part(2)}, ${part(4)})`
}

/**
 * Every colour the browser painted anywhere inside one element.
 *
 * 9.1's colour dot is not a control and not a region, so neither the
 * addressing sentence nor the sections rule reaches it, and it is decorative
 * enough that an accessible implementation may give it no role at all. What
 * can be held to without naming an implementation is the paint: whether this
 * folder's own colour appears somewhere in this folder's row, and whether two
 * rows carrying different colours were painted differently.
 *
 * Several properties rather than `background-color` alone, because a dot is
 * as reasonably a bordered span, a filled SVG or a bullet as it is a filled
 * box, and which of those it is belongs to the implementer. Reading the
 * computed value covers a colour delivered through a custom property too,
 * since the browser resolves it before reporting.
 */
export async function paintedColors(locator: Locator): Promise<string[]> {
  return locator.evaluate((element) => {
    const view = globalThis as unknown as {
      getComputedStyle: (el: unknown) => Record<string, string>
    }
    const root = element as unknown as {
      querySelectorAll: (s: string) => Iterable<unknown>
    }
    const properties = [
      'backgroundColor',
      'color',
      'borderTopColor',
      'borderRightColor',
      'borderBottomColor',
      'borderLeftColor',
      'outlineColor',
      'fill',
      'stroke',
    ]
    const found = new Set<string>()
    const collect = (node: unknown): void => {
      const style = view.getComputedStyle(node)
      for (const property of properties) {
        const value = String(style[property] ?? '')
        if (value !== '' && value !== 'none') found.add(value)
      }
    }
    collect(element)
    for (const child of root.querySelectorAll('*')) collect(child)
    return [...found]
  })
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
export async function tooltipText(locator: Locator, why: string): Promise<string> {
  await expect(locator, why).toBeVisible()
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
 * Copy delivered whole (AC-183)
 * ------------------------------------------------------------------ */

/**
 * Every text node in the document, whitespace normalized the way Playwright's
 * own text engine normalizes it. Diagnostics for the assertion below, not the
 * assertion itself.
 */
export async function textRuns(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const view = globalThis as unknown as {
      document: {
        body: unknown
        createTreeWalker: (
          root: unknown,
          whatToShow: number,
        ) => { nextNode: () => { nodeValue: string | null } | null }
      }
    }
    // 4 is NodeFilter.SHOW_TEXT. Named by its value because these specs
    // typecheck with no DOM lib, correct because they run in node and only
    // this callback runs in the browser.
    const walker = view.document.createTreeWalker(view.document.body, 4)
    const out: string[] = []
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      const text = (node.nodeValue ?? '').replace(/\s+/g, ' ').trim()
      if (text !== '') out.push(text)
    }
    return out
  })
}

/**
 * Asserts section 9 wrote this sentence and the page delivered it whole.
 *
 * **What "one text run" is, measured rather than assumed.** Playwright's text
 * engine was measured on 2026-08-13 against the four shapes this criterion has
 * to tell apart, and it draws the line exactly where AC-183 draws it:
 *
 * | Shape | `getByText` |
 * | - | - |
 * | `<h2>Leave Work?</h2><p>You lose access.</p>` | no match |
 * | `<span>Leave Work?</span> <span>You lose access.</span>` | matches |
 * | `Leave <span>Work</span>? You lose access.` | matches |
 * | one text node | matches |
 *
 * The first row is the shape RFC 0002 measured in the designer's prototype
 * for 9.4's abandon confirm and 9.8's remove-connection confirm, an
 * AlertDialogTitle and an AlertDialogDescription inside one header, and the
 * engine refuses it: a block boundary is where a reader stops hearing one
 * sentence, and it is where this stops matching. The third row is section
 * 9.6's three confirmations, which are one sentence with a folder or a member
 * in the middle, and the engine admits them, which is right: a person reading
 * "Leave Work?" cannot tell whether the folder's name arrived in its own
 * element. So this delegates rather than reimplementing.
 *
 * That is a correction. This helper first walked text nodes, which failed the
 * third row too, and would have failed a port that rendered an interpolated
 * name in a span while delivering the sentence perfectly. A criterion that
 * fails a correct implementation is worse than no criterion, because the
 * session it lands on will change working code to satisfy it.
 *
 * The failure message carries the runs that share the sentence's words,
 * because the two ways this fails read identically from a locator count: the
 * string is absent, or the string is on the page in pieces. Naming the pieces
 * is what turns a red into an instruction.
 */
export async function expectOneTextRun(
  page: Page,
  text: string,
  why: string,
): Promise<void> {
  const found = page.getByText(text)
  try {
    await expect(found, why).not.toHaveCount(0)
  } catch (failure) {
    const runs = await textRuns(page)
    const opening = text.slice(0, 18)
    const near = runs.filter(
      (run) => run.includes(opening) || text.includes(run.slice(0, 18)),
    )
    expect(
      near,
      `${why}. Nothing on the page carried ${JSON.stringify(text)} as one run. These runs ` +
        'shared its words: an empty list is the string absent or reworded, and a list holding ' +
        'its halves is the string delivered in pieces, which is what AC-183 is about',
    ).toEqual([text])
    throw failure
  }
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
