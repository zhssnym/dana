/*
Harness for the P4 views and search criteria (AC-045 to AC-058 and AC-070,
plus the coverage findings this session routes for amendment), built on the
P2 folder layer and the P3 task layer: the same booted application, stub
identity provider, cookie-jar browsers, lazily signed-in casts, the 7.0
TaskCard shape restated once in tasks-harness.ts and asserted key-exact, and
the invariant sweep scoped to named rows.

Six decisions worth the words.

**This package writes nothing, so its fixtures are written directly.** Every
earlier layer sets up through the endpoints of the package under test,
because a broken create should fail that package's files on one attributable
sentence. P4 has no create: it is nine read endpoints, and every defect
available to it is an ordering, a predicate, a scope, or a cursor. So the
fixtures are inserted here with every column named, which is what the
orderings need. Q2 sorts by created_at descending, Q6 pages by completed_at,
and Q8 sorts by updated_at descending; none of those columns can be dictated
through 7.6, whose transitions stamp them with the clock. Rows are inserted
rather than requested for that reason and no other, and each file sweeps the
invariants over its own fixture, so a seed that violated section 3 fails as
a bad fixture instead of passing as a good result.

**today(tz) is computed here and never imported.** The date predicates of Q1
and Q3C live in `src/server/time/**`, which the Scheduling engineer writes in
the session after this one. Importing them would borrow the definition of
correct from the module under test, the standing Steward ruling this suite's
timezone predicate already follows; a wrong helper would then agree with
itself and every date criterion in the package would pass vacuously. The
oracle here is Intl, reached through formatToParts rather than through a
locale whose format is a convention, and the arithmetic below is calendar
arithmetic on YYYY-MM-DD strings, never on instants.

**Two zones exactly one calendar day apart at every instant.** AC-050 names
Asia/Karachi and Europe/London at 2026-07-23 20:30 UTC, an instant no test
can produce: faking the clock would decide, for the implementer, that today
is computed from the process clock rather than from the database, and both
are defensible readings of 8.1's "the server computes it", so the test would
be a false red against half of them. The criterion's real content is that one
instant is two different days for two zones, and it survives the loss of the
instant intact if the zone pair is chosen so the split holds always. Measured
rather than recalled, at every hour of 2026: Pacific/Kiritimati (UTC+14, no
DST) is exactly one calendar day ahead of Pacific/Honolulu (UTC-10, no DST)
at all 8760 samples, because their offsets differ by exactly 24 hours and
neither observes DST. At the criterion's own instant those two zones read
2026-07-24 and 2026-07-23, which are the criterion's own two local dates. The
named pair is asserted too, in the one direction that is unconditional: each
zone's own today is Today in that zone.

**Fixtures anchor on a zone whose local time is near midday.** A date-relative
fixture seeded moments before local midnight and read moments after is stale
through nobody's fault. middayZone() picks, from twenty-five zones measured
DST-free with whole-hour offsets at every hour of 2026, whichever is nearest
12:00 local right now,
which puts at least eleven hours between the fixture and either boundary. The
choice is a function of the instant, not of any assertion: no case branches on
it, and the residual is caught by expectStillSameDay rather than tolerated.

**The nine 7.10 envelopes are restated here and asserted key-exact**, the way
tasks-harness.ts restates the two 7.0 shapes and for the same standing
ruling: this suite measures `app/src/shared/` and cannot borrow its
definition of correct. Every row of every envelope is parsed through the 7.0
TaskCard check, which is the guard the RFC 0001 P4 row asks for by name: this
package necessarily writes a second producer of that frozen shape, because
`taskView` in `domain/tasks.ts` produces one card at a time and no list
endpoint can call it per row.

Three of those shapes were silences when this layer was written and are text
now, all escalated from P4 and entered by owner ruling on 2026-08-07. Frozen
7.10 enumerates its ninth body: GET /folders/:id/tasks answers scheduled,
unscheduled and truncated on section=open, and days with next_cursor on
section=completed, which are the key names the other eight bodies already use
for the same things. The `folder` inside groups, and inside the tasks_groups
of GET /views/all, is the {id, name, is_default} stub every TaskCard carries
rather than the 7.0 Folder object, so expectGroups asserts it key-exact like
every other shape here instead of at the intersection of two readings. And
`section` defaults to open when absent, which AC-058 asserts and the typed
readers below still send explicitly, each naming the section it is for.

**Orders are asserted as whole sequences.** Section 6 ends every order in id
so that any two agents produce byte-identical sequences, and a membership
assertion cannot fail on an order. Each file's actor is its own, and views are
scoped to ACCESSIBLE(V), so a response carries that file's rows and nothing
else; there is no reason to assert a subsequence.
*/
import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'
import { expect } from 'vitest'

