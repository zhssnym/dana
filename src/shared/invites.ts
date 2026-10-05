/*
The 7.5 invite request body and response shapes. Bodies are z.object (unknown
fields stripped); messages omit the field name because sendValidationError
prefixes the path.
*/
import { z } from 'zod'

import { folderAccessPreset } from './folder-access.js'
import { responsibilityDocument } from './responsibility.js'

import { folder, folderMember, folderName } from './folders.js'

/*
Lowercased here because every later rule (own-email refusal, roster conversion,
INV-11 dedupe) compares case-insensitively, and the column CHECKs lowercase.
Not trimmed: an address with a space is invalid.
*/
export const emailAddress = z
  .email({ error: 'must be a syntactically valid email address' })
  .max(320, { error: 'must be at most 320 characters' })
  .toLowerCase()

const uuid = z.uuid({ error: 'must be a uuid' })

/*
POST /invites. `task_id` requires `folder_id` (else the CHECK would answer 500).
`access` is required exactly with `folder_id`, with no default: someone must
choose the preset. Explicit null is refused, not read as absent. Everything
else V-INV checks needs rows and is the server's.
*/
export const postInvitesBody = z
  .object({
    email: emailAddress,
    folder_id: uuid.optional(),
    task_id: uuid.optional(),
    access: folderAccessPreset.optional(),
    /*
    Optional first Responsibility, only with a folder. On acceptance it becomes
    the first revision attributed to the inviter, not the recipient.
    */
    responsibility: responsibilityDocument.optional(),
  })
  .refine(
    (body) => body.task_id === undefined || body.folder_id !== undefined,
    { error: 'requires a folder_id', path: ['task_id'] },
  )
  .refine((body) => (body.folder_id === undefined) === (body.access === undefined), {
    error: 'is required with a folder_id, and is not accepted without one',
    path: ['access'],
  })
  .refine(
    (body) => body.responsibility === undefined || body.folder_id !== undefined,
    { error: 'is not accepted without a folder_id', path: ['responsibility'] },
  )
export type PostInvitesBody = z.infer<typeof postInvitesBody>

/* The transition endpoints (accept, decline, cancel, resend) take no body. */

export const inviteStatus = z.enum([
  'pending',
  'accepted',
  'declined',
  'canceled',
  'invalidated',
])
export type InviteStatus = z.infer<typeof inviteStatus>

/*
Responses: the 201's `invite`, the sent-list element and the decline/cancel/
resend answers are one object. A conversion answers the 7.4 member element.
Acceptance answers the full 7.0 Folder, which the client has no other way to learn.
*/

/*
Null folder_id and folder_name mean a bare invite. `accepted_by` is withheld:
it is a bare user id with no person shape here.
*/
export const invite = z.object({
  id: uuid,
  email: z.string().min(1),
  folder_id: uuid.nullable(),
  folder_name: folderName.nullable(),
  task_id: uuid.nullable(),
  status: inviteStatus,
  created_at: z.iso.datetime(),
  last_sent_at: z.iso.datetime(),
  responded_at: z.iso.datetime().nullable(),
})
export type Invite = z.infer<typeof invite>

/* The 201 success shape. Kept separate because decline/cancel/resend always
   return this wrapper, while POST /invites itself also has the conversion arm. */
const postInvitesCreatedResponse = z.object({ invite })

/* The instant-share answer. */
export const postInvitesConversionResponse = z.object({
  converted_to_share: z.literal(true),
  membership: folderMember,
})
export type PostInvitesConversionResponse = z.infer<
  typeof postInvitesConversionResponse
>

/* The client parses through this union so an instant share is a success too. */
export const postInvitesResponse = z.union([
  postInvitesCreatedResponse,
  postInvitesConversionResponse,
])
export type PostInvitesResponse = z.infer<typeof postInvitesResponse>

/* GET /invites/sent: newest first, any status, a bare array. */
export const getInvitesSentResponse = z.array(invite)
export type GetInvitesSentResponse = z.infer<typeof getInvitesSentResponse>

/*
GET /invites/pending, for the login surface. The inviter's id is included
because a person's default face is derived from it (client/parts/person-tint.ts).
*/
export const pendingInvite = z.object({
  id: uuid,
  inviter: z.object({
    id: uuid,
    display_name: z.string().nullable(),
    avatar_url: z.string().nullable(),
  }),
  folder_name: folderName.nullable(),
  created_at: z.iso.datetime(),
})
export type PendingInvite = z.infer<typeof pendingInvite>

export const getInvitesPendingResponse = z.array(pendingInvite)
export type GetInvitesPendingResponse = z.infer<
  typeof getInvitesPendingResponse
>

/*
POST /invites/:id/accept. `connection_created` is false when the pair already
existed. `folder` is null for a bare invite or an existing member;
`assigned_task_id` is null when the assignment was skipped (AC-066).
*/
export const acceptInviteResponse = z.object({
  connection_created: z.boolean(),
  folder: folder.nullable(),
  assigned_task_id: uuid.nullable(),
})
export type AcceptInviteResponse = z.infer<typeof acceptInviteResponse>

/* Separate names so one endpoint's response can change without the others. */
export const declineInviteResponse = postInvitesCreatedResponse
export const cancelInviteResponse = postInvitesCreatedResponse
export const resendInviteResponse = postInvitesCreatedResponse