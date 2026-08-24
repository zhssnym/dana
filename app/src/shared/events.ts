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
