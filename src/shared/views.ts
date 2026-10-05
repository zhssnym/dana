/*
The 7.10 views and search queries, response bodies and cursors. Rows are the
7.0 TaskCard from tasks.ts. The 1000-row cap is per response, counted across
all sections. Calendar range checks live in src/server/time; ILIKE escaping
happens where the pattern is built, not here.
*/
import { z } from 'zod'

import { LIST_ROW_CAP } from './list-cap.js'
// A completion day, a calendar boundary and a due date share one format.
import {
  dueDate as calendarDate,
  taskCard,
  taskCardFolder,
  taskStatus,
  taskTitle,
  wallClockTime,
} from './tasks.js'
import { isIanaTimezone } from './timezone.js'

/*
Required, no default: a UTC default would give most users the wrong day
silently (8.1). 7.1's sign-in tz is lenient instead; nothing here applies to it.
*/
export const viewTz = z
  .string({ error: 'must be supplied, as an IANA timezone identifier' })
  .refine(isIanaTimezone, { error: 'must be a valid IANA timezone identifier' })

/* 2 to 100 characters after trim (zod trims before the length checks). The
   floor keeps the '%q%' trigram search from scanning everything. */
export const searchQ = z
  .string({ error: 'must be supplied, as the text to search for' })
  .trim()
  .min(2, { error: 'must be 2 to 100 characters after trimming' })
  .max(100, { error: 'must be 2 to 100 characters after trimming' })

/* Absent defaults to open; "?section=" is present and invalid, so 422. */
export const folderSection = z.enum(['open', 'completed'], {
  error: 'must be open or completed',
})
export type FolderSection = z.infer<typeof folderSection>

/*
Keyset cursors: opaque base64url JSON with a version and a kind. A client sends
next_cursor back byte for byte; null means the end. A cursor of the wrong kind
or a malformed one is 422 naming cursor, never a silent first page.
- Instants stay strings, never Dates: Date truncates to milliseconds while
  timestamptz stores microseconds, so rows at a page boundary would be skipped
  or repeated. Build cursors from the row, not the millisecond card.
- The search cursor holds status, not status_rank, so the rank scale can change.
- The kind names the order: Done and the folder's completed section share one.
btoa/atob, not Buffer: this directory also builds into the browser bundle.
*/
const CURSOR_VERSION = 1

type CursorKind = 'completed' | 'search'

/* Requires an explicit zone: a cursor is compared against timestamptz values. */
const cursorInstant = z
  .string({ error: 'must be a string' })
  .regex(
    /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/,
    { error: 'must be a timestamp carrying an explicit UTC offset' },
  )

const cursorId = z.uuid({ error: 'must be a uuid' })

/** The last row's (completed_at, id), descending. */
export const completedCursor = z.object({
  completed_at: cursorInstant,
  id: cursorId,
})
export type CompletedCursor = z.infer<typeof completedCursor>

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

/* Throws on an invalid payload: inputs are the server's own rows, so a bad one
   (such as a Date) is a caller defect, not a truncated position. */
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

/* Decodes inside the schema so every bad cursor is one 422 naming cursor. */
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

/* z.string refuses repeated parameters (arrays), so ?tz=a&tz=b is 422. */
export const viewQuery = z.object({ tz: viewTz })
export type ViewQuery = z.infer<typeof viewQuery>

/* Range validity (inversion, over 62 days) is checkCalendarRange in src/server/time. */
export const plannedCalendarQuery = viewQuery.extend({
  start: calendarDate,
  end: calendarDate,
  folder_id: z.uuid({ error: 'must be a uuid' }).optional(),
})
export type PlannedCalendarQuery = z.infer<typeof plannedCalendarQuery>

export const doneQuery = viewQuery.extend({
  cursor: cursorParam('completed', completedCursor).optional(),
})
export type DoneQuery = z.infer<typeof doneQuery>

/* A cursor with section=open is accepted and ignored. */
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
GET /views/focus: filters over the viewer's pending tasks (server/views/focus.ts).
`important` is the two words because z.coerce.boolean reads "false" as true.
`group=today` gives Today's four headings and needs `when=on_today`.
*/
export const focusWhen = z.enum(['any', 'on_today', 'upcoming', 'overdue', 'undated'])
export type FocusWhen = z.infer<typeof focusWhen>
export const focusGroup = z.enum(['none', 'today'])
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

/* Lives in list-cap.ts because labels.ts needs it and importing this file
   from there would make an import cycle. */
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

/*
Folder is the TaskCard folder stub, not the 7.0 Folder object. z.object would
strip a Folder's extra keys, so views-harness.ts checks this key-exact on the wire.
*/
export const taskCardGroup = z.object({
  folder: taskCardFolder,
  rows: z.array(taskCard),
})
export type TaskCardGroup = z.infer<typeof taskCardGroup>

/* Completions grouped by civil date in the viewer's zone. */
export const completedDay = z.object({
  date: calendarDate,
  rows: z.array(taskCard),
})
export type CompletedDay = z.infer<typeof completedDay>

/*
Calendar ghosts: not TaskCards. task_id is the current occurrence's row, which
opening a ghost opens. Bounded only by the 62-day range; 7.10 gives no cap.
*/
export const virtualInstance = z.object({
  task_id: z.uuid(),
  title: taskTitle,
  date: calendarDate,
  due_time: wallClockTime.nullable(),
  folder_id: z.uuid(),
})
export type VirtualInstance = z.infer<typeof virtualInstance>

/** Opaque to the client; null is the end of the list. */
const nextCursor = z.string().min(1).nullable()

/* The 7.10 bodies. The calendar is bounded by days and Done, completed and
   search are keyset-paginated, so they carry no row-cap refinement. */

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

// GET /views/tasks. Default-folder rows ungrouped, then one group per folder.
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

export const getPlannedResponse = z
  .object({
    rows: z.array(taskCard),
    truncated: z.boolean(),
  })
  .refine((body) => withinCap([body.rows]), { error: OVER_CAP })
export type GetPlannedResponse = z.infer<typeof getPlannedResponse>

export const getPlannedCalendarResponse = z.object({
  real: z.array(taskCard),
  virtual: z.array(virtualInstance),
})
export type GetPlannedCalendarResponse = z.infer<
  typeof getPlannedCalendarResponse
>

export const getImportantResponse = z
  .object({
    rows: z.array(taskCard),
    truncated: z.boolean(),
  })
  .refine((body) => withinCap([body.rows]), { error: OVER_CAP })
export type GetImportantResponse = z.infer<typeof getImportantResponse>

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

// Keyset-paginated at 50 a page.
export const getDoneResponse = z.object({
  days: z.array(completedDay),
  next_cursor: nextCursor,
})
export type GetDoneResponse = z.infer<typeof getDoneResponse>

/* GET /folders/:id/tasks: two schemas, one per section, since the query already chose. */
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
`all` for group=none; `carried`, `today`, `started`, `added` for group=today.
An empty group is left out.
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

/* GET /search. Rows are plain TaskCards. Folder, shelf and page hits are additive;
   breadcrumbs are cut at the first ancestor the viewer cannot see. */
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