import type { Db } from '../../db/client.js'
import type { Actor } from './folders-harness.js'
import {
  addMemberOk,
  connect,
  createFolder,
  expectStatus,
} from './folders-harness.js'
import type { RawResponse } from './http-client.js'
import { rows } from './helpers.js'
import {
  asRecord,
  expectExactKeys,
  expectTaskCardShape,
} from './tasks-harness.js'

/* ------------------------------------------------------------------ *
 * Timezone arithmetic, computed here and never imported
 * ------------------------------------------------------------------ */

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

function partsIn(tz: string, at: Date): Record<string, number> {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(at)
  const found: Record<string, number> = {}
  for (const part of parts) {
    if (part.type !== 'literal') found[part.type] = Number(part.value)
  }
  return found
}

function two(value: number): string {
  return String(value).padStart(2, '0')
}

/** The civil date in tz at an instant, in 4.11's format. Assembled from
 * formatToParts rather than taken from a locale, whose ordering is a
 * convention this suite would then be depending on. */
export function localDateIn(tz: string, at: Date = new Date()): string {
  const parts = partsIn(tz, at)
  const year = parts.year ?? Number.NaN
  const month = parts.month ?? Number.NaN
  const day = parts.day ?? Number.NaN
  return `${String(year).padStart(4, '0')}-${two(month)}-${two(day)}`
}

/** Local hour of day, 0 to 23. Intl renders midnight as hour 24 under
 * hour12:false in some ICU versions, so it is folded here. */
export function localHourIn(tz: string, at: Date = new Date()): number {
  return (partsIn(tz, at).hour ?? 0) % 24
}

/** today(V) as section 8.1 defines it: the current date in tz at the moment
 * of evaluation. */
export function todayIn(tz: string): string {
  return localDateIn(tz, new Date())
}

/** Calendar arithmetic on a floating date. Anchored at UTC noon so that no
 * shift can land on a boundary the host's own zone would move. */
export function shiftDate(date: string, days: number): string {
  expect(
    DATE_ONLY.test(date),
    `shiftDate needs a 4.11 calendar date; got ${JSON.stringify(date)}`,
  ).toBe(true)
  const [year, month, day] = date.split('-').map(Number) as [
    number,
    number,
    number,
  ]
  const at = new Date(Date.UTC(year, month - 1, day, 12))
  at.setUTCDate(at.getUTCDate() + days)
  return at.toISOString().slice(0, 10)
}

