/*
The 7.12 contract: events and notifications (RFC 0005). Events are read-only
on the wire, written only by the 10.2 chokepoint, so the request side here is
two query shapes and two read-state posts; the response side is the event
line every history surface renders.
*/
import { z } from 'zod'

/** 4.13's verb set, the CHECK constraint restated for the client's benefit;
 * the server never validates an inbound verb because no client sends one. */
export const EVENT_VERBS = [
  'created',
  'renamed',
  'edited',
  'moved',
  'completed',
  'reopened',
  'abandoned',
  'restored',
  'duplicated',
  'removed',
  'deleted',
  'left',
] as const
export type EventVerb = (typeof EVENT_VERBS)[number]

export const EVENT_SUBJECT_KINDS = [
  'task',
  'folder',
  'shelf',
  'comment',
] as const
export type EventSubjectKind = (typeof EVENT_SUBJECT_KINDS)[number]

export interface EventLine {
  id: string
  actor_id: string
  verb: EventVerb
  subject_kind: EventSubjectKind
  subject_id: string
  subject_name: string
  folder_id: string | null
  detail: string | null
  created_at: string
}

export interface NotificationLine {
  id: string
  read_at: string | null
  created_at: string
  event: EventLine
}

const subjectRef = z
  .string()
  .regex(
    /^(task|folder|shelf|comment):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    'must be kind:id, one of 4.13\'s subject kinds carrying a uuid',
  )

/** GET /events takes exactly one of the two scopes (7.12): a folder's
 * activity or one subject's history. Both at once is a malformed ask, and
 * neither is a request for everything, which no viewer is owed. */
export const eventsQuery = z
  .object({
    folder: z.uuid().optional(),
    subject: subjectRef.optional(),
  })
  .refine(
    (query) => (query.folder === undefined) !== (query.subject === undefined),
    { message: 'exactly one of folder and subject must be supplied' },
  )
export type EventsQuery = z.infer<typeof eventsQuery>

export function parseSubjectRef(ref: string): {
  kind: EventSubjectKind
  id: string
} {
  const colon = ref.indexOf(':')
  return {
    kind: ref.slice(0, colon) as EventSubjectKind,
    id: ref.slice(colon + 1),
  }
}

/*
The read half, added by the S9 client arm on 2026-08-24, for the reason
`shelves.ts`, `bundle.ts` and `trash.ts` record at their own additions: the
v2 packages published query shapes and interfaces but no zod schema for what
a read answers, and `api/http.ts` parses every response through one. Recorded
with those three as one change control item.
*/
export const eventLine = z.object({
  id: z.uuid(),
  actor_id: z.uuid(),
  verb: z.enum(EVENT_VERBS),
  subject_kind: z.enum(EVENT_SUBJECT_KINDS),
  subject_id: z.uuid(),
  subject_name: z.string(),
  folder_id: z.uuid().nullable(),
  detail: z.string().nullable(),
  created_at: z.string(),
})

/*
The envelope, not a bare array: the three list reads all carry 10.3's
list cap and report whether they hit it, so a client can render section
6's truncation line rather than silently showing the first thousand of
something longer. Written from `domain/events.ts` rather than guessed,
after a guess got it wrong and the parse failed silently in the window
bar, which is the failure mode a response schema exists to make loud.
*/
export const getEventsResponse = z.object({
  events: z.array(eventLine),
  truncated: z.boolean(),
})
export type GetEventsResponse = z.infer<typeof getEventsResponse>

/*
The notifications read (7.12), added by the S12 client arm on 2026-08-25 for
the reason the read half above records: `api/http.ts` parses every response
through a schema, and S3 published `NotificationLine` with no zod for it.
Written from `domain/events.ts`'s `listNotifications`, the same discipline as
`getEventsResponse` beside it, and recorded with the S9 additions as one
change control item.
*/
export const notificationLine = z.object({
  id: z.uuid(),
  read_at: z.string().nullable(),
  created_at: z.string(),
  event: eventLine,
})

export const getNotificationsResponse = z.object({
  notifications: z.array(notificationLine),
  truncated: z.boolean(),
})
export type GetNotificationsResponse = z.infer<typeof getNotificationsResponse>

/** POST /notifications/:id/read answers { read: true }; read-all answers
 * { read: N }, N the rows the pass flipped. Both from `routes/events.ts`. */
export const postNotificationReadResponse = z.object({ read: z.literal(true) })
export const postNotificationsReadAllResponse = z.object({
  read: z.number().int(),
})
