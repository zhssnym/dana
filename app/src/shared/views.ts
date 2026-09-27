/*
The 7.10 views and search surface as code: the query parameters the nine
endpoints accept, the nine response bodies they answer, and the cursor the two
paginated orders page by.

What is deliberately not here is the row. Every row of every body below is the
7.0 TaskCard that src/shared/tasks.ts already carries, and the view endpoints
fill it from that definition rather than from a per-endpoint variant. This
file is everything around the rows. It matters more than usual here: taskView
in domain/tasks.ts produces a card one task at a time and no list endpoint can
call it per row, so the views have a second producer of one shape, and the
shared schema is the contract that keeps the two producers honest.

Two rules the bodies encode rather than merely describe, both from section 6's
preamble:

- The 1000-row cap is per response, not per array. Each capped body therefore
  refuses more than LIST_ROW_CAP rows counted across all of its own sections,
  which is the only half of the rule a shape can check: whether truncated is
  true takes knowing what was dropped, and only the query knows that.
- The rows kept are the first 1000 in the order 7.10 enumerates that
  response's sections. takeCapped below is that allocation, written once
  because Tasks, All and the folder open sections each need it and three
  copies of one rule are three things that can disagree.

Two rules that are deliberately somewhere else, so this file does not become a
second home for them:

- The calendar's 62 days and the inversion refusal are arithmetic over civil
  dates, which 11.9 and the module seam give to
  src/server/time. checkCalendarRange there answers
  which of Q3C's two rules broke and says outright that naming the field and
  choosing the status are the route's. The schema below validates that start
  and end are calendar dates at all; the route asks that module the range
  question and answers with sendFieldValidationError, so the sentence a caller
  reads is the same sentence a schema failure produces. src/shared cannot
  import src/server in any case: tsconfig.client.json compiles this directory
  into the browser bundle, where a server module has no business.
- Q8's wildcard escaping. searchQuery yields
  the trimmed literal a user typed; escaping a backslash, percent or
  underscore happens where the ILIKE pattern is built, and doing it here would
  hand the query a value it would escape a second time.
*/
import { z } from 'zod'

import { LIST_ROW_CAP } from './list-cap.js'
// dueDate is imported under a second name: a completion day, a calendar range
// boundary and a due date are one format, 4.11's YYYY-MM-DD, so they are one
// primitive, and the alias is what lets the use sites read correctly without
// declaring it twice.
import {
  dueDate as calendarDate,
  taskCard,
  taskCardFolder,
  taskStatus,
  taskTitle,
  wallClockTime,
} from './tasks.js'
import { isIanaTimezone } from './timezone.js'

/* ------------------------------------------------------------------ *
 * Query parameters
 * ------------------------------------------------------------------ */

/*
7.0: "every view endpoint takes tz, an IANA identifier, 422 naming the field
if it is invalid or absent". The absent half is why this is a bare required
field with no default.

The one plausible default, UTC, would hand most of the world the wrong day
with nothing on the wire to say it had been substituted, and 8.1 makes tz an
input of every request that evaluates dates rather than a preference. So an
absent tz fails the type check with path ['tz'], which sendValidationError
renders as a 422 naming the field, exactly as an invalid one does.

The predicate is imported rather than restated: isIanaTimezone carries the
11.15 sign guard that closes Intl's offset-identifier hole, and a second
validator here would be a second answer to one of 10.3's rows. Only the
messages are local, because "required" is this parameter's own fact and not
the identifier rule's.

7.1's tz is the opposite treatment, an unparseable zone read as absent rather
than refused, and 7.0 records it as a deviation scoped to sign-in. Nothing
here generalizes to it.
*/
export const viewTz = z
  .string({ error: 'must be supplied, as an IANA timezone identifier' })
  .refine(isIanaTimezone, { error: 'must be a valid IANA timezone identifier' })

/*
Q8's input rule: "q, trimmed, 2 to 100 characters, else 422", the same 2 to
100 that 10.3 lists among the numbers it calls server-enforced.

Trimming is one operation with two consequences and the order below produces
both: zod applies .trim() before the length checks, verified against the
installed zod 4.4.3 rather than recalled (11.15), so "   z   " is a query of
one character and refused, while "  zq  " parses to "zq" and searches for the
needle rather than for the spaces.

The floor is not decoration. Q8's pattern is '%' q '%' over a trigram index,
and a one-character query is a scan of every accessible task with a pattern
the index cannot help.
*/
export const searchQ = z
  .string({ error: 'must be supplied, as the text to search for' })
  .trim()
  .min(2, { error: 'must be 2 to 100 characters after trimming' })
  .max(100, { error: 'must be 2 to 100 characters after trimming' })