/** Whole days from a to b, positive when b is later. */
export function daysBetween(a: string, b: string): number {
  return Math.round(
    (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000,
  )
}

/*
Exactly 24 hours apart, neither observing DST, so the ahead zone's civil date
is the behind zone's plus one at every instant of every year. Measured hourly
across 2026 before this file was written; the pair is the whole reason AC-050
can be asserted without owning the clock.
*/
export const ZONE_AHEAD = 'Pacific/Kiritimati'
export const ZONE_BEHIND = 'Pacific/Honolulu'

/*
Twenty-five zones measured DST-free with whole-hour offsets across all of
2026, covering UTC-11 to UTC+12 and UTC+14. The gap at UTC+13 costs nothing:
the worst case leaves a chosen zone one hour from midday and eleven from
either midnight.
*/
export const FIXED_OFFSET_ZONES = [
  'Pacific/Kiritimati',
  'Pacific/Tarawa',
  'Pacific/Guadalcanal',
  'Australia/Brisbane',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Bangkok',
  'Asia/Dhaka',
  'Asia/Karachi',
  'Asia/Dubai',
  'Africa/Nairobi',
  'Africa/Johannesburg',
  'Africa/Lagos',
  'UTC',
  'Atlantic/Cape_Verde',
  'America/Noronha',
  'America/Argentina/Buenos_Aires',
  'America/Puerto_Rico',
  'America/Panama',
  'America/Guatemala',
  'America/Phoenix',
  'Pacific/Pitcairn',
  'Pacific/Gambier',
  'Pacific/Honolulu',
  'Pacific/Niue',
] as const

/**
 * The zone whose local time is nearest midday right now, so a date-relative
 * fixture cannot straddle a local midnight between being seeded and being
 * read. A function of the instant alone: no assertion branches on which zone
 * it returns, and every file names the zone it ran in when it fails.
 */
export function middayZone(at: Date = new Date()): string {
  let best = 'UTC'
  let bestDistance = Number.POSITIVE_INFINITY
  for (const zone of FIXED_OFFSET_ZONES) {
    const distance = Math.abs(localHourIn(zone, at) - 12)
    if (distance < bestDistance) {
      bestDistance = distance
      best = zone
    }
  }
  return best
}

/** Minutes tz is ahead of UTC at an instant. Constant for every zone in the
 * list above, which is what makes instantAtLocal exact for them. */
export function offsetMinutesIn(tz: string, at: Date = new Date()): number {
  const parts = partsIn(tz, at)
  const asUtc = Date.UTC(
    parts.year ?? 0,
    (parts.month ?? 1) - 1,
    parts.day ?? 1,
    (parts.hour ?? 0) % 24,
    parts.minute ?? 0,
  )
  return (asUtc - at.getTime()) / 60_000
}

/**
 * The instant at which a chosen wall clock reads in tz. Restricted to the
 * DST-free list, where the offset is a constant and there is therefore no
 * gap to fall into and no ambiguity to resolve: 11.15 forbids leaning on
 * Luxon's raw behavior for the fire instants of 8.6, and the same caution
 * applies to building one by hand.
 */
export function instantAtLocal(
  tz: string,
  date: string,
  hour: number,
  minute = 0,
): Date {
  expect(
    FIXED_OFFSET_ZONES as readonly string[],
    `instantAtLocal is exact only for the measured DST-free zones; ${tz} is not one`,
  ).toContain(tz)
  const [year, month, day] = date.split('-').map(Number) as [
    number,
    number,
    number,
  ]
  const offset = offsetMinutesIn(tz)
  return new Date(Date.UTC(year, month - 1, day, hour, minute) - offset * 60_000)
}

/**
 * A zone that crossed local midnight strictly inside (from, to], so an
 * instant at or before `from` falls on yesterday there while `to` and
 * everything after it falls on today. Callers leave a margin at the `to` end
 * so the roll is safely in the past by the time the case runs, and the
 * hourly offsets of the list guarantee a zone for any window of an hour or
 * more. Asserted rather than assumed: a tzdb without them would make the
 * case vacuous instead of red.
 */
export function zoneRolledBetween(from: Date, to: Date): string {
  const found = FIXED_OFFSET_ZONES.find(
    (zone) => localDateIn(zone, from) !== localDateIn(zone, to),
  )
  expect(
    found,
    `no zone in the measured list crossed local midnight between ${from.toISOString()} and ${to.toISOString()}, so this case has nothing to compare`,
  ).toBeDefined()
  return found as string
}

/** The residual midnight guard: a fixture anchored on today(tz) is only
 * meaningful while tz is still on that date. Fails loudly rather than
 * quietly producing a wrong answer somewhere downstream. */
export function expectStillSameDay(
  tz: string,
  anchor: string,
  why: string,
): void {
  expect(
    todayIn(tz),
    `${why}: the fixture was anchored on ${anchor} in ${tz} and that zone has since rolled over, so this run measured a different day than it seeded`,
  ).toBe(anchor)
}

/* ------------------------------------------------------------------ *
 * The rows and envelopes of frozen 7.10
 * ------------------------------------------------------------------ */

/** The frozen 7.0 TaskCard, typed for the fields the P4 criteria read off a
 * row. Every field here is checked at run time by expectCards, which applies
 * the key-exact shape restated in tasks-harness.ts; the interface is for the
 * reading, never for the judging. */
export interface Card extends Record<string, unknown> {
  id: string
  title: string
  status: string
  important: boolean
  start_date: string | null
  due_date: string | null
  due_time: string | null
  pulled: boolean
  assignee: {
    id: string
    display_name: string | null
    avatar_url: string | null
  } | null
  folder: { id: string; name: string; is_default: boolean }
  // RFC 0005 unit 12a's two widenings of frozen 7.0. created_by is the same
  // person shape assignee carries, and is null only where 8.10 scrubbed the
  // creator; section_block_id is the 4.17 section the row sits under on its
  // folder's page, null for a task under none.
  created_by: {
    id: string
    display_name: string | null
    avatar_url: string | null
  } | null
  section_block_id: string | null
}

/** Every row of every 7.10 body is a 7.0 TaskCard. This is the contract test
 * the RFC 0001 P4 row asks for by name, applied on the wire rather than in
 * the producer, because this package writes a second producer of the shape. */
export function expectCards(value: unknown, source: string): Card[] {
  expect(Array.isArray(value), `${source} must be an array (spec 7.10)`).toBe(
    true,
  )
  const list = value as unknown[]
  for (const [index, row] of list.entries()) {
    expectTaskCardShape(row, `${source}[${String(index)}]`)
  }
  return list as Card[]
}

function expectFlag(value: unknown, source: string): boolean {
  expect(
    typeof value,
    `${source} must be a boolean: section 6 caps this list at 1000 rows and sets the flag beyond it`,
  ).toBe('boolean')
  return value as boolean
}

function expectCursor(value: unknown, source: string): string | null {
  if (value === null) return null
  expect(
    typeof value === 'string' && value.length > 0,
    `${source} must be a non-empty cursor string or null (spec 7.10); got ${JSON.stringify(value)}`,
  ).toBe(true)
  return value as string
}

export interface Group {
  folder: Record<string, unknown>
  rows: Card[]
}

/*
7.10 wrote groups as [{folder, rows}] without saying which object `folder`
is, the 7.0 Folder schema and the {id, name, is_default} stub every TaskCard
carries both satisfying the word. Escalated from P4 and ruled by the human
owner on 2026-08-07: it is the stub, because a group heading needs exactly
what a card's folder label needs, Folder's counts being the 8.11 computation
no grouped view asks for and its ownership fields being 7.4's business. So
the shape is key-exact here like every other one, rather than asserted at the
intersection of two readings. The sharp half stands unchanged: the group's
folder is the folder its own rows are in.
*/
function expectGroups(value: unknown, source: string): Group[] {
  expect(Array.isArray(value), `${source} must be an array (spec 7.10)`).toBe(
    true,
  )
  const groups: Group[] = []
  for (const [index, entry] of (value as unknown[]).entries()) {
    const where = `${source}[${String(index)}]`
    const group = asRecord(entry, where)
    expectExactKeys(group, ['folder', 'rows'], where)
    const folder = asRecord(group.folder, `${where}.folder`)
    expectExactKeys(
      folder,
      ['id', 'is_default', 'name'],
      `${where}.folder, which 7.10 as ruled on 2026-08-07 makes the TaskCard stub rather than the 7.0 Folder object`,
    )
    expect(
      typeof folder.id,
      `${where}.folder.id must be a string: a group heading names one folder (spec 6 Q2, 7.10)`,
    ).toBe('string')
    expect(
      typeof folder.name,
      `${where}.folder.name must be a string: Q2 orders groups by lower(folder name)`,
    ).toBe('string')
    expect(
      typeof folder.is_default,
      `${where}.folder.is_default must be a boolean, the third key of the stub`,
    ).toBe('boolean')
    const rows = expectCards(group.rows, `${where}.rows`)
    expect(
      rows.length,
      `${where} exists, so it must carry rows: Q2 groups only folders having at least one`,
    ).toBeGreaterThan(0)
    for (const row of rows) {
      expect(
        (row.folder as { id?: unknown }).id,
        `${where}.rows must all be in the folder the group names (spec 6 Q2)`,
      ).toBe(folder.id)
    }
    groups.push({ folder, rows })
  }
  return groups
}

export interface DayBucket {
  date: string
  rows: Card[]
}

/** Q6 groups by the completed_at date in V's timezone, most recent day
 * first; the folder completed section paginates the same way (7.10). */
function expectDays(value: unknown, source: string): DayBucket[] {
  expect(Array.isArray(value), `${source} must be an array (spec 7.10)`).toBe(
    true,
  )
  const days: DayBucket[] = []
  for (const [index, entry] of (value as unknown[]).entries()) {
    const where = `${source}[${String(index)}]`
    const bucket = asRecord(entry, where)
    expectExactKeys(bucket, ['date', 'rows'], where)
    expect(
      typeof bucket.date === 'string' && DATE_ONLY.test(bucket.date),
      `${where}.date must be a civil date in the viewer's zone, YYYY-MM-DD (spec 6 Q6, 4.11); got ${JSON.stringify(bucket.date)}`,
    ).toBe(true)
    const rows = expectCards(bucket.rows, `${where}.rows`)
    expect(
      rows.length,
      `${where} exists, so it must carry rows: a day with no completions is not a day`,
    ).toBeGreaterThan(0)
    days.push({ date: bucket.date as string, rows })
  }
  return days
}

/* ------------------------------------------------------------------ *
 * The transports
 * ------------------------------------------------------------------ */

export type ViewQuery = Record<string, string | undefined>

export function viewPath(path: string, query: ViewQuery): string {
  const pairs: string[] = []
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue
    pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
  }
  return pairs.length === 0 ? path : `${path}?${pairs.join('&')}`
}

