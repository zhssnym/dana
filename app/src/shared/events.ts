/* The 7.12 events and notifications contract. Events are read-only on the wire. */
import { z } from 'zod'

/** 4.13's verb CHECK, for the client; no client ever sends a verb. */
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
  'mentioned',
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
  /** The task a comment subject sits on, else null. */
  task_id: string | null
  /** The Discussion a comment subject sits in, else null. Optional only for old fixtures. */
  discussion_id?: string | null
  event: EventLine
}

const subjectRef = z
  .string()
  .regex(
    /^(task|folder|shelf|comment):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    'must be kind:id, where kind is task, folder, shelf or comment and id is a uuid',
  )

/** Exactly one scope: a folder's activity or one subject's history, never everything. */
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

/* Zod read halves, which the client parses every response through. */
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

/* Wrapped with `truncated`, since these lists carry 10.3's cap. */
export const getEventsResponse = z.object({
  events: z.array(eventLine),
  truncated: z.boolean(),
})
export type GetEventsResponse = z.infer<typeof getEventsResponse>

export const notificationLine = z.object({
  id: z.uuid(),
  read_at: z.string().nullable(),
  created_at: z.string(),
  task_id: z.uuid().nullable(),
  discussion_id: z.uuid().nullable().optional(),
  event: eventLine,
})

export const getNotificationsResponse = z.object({
  notifications: z.array(notificationLine),
  truncated: z.boolean(),
})
export type GetNotificationsResponse = z.infer<typeof getNotificationsResponse>

/** `{ read: true }` for one; read-all answers the number of rows changed. */
export const postNotificationReadResponse = z.object({ read: z.literal(true) })
export const postNotificationsReadAllResponse = z.object({
  read: z.number().int(),
})