/*
7.10's section, open when absent, because Q7 renders its completed section
collapsed and open is the state the page opens in.

Absent and empty are different things here, as they are for tz. .default()
fires on undefined alone, so "?section=" is a present value outside the
enumeration and answers 422 naming the field, which is what keeps a
mistyped parameter from silently answering a question nobody asked.
*/
export const folderSection = z.enum(['open', 'completed'], {
  error: 'must be open or completed',
})
export type FolderSection = z.infer<typeof folderSection>

/* ------------------------------------------------------------------ *
 * Cursors
 * ------------------------------------------------------------------ */

/*
Q6 and Q8 are keyset-paginated, and a keyset cursor names a position in an
order by the values of the columns that order sorts on. Q6 says so outright,
"cursor is the last row's (completed_at, id)"; Q8 names its keys in its sort
line, status_rank then updated_at then id.

Three decisions, each with a defect it prevents.

**The instant rides as an opaque string and is never parsed into a Date.**
new Date(...).toISOString() truncates to milliseconds, and Postgres stores
timestamptz to the microsecond. A cursor built through a Date would resume at
a rounded position: rows completed inside the same millisecond would be
re-emitted or skipped depending on which way the rounding went, on a page
boundary, which is the least observable place a lost row can hide. This build
has already shipped one false green from exactly that family, a timestamp
comparison the driver had truncated. So the payload schema takes a string, a
Date fails it, and the codec preserves whatever precision the query rendered.
The rendering itself is the query's: it must carry the stored value's full
precision, which the 7.0 wire format (millisecond ISO through toIso) does not,
so a cursor is built from the row rather than from the card.

**The search cursor carries status, not status_rank.** The rank is an
expression over 4.5's column, and section 6's preamble can revise the scale.
A cursor holding a rank would
bind clients to a scale the specification revises; a cursor holding the row's
own status leaves the mapping where the query's ORDER BY already does it once.

**One kind serves Done and the folder's completed section.** Q7's third
section is Q6 entire, same keys, same order, same page size, so they page the
same cursor. Search gets its own kind, and a cursor presented to the wrong
endpoint fails to decode rather than resuming from a position that endpoint
never issued.

The encoding is base64url over JSON with a version and a kind. Opaque is the
point: a client that constructs a cursor by hand has taken a dependency on the
sort keys, and every later change to an order becomes a compatibility problem.
btoa and atob rather than Buffer, because this directory is compiled into the
browser bundle too (tsconfig.client.json).

7.10 writes "?cursor" and next_cursor and says nothing about what a cursor
is, so the properties below are this file's:

- **A cursor is opaque, and a client sends back the next_cursor it received
  byte for byte.** Without that, the encoding below is a public shape: a client
  that decodes it has taken a dependency on Q6's and Q8's sort keys, and the
  next revision of either order becomes a compatibility problem instead of an
  edit.
- **A null next_cursor is the end of the list**, which is what lets a client
  stop rather than probe.
- **A cursor an endpoint did not issue is 422 naming cursor, never a silent
  first page.** The alternative turns a client bug into wrong data: the caller
  is handed page one again while the rows it was paging toward never arrive,
  with a 200 over it. It is the same rule the section parameter follows, absent
  being a default and a present wrong value not being absent.

A cursor's kind names the *order* it belongs to, not the endpoint that issued
it, so a completed cursor is portable between GET /views/done and the folder
page's completed section and nowhere else. Section 6 makes Q7's third section
"Q6 predicate, order, and pagination, folder_id = F", one order with one page
size, and the position is (completed_at, id) in that order.
*/
const CURSOR_VERSION = 1

type CursorKind = 'completed' | 'search'

/*
An instant with an explicit UTC designator or offset, at whatever precision
the query rendered. Zero fractional digits and six both parse, and both
survive the round trip byte for byte. Refusing an instant with no zone marker
is deliberate: a bare local timestamp names a different moment in every zone,
and a cursor is compared against stored timestamptz values.
*/
const cursorInstant = z
  .string({ error: 'must be a string' })
  .regex(
    /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/,
    { error: 'must be a timestamp carrying an explicit UTC offset' },
  )