/** The unjudged transport, for the refusals: 7.0's envelope answers those,
 * not a view body. */
export function getView(
  actor: Actor,
  path: string,
  query: ViewQuery = {},
): Promise<RawResponse> {
  return actor.browser.api(viewPath(path, query))
}

async function readView(
  actor: Actor,
  path: string,
  query: ViewQuery,
  keys: readonly string[],
  why: string,
): Promise<Record<string, unknown>> {
  const response = await getView(actor, path, query)
  expectStatus(response, 200, why)
  const body = asRecord(response.json(), `the ${path} body`)
  expectExactKeys(body, keys, `the ${path} body`)
  return body
}

/* ------------------------------------------------------------------ *
 * The nine endpoints of frozen 7.10
 * ------------------------------------------------------------------ */

export interface MyDayBody {
  carried: Card[]
  today: Card[]
  recap: Card[]
  truncated: boolean
}

export async function myDay(actor: Actor, tz: string): Promise<MyDayBody> {
  const body = await readView(
    actor,
    '/views/my-day',
    { tz },
    ['carried', 'recap', 'today', 'truncated'],
    `GET /views/my-day must answer the Q1 groups and the Q1R recap for tz ${tz} (spec 7.10, 6 Q1, 6 Q1R)`,
  )
  return {
    carried: expectCards(body.carried, 'my-day carried'),
    today: expectCards(body.today, 'my-day today'),
    recap: expectCards(body.recap, 'my-day recap'),
    truncated: expectFlag(body.truncated, 'my-day truncated'),
  }
}