const cursorId = z.uuid({ error: 'must be a uuid' })

/** Q6's key, and Q7's third section by reference: the last row's
 * (completed_at, id), read descending. */
export const completedCursor = z.object({
  completed_at: cursorInstant,
  id: cursorId,
})
export type CompletedCursor = z.infer<typeof completedCursor>

/** Q8's key: status_rank, updated_at descending, id descending, with the rank
 * left as the status it is computed from. */
export const searchCursor = z.object({
  status: taskStatus,
  updated_at: cursorInstant,
  id: cursorId,
})
export type SearchCursor = z.infer<typeof searchCursor>

const cursorEnvelope = z.object({
  v: z.literal(CURSOR_VERSION),
  k: z.enum(['completed', 'search']),
  p: z.unknown(),
})

function toBase64Url(text: string): string {
  return btoa(text).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

function fromBase64Url(text: string): string | undefined {
  try {
    return atob(text.replaceAll('-', '+').replaceAll('_', '/'))
  } catch {
    return undefined
  }
}

/*
The payload is validated before it is encoded, and a failure throws rather
than returning a bad cursor. Every input here is the server's own row, so an
invalid one is a defect in the caller and not a client's mistake: a Date
passed where a rendered timestamp belongs fails the string check here instead
of silently becoming a millisecond-truncated position.
*/
function encodeCursor<T>(kind: CursorKind, schema: z.ZodType<T>, payload: T): string {
  const checked = schema.parse(payload)
  return toBase64Url(JSON.stringify({ v: CURSOR_VERSION, k: kind, p: checked }))
}

function decodeCursor<T>(
  kind: CursorKind,
  schema: z.ZodType<T>,
  raw: string,
): T | undefined {
  const json = fromBase64Url(raw)
  if (json === undefined) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return undefined
  }
  const envelope = cursorEnvelope.safeParse(parsed)
  if (!envelope.success || envelope.data.k !== kind) return undefined
  const payload = schema.safeParse(envelope.data.p)
  return payload.success ? payload.data : undefined
}

export function encodeCompletedCursor(position: CompletedCursor): string {
  return encodeCursor('completed', completedCursor, position)
}

export function decodeCompletedCursor(raw: string): CompletedCursor | undefined {
  return decodeCursor('completed', completedCursor, raw)
}

export function encodeSearchCursor(position: SearchCursor): string {
  return encodeCursor('search', searchCursor, position)
}

export function decodeSearchCursor(raw: string): SearchCursor | undefined {
  return decodeCursor('search', searchCursor, raw)
}

/*
A cursor parameter decodes inside the schema, so the route runs one safeParse
and holds a typed position, and every way a cursor can be wrong (not base64,
not JSON, the wrong version, the wrong endpoint's kind, a payload missing a
key) reaches the caller as one 422 naming cursor. Splitting the decode out
would put a second refusal path beside the schema's, and two paths are two
sentences a client has to recognize.
*/
function cursorParam<T>(kind: CursorKind, schema: z.ZodType<T>) {
  return z
    .string({ error: 'must be a string' })
    .transform((raw, ctx): T => {
      const position = decodeCursor(kind, schema, raw)
      if (position === undefined) {
        ctx.addIssue({
          code: 'custom',
          message:
            'must be a cursor this endpoint issued, sent back exactly as it was received',
        })
        return z.NEVER
      }
      return position
    })
}

/* ------------------------------------------------------------------ *
 * The query of each endpoint
 * ------------------------------------------------------------------ */

/*
viewQuery is what 7.10's first line gives every endpoint, "All take tz", and
the four shapes after it are extensions of it rather than transcriptions of
its one field, because an extension cannot drift from what it extends.

Values arrive from Express as strings, or as arrays when a parameter is
repeated, or as objects under the extended parser. z.string refuses the last
two, so ?tz=a&tz=b is a 422 naming tz rather than a zone read out of an array
by accident. Unknown parameters are stripped rather than refused, the 7.0
tolerance every body schema in this directory already follows.
*/
export const viewQuery = z.object({ tz: viewTz })
export type ViewQuery = z.infer<typeof viewQuery>