export interface TasksBody {
  inbox: Card[]
  groups: Group[]
  truncated: boolean
}

export async function tasksView(actor: Actor, tz: string): Promise<TasksBody> {
  const body = await readView(
    actor,
    '/views/tasks',
    { tz },
    ['groups', 'inbox', 'truncated'],
    `GET /views/tasks must answer Q2's ungrouped default-folder rows and its folder groups (spec 7.10, 6 Q2)`,
  )
  return {
    inbox: expectCards(body.inbox, 'tasks inbox'),
    groups: expectGroups(body.groups, 'tasks groups'),
    truncated: expectFlag(body.truncated, 'tasks truncated'),
  }
}

export interface RowsBody {
  rows: Card[]
  truncated: boolean
}

export async function planned(actor: Actor, tz: string): Promise<RowsBody> {
  const body = await readView(
    actor,
    '/views/planned',
    { tz },
    ['rows', 'truncated'],
    `GET /views/planned must answer Q3's dated open rows in Q3's order (spec 7.10, 6 Q3)`,
  )
  return {
    rows: expectCards(body.rows, 'planned rows'),
    truncated: expectFlag(body.truncated, 'planned truncated'),
  }
}

export async function important(actor: Actor, tz: string): Promise<RowsBody> {
  const body = await readView(
    actor,
    '/views/important',
    { tz },
    ['rows', 'truncated'],
    `GET /views/important must answer Q4's starred open rows in Q4's order (spec 7.10, 6 Q4)`,
  )
  return {
    rows: expectCards(body.rows, 'important rows'),
    truncated: expectFlag(body.truncated, 'important truncated'),
  }
}

export interface CalendarBody {
  real: Card[]
  virtual: unknown[]
}

/*
The virtual arm is P6's and is asserted here only as far as this package
owes it: 7.10 enumerates the key, so the key exists and is an array, exactly
the treatment P3 gave 7.0's recurrence_rule and reminder keys while their
computations were deferred. What draws in it is 8.5's projection over the
4.11 iterator, and AC-082 pins that in P6's range, not this one.
*/
export async function calendar(
  actor: Actor,
  tz: string,
  start: string,
  end: string,
): Promise<CalendarBody> {
  const body = await readView(
    actor,
    '/views/planned/calendar',
    { tz, start, end },
    ['real', 'virtual'],
    `GET /views/planned/calendar must answer Q3C's real rows for ${start} to ${end} (spec 7.10, 6 Q3C)`,
  )
  expect(
    Array.isArray(body.virtual),
    'the calendar answers a virtual array even while 8.5\'s projection is P6\'s: 7.10 enumerates the key (spec 7.10)',
  ).toBe(true)
  return {
    real: expectCards(body.real, 'calendar real'),
    virtual: body.virtual as unknown[],
  }
}

export interface AllBody {
  planned: Card[]
  tasks_inbox: Card[]
  tasks_groups: Group[]
  truncated: boolean
}

export async function allView(actor: Actor, tz: string): Promise<AllBody> {
  const body = await readView(
    actor,
    '/views/all',
    { tz },
    ['planned', 'tasks_groups', 'tasks_inbox', 'truncated'],
    `GET /views/all must answer Q5 as Q3's order stacked over Q2's grouping (spec 7.10, 6 Q5)`,
  )
  return {
    planned: expectCards(body.planned, 'all planned'),
    tasks_inbox: expectCards(body.tasks_inbox, 'all tasks_inbox'),
    tasks_groups: expectGroups(body.tasks_groups, 'all tasks_groups'),
    truncated: expectFlag(body.truncated, 'all truncated'),
  }
}

export interface PagedDaysBody {
  days: DayBucket[]
  next_cursor: string | null
}

export async function done(
  actor: Actor,
  tz: string,
  cursor?: string,
): Promise<PagedDaysBody> {
  const body = await readView(
    actor,
    '/views/done',
    { tz, cursor },
    ['days', 'next_cursor'],
    `GET /views/done must answer Q6's completed rows grouped by completion day in ${tz} (spec 7.10, 6 Q6)`,
  )
  return {
    days: expectDays(body.days, 'done days'),
    next_cursor: expectCursor(body.next_cursor, 'done next_cursor'),
  }
}

export interface FolderOpenBody {
  scheduled: Card[]
  unscheduled: Card[]
  truncated: boolean
}

/*
The one body frozen 7.10 described in prose without naming its keys. The P4
kickoff escalated the question with a recommendation; the human owner ruled
it on 2026-08-07, and 7.10 now enumerates the body like its eight neighbours,
with the key names they already use for the same things. Read from that text
rather than from the recommendation that preceded it.

`section` is sent explicitly by both readers below, each naming the section
it is for, even though 7.10 now defaults it to open. The default is a
behavior of the endpoint and is asserted where behaviors are, in AC-058.
*/
export async function folderOpen(
  actor: Actor,
  folderId: string,
  tz: string,
): Promise<FolderOpenBody> {
  const body = await readView(
    actor,
    `/folders/${folderId}/tasks`,
    { tz, section: 'open' },
    ['scheduled', 'truncated', 'unscheduled'],
    `GET /folders/:id/tasks?section=open must answer Q7's first two sections (spec 7.10 as ruled on 2026-08-07, 6 Q7)`,
  )
  return {
    scheduled: expectCards(body.scheduled, 'folder scheduled'),
    unscheduled: expectCards(body.unscheduled, 'folder unscheduled'),
    truncated: expectFlag(body.truncated, 'folder truncated'),
  }
}

export async function folderCompleted(
  actor: Actor,
  folderId: string,
  tz: string,
  cursor?: string,
): Promise<PagedDaysBody> {
  const body = await readView(
    actor,
    `/folders/${folderId}/tasks`,
    { tz, section: 'completed', cursor },
    ['days', 'next_cursor'],
    `GET /folders/:id/tasks?section=completed must paginate like Done (spec 7.10 as ruled on 2026-08-07, 6 Q7)`,
  )
  return {
    days: expectDays(body.days, 'folder completed days'),
    next_cursor: expectCursor(body.next_cursor, 'folder completed next_cursor'),
  }
}

export interface SearchBody {
  rows: Card[]
  next_cursor: string | null
}

export async function search(
  actor: Actor,
  tz: string,
  q: string,
  cursor?: string,
): Promise<SearchBody> {
  const body = await readView(
    actor,
    '/search',
    { tz, q, cursor },
    // 7.18 (RFC 0005) adds the three kinds beside Q8's tasks; the task
    // half of the response is unchanged and is all this helper reads.
    ['folders', 'next_cursor', 'pages', 'rows', 'shelves'],
    `GET /search must answer Q8's matches in Q8's order for ${JSON.stringify(q)} (spec 7.10, 6 Q8, 7.18)`,
  )
  return {
    rows: expectCards(body.rows, 'search rows'),
    next_cursor: expectCursor(body.next_cursor, 'search next_cursor'),
  }
}

/* ------------------------------------------------------------------ *
 * Paging to exhaustion
 * ------------------------------------------------------------------ */

export interface Page<T> {
  rows: T[]
  cursor: string | null
}

/*
Follows next_cursor to the end and returns every page. The bound is a
runaway guard, not a page-count expectation: a cursor that never advances
would otherwise spin forever and report a timeout rather than a defect.
*/
export async function pageThrough<T>(
  fetchPage: (cursor?: string) => Promise<{ next_cursor: string | null }>,
  extract: (body: never) => T[],
  why: string,
  limit = 40,
): Promise<Page<T>[]> {
  const pages: Page<T>[] = []
  let cursor: string | undefined
  for (let index = 0; index < limit; index += 1) {
    const body = await fetchPage(cursor)
    pages.push({
      rows: extract(body as never),
      cursor: body.next_cursor,
    })
    if (body.next_cursor === null) return pages
    cursor = body.next_cursor
  }
  expect(
    pages.length,
    `${why}: paging did not terminate within ${String(limit)} pages, so the cursor is not advancing (spec 6 Q6, Q8)`,
  ).toBeLessThan(limit)
  return pages
}

/** Every row of every Done page, in page order. */
export async function doneRows(
  actor: Actor,
  tz: string,
): Promise<{ pages: Page<Card>[]; rows: Card[] }> {
  const pages = await pageThrough<Card>(
    (cursor) => done(actor, tz, cursor),
    (body: PagedDaysBody) => body.days.flatMap((day) => day.rows),
    'GET /views/done',
  )
  return { pages, rows: pages.flatMap((page) => page.rows) }
}

/** Every row of every search page, in page order. */
export async function searchRows(
  actor: Actor,
  tz: string,
  q: string,
): Promise<{ pages: Page<Card>[]; rows: Card[] }> {
  const pages = await pageThrough<Card>(
    (cursor) => search(actor, tz, q, cursor),
    (body: SearchBody) => body.rows,
    'GET /search',
  )
  return { pages, rows: pages.flatMap((page) => page.rows) }
}

/* ------------------------------------------------------------------ *
 * Fixtures, written directly
 * ------------------------------------------------------------------ */

export interface SeedViewTaskOptions {
  folderId: string
  createdBy: string
  /** Supplied where a tie-break on id is the thing under test. */
  id?: string
  title?: string
  notes?: string | null
  status?: 'pending' | 'completed' | 'abandoned'
  important?: boolean
  assigneeId?: string | null
  /** 4.5's start_date. Named beside dueDate because the Schedule is a pair
   * and the four valid states are what the view criteria of #216 and #217
   * are about; `tasks_start_before_due_check` refuses a fixture that names
   * both the wrong way round, which is the fixture failing rather than the
   * result passing. */
  startDate?: string | null
  dueDate?: string | null
  dueTime?: string | null
  createdAt?: string
  updatedAt?: string
  completedAt?: string | null
  completedBy?: string | null
}