/*
Q3C's parameters. The dates are shapes here and a range there: this schema
says start and end are calendar dates, and checkCalendarRange in
src/server/time decides whether the pair is inverted or longer than 62 days.
Both refusals are 422 naming the pair, and neither number appears twice.
*/
export const plannedCalendarQuery = viewQuery.extend({
  start: calendarDate,
  end: calendarDate,
})
export type PlannedCalendarQuery = z.infer<typeof plannedCalendarQuery>

export const doneQuery = viewQuery.extend({
  cursor: cursorParam('completed', completedCursor).optional(),
})
export type DoneQuery = z.infer<typeof doneQuery>

/*
The folder page takes both, and only one of them is ever used: a cursor
belongs to the completed section, which is the only one that paginates. A
cursor sent with section=open is accepted and ignored rather than refused,
because 7.0 tolerates what an endpoint did not ask for and refusing it would
invent a rule the contract does not carry.
*/
export const folderTasksQuery = viewQuery.extend({
  section: folderSection.default('open'),
  cursor: cursorParam('completed', completedCursor).optional(),
})
export type FolderTasksQuery = z.infer<typeof folderTasksQuery>

export const searchQuery = viewQuery.extend({
  q: searchQ,
  cursor: cursorParam('search', searchCursor).optional(),
})
export type SearchQuery = z.infer<typeof searchQuery>

/*
GET /views/focus: the one task query behind the Focus lists. Every list is a
filter over the viewer's open (pending) tasks, and every field below has a
reader in server/views/focus.ts.

- `when` narrows by date: `on_today` is Q1's list (assigned to the viewer
  and begun, or pulled in), `upcoming` is dated work Today does not already
  hold, `overdue` and `undated` are the card's rung.
- `important` keeps starred tasks. A query string carries text, so it is the
  two words; `z.coerce.boolean` would read "false" as true.
- `group` shapes the answer: `none` is one list, `today` is Today's four
  headings (only over `on_today`, the one list that knows why a row is
  there), `person` is one group per assignee.
*/
export const focusWhen = z.enum(['any', 'on_today', 'upcoming', 'overdue', 'undated'])
export type FocusWhen = z.infer<typeof focusWhen>
export const focusGroup = z.enum(['none', 'today', 'person'])
export type FocusGroup = z.infer<typeof focusGroup>

export const focusQuery = viewQuery
  .extend({
    when: focusWhen.default('any'),
    important: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    group: focusGroup.default('none'),
  })
  .refine((query) => query.group !== 'today' || query.when === 'on_today', {
    path: ['group'],
    error: 'group=today needs when=on_today',
  })
export type FocusQuery = z.infer<typeof focusQuery>

/* ------------------------------------------------------------------ *
 * The 1000-row cap
 * ------------------------------------------------------------------ */

/*
The number and the allocation live in `list-cap.ts` and are re-exported here.
They live there because `GET /labels` takes the same cap and `labels.ts`
cannot import this file: this one imports `tasks.ts`, which imports
`labels.ts`, and the loop kills whichever of the three is loaded first.
*/
export { takeCapped } from './list-cap.js'
export type { CappedSections } from './list-cap.js'
export { LIST_ROW_CAP }

const OVER_CAP = `must carry at most ${String(LIST_ROW_CAP)} rows across the sections of one response (spec 6)`

function rowTotal(sections: readonly (readonly unknown[])[]): number {
  return sections.reduce((total, section) => total + section.length, 0)
}

function withinCap(sections: readonly (readonly unknown[])[]): boolean {
  return rowTotal(sections) <= LIST_ROW_CAP
}

function groupRows(
  groups: readonly { readonly rows: readonly unknown[] }[],
): readonly unknown[] {
  return groups.flatMap((group) => group.rows)
}

/* ------------------------------------------------------------------ *
 * The rows' containers
 * ------------------------------------------------------------------ */

/*
The group heading of Q2, which 7.10 writes as groups: [{folder, rows}] on GET
/views/tasks and as tasks_groups on GET /views/all. Its folder is the
{id, name, is_default} stub every TaskCard carries, rather than the 7.0 Folder object: a heading needs exactly what a
card's folder label needs, Folder's counts are the 8.11 computation no grouped
view asks for, and its ownership and personal fields are 7.4's business. The
two keys spell one thing, so they answer one shape, which is why both bodies
below use this schema rather than each declaring its own.

z.object strips what it does not declare rather than refusing it, the
convention every schema in this directory keeps, so a Folder object would
parse here by losing its extra keys. The key-exact check is on the wire
instead: views-harness.ts asserts this folder key-exact.
*/
export const taskCardGroup = z.object({
  folder: taskCardFolder,
  rows: z.array(taskCard),
})
export type TaskCardGroup = z.infer<typeof taskCardGroup>

/*
Q6's display grouping, "by the completed_at date in V's timezone, most recent
day first", which the folder's completed section inherits by reference. The
date is a civil date in the viewer's zone rather than an instant: which day a
completion belongs to is a question only tz can answer, and the answer is a
date, so putting an instant here would hand the client the same question back.
*/
export const completedDay = z.object({
  date: calendarDate,
  rows: z.array(taskCard),
})
export type CompletedDay = z.infer<typeof completedDay>

/*
Q3C's ghosts, the five fields 7.10 enumerates, drawn by 8.5's projection over
the 4.11 iterator in src/server/time.

A ghost is not a TaskCard and 7.10 does not make it one: it carries no status,
no counts and no assignee, because an instance that does not exist yet has
none of them. due_time is the parent's and is null for an all-day rule.
task_id is the current occurrence's own row id, because Q3C says clicking a
ghost opens that occurrence, so an id minted per instance would name nothing
this API can answer for.

The response is bounded by its 62 days and by nothing else: 7.10 gives it
neither a cap nor a truncated flag, and the ghosts multiply that bound by the
number of accessible pending rule-carrying tasks, up to 62 elements per
series. No shape here can report a truncation the body has no key for, so
bounding it is an amendment to 7.10 rather than an implementation detail.
*/
export const virtualInstance = z.object({
  task_id: z.uuid(),
  title: taskTitle,
  date: calendarDate,
  due_time: wallClockTime.nullable(),
  folder_id: z.uuid(),
})
export type VirtualInstance = z.infer<typeof virtualInstance>

/** The opaque half of a keyset page: what the client sends back, never a
 * shape it reads into. Null is the end of the list, which is what lets a
 * client stop. */
const nextCursor = z.string().min(1).nullable()

/* ------------------------------------------------------------------ *
 * The nine bodies of 7.10
 * ------------------------------------------------------------------ */

/*
Transcription, endpoint by endpoint, in 7.10's own order.

The capped six carry the refinement described at the top of this file. The
calendar is not among them: it is bounded by its 62 days rather than by a row
count, which is why 7.10 gives it no truncated flag. Done, the folder's
completed section and search are not among them either, being keyset-paginated
instead.
*/

// GET /views/my-day. Q1's two groups and Q1R's recap.
export const getMyDayResponse = z
  .object({
    carried: z.array(taskCard),
    today: z.array(taskCard),
    recap: z.array(taskCard),
    truncated: z.boolean(),
  })
  .refine((body) => withinCap([body.carried, body.today, body.recap]), {
    error: OVER_CAP,
  })
export type GetMyDayResponse = z.infer<typeof getMyDayResponse>

// GET /views/tasks. Q2's default-folder rows ungrouped, then one group per
// remaining folder that has any.
export const getTasksViewResponse = z
  .object({
    inbox: z.array(taskCard),
    groups: z.array(taskCardGroup),
    truncated: z.boolean(),
  })
  .refine((body) => withinCap([body.inbox, groupRows(body.groups)]), {
    error: OVER_CAP,
  })
export type GetTasksViewResponse = z.infer<typeof getTasksViewResponse>

// GET /views/planned. Q3's dated open rows.
export const getPlannedResponse = z
  .object({
    rows: z.array(taskCard),
    truncated: z.boolean(),
  })
  .refine((body) => withinCap([body.rows]), { error: OVER_CAP })
export type GetPlannedResponse = z.infer<typeof getPlannedResponse>

// GET /views/planned/calendar. Q3C's real rows and its ghosts.
export const getPlannedCalendarResponse = z.object({
  real: z.array(taskCard),
  virtual: z.array(virtualInstance),
})
export type GetPlannedCalendarResponse = z.infer<
  typeof getPlannedCalendarResponse
>