/*
Every column named, and the two that section 4 ties together defaulted
together: INV-8 makes completed_at and completed_by set exactly when the
status is completed, so a completed seed that named neither would be
rejected by the CHECK rather than by the test. created_at and updated_at fall
back to the row default when the caller does not care, because now() differs
per statement and an ordering that does care always says so.
*/
export async function seedViewTask(
  db: Db,
  options: SeedViewTaskOptions,
): Promise<string> {
  const id = options.id ?? randomUUID()
  const status = options.status ?? 'pending'
  const completed = status === 'completed'
  const completedAt = completed
    ? (options.completedAt ?? new Date().toISOString())
    : null
  const completedBy = completed
    ? (options.completedBy ?? options.createdBy)
    : null
  await db.execute(sql`
    INSERT INTO tasks (id, folder_id, title, notes, status, important,
                       start_date, due_date, due_time, assignee_id, created_by,
                       completed_at, completed_by, created_at, updated_at)
    VALUES (${id}::uuid, ${options.folderId}::uuid,
            ${options.title ?? `p4 task ${id.slice(0, 8)}`},
            ${options.notes ?? null}, ${status}, ${options.important ?? false},
            ${options.startDate ?? null}::date,
            ${options.dueDate ?? null}::date, ${options.dueTime ?? null}::time,
            ${options.assigneeId ?? null}::uuid, ${options.createdBy}::uuid,
            ${completedAt}::timestamptz, ${completedBy}::uuid,
            COALESCE(${options.createdAt ?? null}::timestamptz, now()),
            COALESCE(${options.updatedAt ?? null}::timestamptz, now()))
  `)
  return id
}

export interface SeedManyOptions {
  folderId: string
  createdBy: string
  assigneeId?: string | null
  count: number
  titlePrefix: string
  status?: 'pending' | 'completed' | 'abandoned'
  dueDate?: string | null
  /** Completed seeds start here and step one minute per row, so Q6's
   * keyset has a total order to page through. */
  completedFrom?: string
  completedStepMinutes?: number
}

/** Volume, for the two criteria that turn on it: the 1000-row cap of
 * section 6 and the 120 completed rows of AC-056. One statement, because a
 * thousand round trips would dominate the file's runtime. */
export async function seedManyTasks(
  db: Db,
  options: SeedManyOptions,
): Promise<void> {
  const status = options.status ?? 'pending'
  const completed = status === 'completed'
  const from = options.completedFrom ?? new Date().toISOString()
  const step = options.completedStepMinutes ?? 1
  await db.execute(sql`
    INSERT INTO tasks (folder_id, title, status, important, due_date,
                       assignee_id, created_by, completed_at, completed_by,
                       created_at, updated_at)
    SELECT ${options.folderId}::uuid,
           ${options.titlePrefix} || ' ' || lpad(i::text, 5, '0'),
           ${status}, false, ${options.dueDate ?? null}::date,
           ${options.assigneeId ?? null}::uuid, ${options.createdBy}::uuid,
           CASE WHEN ${completed}
                THEN ${from}::timestamptz + (i * ${step} * interval '1 minute')
                ELSE NULL END,
           CASE WHEN ${completed} THEN ${options.createdBy}::uuid ELSE NULL END,
           now() + (i * interval '1 microsecond'),
           now() + (i * interval '1 microsecond')
      FROM generate_series(1, ${options.count}) AS i
  `)
}

/**
 * A folder both actors are members of. INV-5 forces the assignee in a
 * single-member folder, so any fixture with an unassigned or
 * differently-assigned task needs two members, and 5.3 needs the roster
 * connection first. Connections are P5's surface and are seeded.
 */
export async function sharedFolder(
  db: Db,
  owner: Actor,
  guest: Actor,
  name: string,
): Promise<string> {
  const folderId = await createFolder(owner, name)
  await connect(db, owner.id, guest.id)
  await addMemberOk(owner, folderId, guest.id)
  return folderId
}

/* ------------------------------------------------------------------ *
 * Reading a response
 * ------------------------------------------------------------------ */

export function idsOf(cards: readonly Card[]): string[] {
  return cards.map((card) => card.id)
}

export function titlesOf(cards: readonly Card[]): string[] {
  return cards.map((card) => card.title)
}

export function cardById(
  cards: readonly Card[],
  id: string,
): Card | undefined {
  return cards.find((card) => card.id === id)
}

/** The group for a folder, asserted present: an order inside a heading
 * cannot be read off a heading that is not there. */
export function requireGroup(
  groups: readonly Group[],
  folderId: string,
  why: string,
): Group {
  const group = groups.find((entry) => entry.folder.id === folderId)
  expect(group, why).toBeDefined()
  return group as Group
}

/** The row, asserted present: a criterion about what a card carries cannot
 * be read off a card a wrong implementation left out of the response. */
export function requireCard(
  cards: readonly Card[],
  id: string,
  why: string,
): Card {
  const card = cardById(cards, id)
  expect(card, why).toBeDefined()
  return card as Card
}

/** Every row of a Tasks or All response, whichever section it sits in. */
export function tasksRowsOf(body: TasksBody | AllBody): Card[] {
  const inbox = 'inbox' in body ? body.inbox : body.tasks_inbox
  const groups = 'groups' in body ? body.groups : body.tasks_groups
  return [...inbox, ...groups.flatMap((group) => group.rows)]
}

/** Every row an All response carries, both stacked sections. */
export function allRowsOf(body: AllBody): Card[] {
  return [...body.planned, ...tasksRowsOf(body)]
}

/** The whole sequence, named. Section 6 ends every order in id so that two
 * agents produce byte-identical sequences; a membership check would not
 * notice an order at all. */
export function expectSequence(
  actual: readonly string[],
  expected: readonly string[],
  why: string,
): void {
  expect(actual, why).toEqual([...expected])
}

/* ------------------------------------------------------------------ *
 * Database truth for the fixtures
 * ------------------------------------------------------------------ */

/** Ids of a folder's tasks, for asserting that a view's scope is the whole
 * of what the folder holds rather than an accident of the fixture. */
export async function taskIdsInFolder(
  db: Db,
  folderId: string,
): Promise<string[]> {
  const found = await rows(
    db,
    sql`SELECT id FROM tasks WHERE folder_id = ${folderId} ORDER BY id`,
  )
  return found.map((row) => String(row.id))
}

/**
 * A folder's completed tasks in Q6's order, read from the fixture rather
 * than from the response. Ordered in SQL so that the id tie-break uses
 * Postgres's own uuid comparison on both sides of the assertion; sorting
 * uuids as JavaScript strings would be a second definition of the order and
 * the wrong one to measure a response against.
 */
export async function completedOrderIn(
  db: Db,
  folderId: string,
): Promise<string[]> {
  const found = await rows(
    db,
    sql`
      SELECT id FROM tasks
       WHERE folder_id = ${folderId} AND status = 'completed'
       ORDER BY completed_at DESC, id DESC
    `,
  )
  return found.map((row) => String(row.id))
}

/**
 * Named rows in Q8's order, computed by the database over the fixture.
 *
 * This is a second statement of an order the suite otherwise writes out by
 * hand, and it is deliberately kept away from every response: it takes ids
 * and returns ids, so it cannot make an implementation pass and cannot be
 * asserted against one. What it checks is the hand-written array, which is
 * the thing that was wrong. AC-057's expected sequence held two rows the
 * wrong way round against its own timestamps for as long as the route
 * answered 404, because ordering four minute offsets in your head is exactly
 * the step a person gets wrong and no assertion was watching.
 */
export async function q8OrderOf(
  db: Db,
  ids: readonly string[],
): Promise<string[]> {
  const found = await rows(
    db,
    sql`
      SELECT id FROM tasks
       WHERE id IN (${sql.join(
         ids.map((id) => sql`${id}::uuid`),
         sql`, `,
       )})
       ORDER BY CASE status
                  WHEN 'pending' THEN 0
                  WHEN 'abandoned' THEN 1
                  ELSE 2
                END,
                updated_at DESC, id DESC
    `,
  )
  return found.map((row) => String(row.id))
}

/**
 * The Q3 keys above id, for named rows, in the id order Postgres itself
 * produces. Two rows seeded to differ only in id have to be checked on both
 * halves of that claim, and neither is checked by the response: a pair whose
 * created_at differs by a millisecond is settled by created_at, so the
 * assertion that looks like a tie-break tests the key above it and passes
 * for the wrong reason; and a pair whose ids sort one way in JavaScript and
 * the other in Postgres names its own expected order wrongly, the hazard
 * completedOrderIn above records. Ordering here in SQL puts both questions
 * to the comparator the response is judged by.
 */
export async function tieKeysOf(
  db: Db,
  ids: readonly string[],
): Promise<{ id: string; keys: string }[]> {
  const found = await rows(
    db,
    sql`
      SELECT id,
             due_date::text || ' ' || coalesce(due_time::text, 'all-day')
               || ' ' || status || ' ' || created_at::text AS keys
        FROM tasks
       WHERE id IN (${sql.join(
         ids.map((id) => sql`${id}::uuid`),
         sql`, `,
       )})
       ORDER BY id
    `,
  )
  return found.map((row) => ({ id: String(row.id), keys: String(row.keys) }))
}

export async function countTasks(db: Db, folderId: string): Promise<number> {
  const found = await rows(
    db,
    sql`SELECT count(*)::int AS n FROM tasks WHERE folder_id = ${folderId}`,
  )
  return Number(found[0]?.n ?? Number.NaN)
}