// GET /views/important. Q4's starred open rows, dated block then undated.
export const getImportantResponse = z
  .object({
    rows: z.array(taskCard),
    truncated: z.boolean(),
  })
  .refine((body) => withinCap([body.rows]), { error: OVER_CAP })
export type GetImportantResponse = z.infer<typeof getImportantResponse>

// GET /views/all. Q5 as Q3's order stacked over Q2's grouping, one page.
export const getAllResponse = z
  .object({
    planned: z.array(taskCard),
    tasks_inbox: z.array(taskCard),
    tasks_groups: z.array(taskCardGroup),
    truncated: z.boolean(),
  })
  .refine(
    (body) =>
      withinCap([body.planned, body.tasks_inbox, groupRows(body.tasks_groups)]),
    { error: OVER_CAP },
  )
export type GetAllResponse = z.infer<typeof getAllResponse>

// GET /views/done. Q6, keyset-paginated at 50 a page.
export const getDoneResponse = z.object({
  days: z.array(completedDay),
  next_cursor: nextCursor,
})
export type GetDoneResponse = z.infer<typeof getDoneResponse>

/*
GET /folders/:id/tasks, with the key names the other eight bodies already use for the same things: scheduled, unscheduled
and truncated on section=open, days and next_cursor on section=completed.

Two schemas rather than one union, because the section parameter has already
chosen by the time either is built, and a union would ask a reader to discover
from the keys what the request already said.
*/
export const getFolderTasksOpenResponse = z
  .object({
    scheduled: z.array(taskCard),
    unscheduled: z.array(taskCard),
    truncated: z.boolean(),
  })
  .refine((body) => withinCap([body.scheduled, body.unscheduled]), {
    error: OVER_CAP,
  })
export type GetFolderTasksOpenResponse = z.infer<
  typeof getFolderTasksOpenResponse
>

/*
GET /views/focus. Groups in reading order, each with a key the client names:
`all` for group=none; `carried`, `today`, `started`, `added` for group=today;
an assignee id or `unassigned` for group=person. An empty group is left out.
Every card carries its `rung`.
*/
export const focusGroupRows = z.object({
  key: z.string().min(1),
  rows: z.array(taskCard),
})
export type FocusGroupRows = z.infer<typeof focusGroupRows>
export const getFocusResponse = z
  .object({
    groups: z.array(focusGroupRows),
    truncated: z.boolean(),
  })
  .refine((body) => withinCap([groupRows(body.groups)]), { error: OVER_CAP })
export type GetFocusResponse = z.infer<typeof getFocusResponse>

export const getFolderTasksCompletedResponse = getDoneResponse
export type GetFolderTasksCompletedResponse = GetDoneResponse

/*
GET /search. 7.10 writes the row as "TaskCard with status chip", which is a
rendering note and not a shape: the chip is drawn off status, a field every
TaskCard already carries, and Q8's Row line lists what the UI shows rather
than what the wire adds. A second row shape here would be the per-endpoint
variant this file exists to refuse.
*/
/** 7.18's additive result kinds. Each entry carries its kind's
 * identity and enough to route; a client that ignores the new keys sees
 * exactly the v1 response. */
/* Wave 2: a hit's place in the page tree, root first, as the viewer may see
   it (cut at the first ancestor they are not a member of). For a folder hit
   it is that folder's ancestors; for a page hit, the ancestors of its folder
   followed by the folder itself. Optional and additive. */
export const searchCrumb = z.object({ id: z.uuid(), name: z.string() })
export const searchFolderHit = z.object({
  id: z.uuid(),
  name: z.string(),
  breadcrumbs: z.array(searchCrumb).optional(),
})
export const searchShelfHit = z.object({
  id: z.uuid(),
  name: z.string(),
})
export const searchPageHit = z.object({
  block_id: z.uuid(),
  folder_id: z.uuid().nullable(),
  shelf_id: z.uuid().nullable(),
  text: z.string(),
  breadcrumbs: z.array(searchCrumb).optional(),
})

export const getSearchResponse = z.object({
  rows: z.array(taskCard),
  next_cursor: nextCursor,
  folders: z.array(searchFolderHit).optional(),
  shelves: z.array(searchShelfHit).optional(),
  pages: z.array(searchPageHit).optional(),
})
export type GetSearchResponse = z.infer<typeof getSearchResponse>
