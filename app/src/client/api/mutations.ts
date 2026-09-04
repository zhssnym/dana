/*
Every write this client makes.

Two conventions, both of which a page relies on and neither of which a page
implements:

- **A mutation invalidates nothing itself.** `queryClient.ts` invalidates on
  every success, which is 8.3's "refetch the active view after each own
  mutation" applied uniformly. A hook here that added its own invalidation
  would be adding a second strategy to a client 11.4 gives exactly one.
- **A mutation reports nothing itself.** The mutation cache raises 9.1's
  toasts off the error type. A hook that caught its own failure would be the
  page-specific error treatment the shared states exist to prevent.

So a hook here is a request and a shape, and that is all it should ever grow
into.

The tz parameters are 7.6's and 7.8's, entered by owner ruling on 2026-08-10
and 2026-08-08: complete and abandon evaluate a calendar date when they
generate a successor, and the pull dates its entry in the zone the request
carries. They are not view endpoints, so `mutateApi` does not add tz for
them; each call site that needs one asks for it, and the two that do are the
ones section 7 names.
*/
import { useMutation } from '@tanstack/react-query'
import type { UseMutationResult } from '@tanstack/react-query'

import {
  deleteFolderResponse,
  folder,
  patchFolderMyMembershipResponse,
  patchFolderResponse,
  postFolderMembersResponse,
  transferOwnershipResponse,
} from '../../shared/folders.js'
import type {
  DeleteFolderResponse,
  Folder,
  FolderMember,
  PatchFolderBody,
  PatchFolderMyMembershipBody,
  PostFoldersBody,
  TransferOwnershipResponse,
} from '../../shared/folders.js'
import { getSettingsResponse, savedView } from '../../shared/bundle.js'
import { SAMPLE_KEPT_HEADER, sampleStatus } from '../../shared/sample.js'
import type { SampleStatus } from '../../shared/sample.js'
import type {
  GetSettingsResponse,
  PatchSettingsBody,
  PatchViewBody,
  PostViewBody,
  SavedView,
} from '../../shared/bundle.js'
import {
  acceptInviteResponse,
  cancelInviteResponse,
  declineInviteResponse,
  postInvitesBody,
  postInvitesResponse,
  resendInviteResponse,
} from '../../shared/invites.js'
import type {
  AcceptInviteResponse,
  PostInvitesBody,
  PostInvitesResponse,
} from '../../shared/invites.js'
import {
  patchStepResponse,
  patchTaskResponse,
  postTaskStepsResponse,
  postTasksResponse,
  putTaskReminderResponse,
  taskTransitionResponse,
} from '../../shared/tasks.js'
import type {
  PatchStepBody,
  PatchTaskBody,
  PostTaskOrderBody,
  PostTasksBody,
  PutTaskReminderBody,
  TaskDetail,
  TaskTransitionResponse,
} from '../../shared/tasks.js'
import { deleteTaskMyDayResponse, postTaskMyDayResponse } from '../../shared/tasks.js'
import {
  commentLine,
  patchCommentResponse,
} from '../../shared/comments.js'
import type { CommentLine, PatchCommentBody, PostCommentBody } from '../../shared/comments.js'
import {
  postNotificationReadResponse,
  postNotificationsReadAllResponse,
} from '../../shared/events.js'
import { duplicateFolderResponse } from '../../shared/folders.js'
import type { DuplicateFolderResponse } from '../../shared/folders.js'
import { getPageResponse } from '../../shared/pages.js'
import type { GetPageResponse, PutPageBody } from '../../shared/pages.js'
import { shelf } from '../../shared/shelves.js'
import type { PatchShelfBody, PostShelvesBody, Shelf } from '../../shared/shelves.js'

import {
  importWorkflowResponse,
  needsImportAnchor,
} from '../../shared/workflows.js'
import type {
  ImportWorkflowBody,
  ImportWorkflowResponse,
} from '../../shared/workflows.js'

import { defaultFolderDescription } from '../lib/folder-description.js'
import { mutateApi, requestTimezone } from './http.js'
import { VALIDATION_ERROR_TOAST_META } from './queryClient.js'

/*
Making a folder is one request, and it has to stay one.

A default description was written here for one revision with a second call,
`PATCH /folders/:id` sent the moment the POST answered. It cost the criterion
that watches this act: AC-279 reads every mutation the hold makes between the
confirm and the API going quiet and expects one `POST /folders` plus one
`PATCH /tasks/:id` per task moved and nothing else, RFC 0005 change control
item 44's "the gesture is a composition of two existing endpoints and adds
none". Every folder made anywhere in the client comes through here, the hold's
panel included (`pages/task-rows.tsx`'s `onMerge`), so the extra call failed
that criterion from every door.

**The wording rides the POST now** (7.4's dated paragraph of 2026-09-04,
issues #21 and #70, and AC-377): `postFoldersBody` takes `description`, the
route reads it and `domain/folders.ts` inserts it, so the sentence a new
folder opens with costs no second call. The default is written here rather
than at each door, because here is the one door: a caller that has its own
wording still wins, the spread reading its key when it carries one.
*/
export function useCreateFolder(): UseMutationResult<Folder, Error, PostFoldersBody> {
  return useMutation({
    mutationFn: (body: PostFoldersBody) =>
      mutateApi(folder, {
        method: 'POST',
        path: '/folders',
        body: { description: defaultFolderDescription(body.name), ...body },
      }),
  })
}

export function useCreateTask(): UseMutationResult<TaskDetail, Error, PostTasksBody> {
  return useMutation({
    mutationFn: (body: PostTasksBody) =>
      mutateApi(postTasksResponse, { method: 'POST', path: '/tasks', body }),
  })
}

export interface PatchTaskVariables {
  readonly id: string
  readonly body: PatchTaskBody
}

export function useUpdateTask(): UseMutationResult<TaskDetail, Error, PatchTaskVariables> {
  return useMutation({
    mutationFn: ({ id, body }: PatchTaskVariables) =>
      mutateApi(patchTaskResponse, { method: 'PATCH', path: `/tasks/${id}`, body }),
  })
}

/**
 * DELETE /tasks/:id, which 9.3 puts in the form's overflow menu and 9.4 in a
 * row's, both behind that section's confirmation.
 *
 * 7.6 answers 204, so nothing is parsed: `mutateApi(null, ...)` is the arm
 * that exists for the three mutations of section 7 with no body.
 */
export function useDeleteTask(): UseMutationResult<void, Error, string> {
  return useMutation({
    mutationFn: (id: string) => mutateApi(null, { method: 'DELETE', path: `/tasks/${id}` }),
  })
}

export interface OrderTaskVariables {
  readonly id: string
  readonly body: PostTaskOrderBody
}

/**
 * 7.6's order endpoint (RFC 0005 change control item 44, B4), wired at S23a.
 * The body names the two neighbours and nothing else; the key is the
 * server's arithmetic, and the answer is the placed task as a fresh
 * GET /tasks/:id would give it.
 */
export function useOrderTask(): UseMutationResult<TaskDetail, Error, OrderTaskVariables> {
  return useMutation({
    mutationFn: ({ id, body }: OrderTaskVariables) =>
      mutateApi(patchTaskResponse, { method: 'POST', path: `/tasks/${id}/order`, body }),
  })
}

/** 7.7's append, which answers the affected TaskDetail rather than the step. */
export interface AddStepVariables {
  readonly taskId: string
  readonly title: string
}

export function useAddStep(): UseMutationResult<TaskDetail, Error, AddStepVariables> {
  return useMutation({
    mutationFn: ({ taskId, title }: AddStepVariables) =>
      mutateApi(postTaskStepsResponse, {
        method: 'POST',
        path: `/tasks/${taskId}/steps`,
        body: { title },
      }),
  })
}

export interface PatchStepVariables {
  readonly stepId: string
  readonly body: PatchStepBody
}

export function useUpdateStep(): UseMutationResult<TaskDetail, Error, PatchStepVariables> {
  return useMutation({
    mutationFn: ({ stepId, body }: PatchStepVariables) =>
      mutateApi(patchStepResponse, { method: 'PATCH', path: `/steps/${stepId}`, body }),
  })
}

export function useDeleteStep(): UseMutationResult<void, Error, string> {
  return useMutation({
    mutationFn: (stepId: string) =>
      mutateApi(null, { method: 'DELETE', path: `/steps/${stepId}` }),
  })
}

/**
 * DELETE /folders/:id, behind 9.6's confirm.
 *
 * 7.4 answers 200 with the counts of what the cascade removed, "so the client
 * can confirm what the dialog promised". The shape is parsed for that reason
 * rather than discarded, even though nothing renders it yet.
 */
export function useDeleteFolder(): UseMutationResult<DeleteFolderResponse, Error, string> {
  return useMutation({
    mutationFn: (id: string) =>
      mutateApi(deleteFolderResponse, { method: 'DELETE', path: `/folders/${id}` }),
  })
}

/* ------------------------------------------------------------------ *
 * 9.6's folder header and sharing panel
 * ------------------------------------------------------------------ */

/**
 * PATCH /folders/:id, 9.6's inline rename. Owner only by 5.4, which the
 * server decides; the client's half is not offering the control to anyone
 * else, and 7.4 answers the Folder object a fresh GET would.
 */
export interface RenameFolderVariables {
  readonly id: string
  readonly body: PatchFolderBody
}

export function useRenameFolder(): UseMutationResult<Folder, Error, RenameFolderVariables> {
  return useMutation({
    mutationFn: ({ id, body }: RenameFolderVariables) =>
      mutateApi(patchFolderResponse, { method: 'PATCH', path: `/folders/${id}`, body }),
  })
}

/**
 * PATCH /folders/:id/my-membership, 9.6's "Label and color personal".
 *
 * Personal in the strong sense: 7.4 stores both on the viewer's own
 * membership row, so the same folder sits inside a label group for one member
 * and among the unlabeled for another, which is what 9.1's sidebar renders
 * and AC-155's fourth case measures.
 */
export interface UpdateMyMembershipVariables {
  readonly id: string
  readonly body: PatchFolderMyMembershipBody
}

export function useUpdateMyMembership(): UseMutationResult<
  Folder,
  Error,
  UpdateMyMembershipVariables
> {
  return useMutation({
    mutationFn: ({ id, body }: UpdateMyMembershipVariables) =>
      mutateApi(patchFolderMyMembershipResponse, {
        method: 'PATCH',
        path: `/folders/${id}/my-membership`,
        body,
      }),
  })
}

/** POST /folders/:id/members, the roster picker of 9.6's sharing panel. */
export interface AddFolderMemberVariables {
  readonly folderId: string
  readonly userId: string
}

export function useAddFolderMember(): UseMutationResult<
  FolderMember,
  Error,
  AddFolderMemberVariables
> {
  return useMutation({
    mutationFn: ({ folderId, userId }: AddFolderMemberVariables) =>
      mutateApi(postFolderMembersResponse, {
        method: 'POST',
        path: `/folders/${folderId}/members`,
        body: { user_id: userId },
      }),
  })
}

/**
 * DELETE /folders/:id/members/:userId, which is three actions of 5.3 behind
 * one endpoint: an owner removing a member, a member leaving, and an owner
 * leaving through the transfer of 8.9. The client sends the same request for
 * all three and the server decides which one it was, so nothing here encodes
 * a permission the matrix of 5.4 already holds.
 */
export interface RemoveFolderMemberVariables {
  readonly folderId: string
  readonly userId: string
}

export function useRemoveFolderMember(): UseMutationResult<
  void,
  Error,
  RemoveFolderMemberVariables
> {
  return useMutation({
    mutationFn: ({ folderId, userId }: RemoveFolderMemberVariables) =>
      mutateApi(null, {
        method: 'DELETE',
        path: `/folders/${folderId}/members/${userId}`,
      }),
  })
}

/* ------------------------------------------------------------------ *
 * 7.5's four invite transitions
 * ------------------------------------------------------------------ */

/**
 * POST /invites/:id/accept, the Q12 login surface's affirmative.
 *
 * The response carries the full Folder object rather than the group-heading
 * stub (7.5, settled 2026-08-10), which is what lets 9.8's "accepting a
 * folder invite lands inside that folder" navigate without a second read.
 */
export function useAcceptInvite(): UseMutationResult<AcceptInviteResponse, Error, string> {
  return useMutation({
    mutationFn: (id: string) =>
      mutateApi(acceptInviteResponse, { method: 'POST', path: `/invites/${id}/accept` }),
  })
}

export function useDeclineInvite(): UseMutationResult<PostInvitesResponse, Error, string> {
  return useMutation({
    mutationFn: (id: string) =>
      mutateApi(declineInviteResponse, { method: 'POST', path: `/invites/${id}/decline` }),
  })
}

export function useCancelInvite(): UseMutationResult<PostInvitesResponse, Error, string> {
  return useMutation({
    mutationFn: (id: string) =>
      mutateApi(cancelInviteResponse, { method: 'POST', path: `/invites/${id}/cancel` }),
  })
}

/**
 * POST /invites/:id/resend. 7.5 answers 429 inside 24 hours, which 9.6 turns
 * into a disabled control with the tooltip "Resent recently" rather than a
 * request the person makes and is refused; the server still refuses it, which
 * is what makes the disabling a convenience (7.11) rather than the rule.
 */
export function useResendInvite(): UseMutationResult<PostInvitesResponse, Error, string> {
  return useMutation({
    mutationFn: (id: string) =>
      mutateApi(resendInviteResponse, { method: 'POST', path: `/invites/${id}/resend` }),
  })
}

/**
 * DELETE /connections/:userId, 9.8's roster removal, behind that section's
 * own confirm. 7.3 lets either side call it and answers 204.
 */
export function useRemoveConnection(): UseMutationResult<void, Error, string> {
  return useMutation({
    mutationFn: (userId: string) =>
      mutateApi(null, { method: 'DELETE', path: `/connections/${userId}` }),
  })
}

export type TransitionEvent = 'complete' | 'uncomplete' | 'abandon' | 'restore'

export interface TransitionVariables {
  readonly id: string
  readonly event: TransitionEvent
}

export function useTransitionTask(): UseMutationResult<
  TaskTransitionResponse,
  Error,
  TransitionVariables
> {
  return useMutation({
    mutationFn: ({ id, event }: TransitionVariables) =>
      mutateApi(taskTransitionResponse, {
        method: 'POST',
        path: `/tasks/${id}/${event}`,
        // Only the two generating transitions take one (7.6). The other two
        // evaluate no calendar date, and sending a parameter an endpoint does
        // not enumerate is not a courtesy.
        params:
          event === 'complete' || event === 'abandon'
            ? { tz: requestTimezone() }
            : undefined,
      }),
  })
}

export interface PutReminderVariables {
  readonly taskId: string
  readonly body: PutTaskReminderBody
}

/**
 * Frozen 7.9's PUT, the edit path's half of the reminder write.
 *
 * It answers the affected TaskDetail, by the owner's ruling of 2026-08-10:
 * 7.0 gives the reminder no object of its own, this section offers no GET for
 * one, and TaskDetail already carries a reminder field, so the parent task is
 * the only object the contract holds that reports what the call did. Parsed
 * against that shape for the same reason every other response here is.
 *
 * The body carries exactly one of the two 4.8 columns, which the shared schema
 * refuses to let it get wrong, and which mode is correct is decided by the
 * task's due_time (9.3, and 7.9's own 422).
 */
export function usePutReminder(): UseMutationResult<
  TaskDetail,
  Error,
  PutReminderVariables
> {
  return useMutation({
    mutationFn: ({ taskId, body }: PutReminderVariables) =>
      mutateApi(putTaskReminderResponse, {
        method: 'PUT',
        path: `/tasks/${taskId}/reminder`,
        body,
      }),
  })
}

/**
 * Frozen 7.9's DELETE, which is how a reminder is removed and the only way.
 *
 * No task body expresses a removal: 7.6's create arm sets one and its PATCH
 * carries no reminder key at all, so an emptied control on an existing task
 * has exactly this endpoint and nothing else. 204, idempotent, so calling it
 * on a task that has none is a no-op rather than an error.
 */
export function useDeleteReminder(): UseMutationResult<void, Error, string> {
  return useMutation({
    mutationFn: (taskId: string) =>
      mutateApi(null, { method: 'DELETE', path: `/tasks/${taskId}/reminder` }),
  })
}

export function usePullIntoMyDay(): UseMutationResult<TaskDetail, Error, string> {
  return useMutation({
    mutationFn: (id: string) =>
      mutateApi(postTaskMyDayResponse, {
        method: 'POST',
        path: `/tasks/${id}/my-day`,
        params: { tz: requestTimezone() },
      }),
  })
}

export function useRemoveFromMyDay(): UseMutationResult<TaskDetail, Error, string> {
  return useMutation({
    mutationFn: (id: string) =>
      mutateApi(deleteTaskMyDayResponse, {
        method: 'DELETE',
        path: `/tasks/${id}/my-day`,
      }),
  })
}

export function useCreateInvite(): UseMutationResult<
  PostInvitesResponse,
  Error,
  PostInvitesBody
> {
  return useMutation({
    mutationFn: (body: PostInvitesBody) => {
      // The shared body schema as 7.11's client convenience: it shapes the
      // request and decides nothing. Every rule it appears to enforce is
      // enforced again by the server, which is what makes this convenience
      // rather than authority.
      const parsed = postInvitesBody.parse(body)
      return mutateApi(postInvitesResponse, {
        method: 'POST',
        path: '/invites',
        body: parsed,
      })
    },
  })
}

/* ------------------------------------------------------------------ *
 * The v2 surfaces (RFC 0005)
 * ------------------------------------------------------------------ */

/**
 * The 4.19 bundle's write, at the v2 address, and the client's only settings
 * write.
 *
 * It owns the pin list, the theme, the density, the clock, the task-open
 * surface, the calendar's zoom and the arrangements. A `useUpdateSettings`
 * over frozen 7.2's `/me/settings` stood beside it until issue #150, called
 * by nothing: the three v1 page flags are still the server's and still derive
 * into the pin list, and no surface in this client writes them directly.
 */
export function usePatchBundle(): UseMutationResult<
  GetSettingsResponse,
  Error,
  PatchSettingsBody
> {
  return useMutation({
    mutationFn: (body: PatchSettingsBody) =>
      mutateApi(getSettingsResponse, { method: 'PATCH', path: '/settings', body }),
  })
}

/**
 * 7.13's folder restore.
 *
 * The task restore is not here and that is not an omission: 7.13 and frozen
 * 7.6 share one address, `POST /tasks/:id/restore`, the server forking on the
 * row's state because the two meanings have disjoint domains (S3's own
 * ruling). `useTransitionTask` already sends it, so a trashed task is
 * restored by the transition hook this client has had since P5.
 */
export function useRestoreFolder(): UseMutationResult<Folder, Error, string> {
  return useMutation({
    mutationFn: (id: string) =>
      mutateApi(folder, { method: 'POST', path: `/folders/${id}/restore` }),
  })
}

/* ------------------------------------------------------------------ *
 * The S12 writes (RFC 0005): pages, shelves, notifications, comments
 * ------------------------------------------------------------------ */

export interface PutPageVariables {
  readonly id: string
  readonly body: PutPageBody
}

/**
 * PUT /folders/:id/page (7.16): the block list whole, LWW per block.
 *
 * A stale write answers 409 carrying 5.1's copy, which the mutation cache
 * already raises as the toast 9.1 names for it; the page that issued the
 * write refetches at its own call site so the winning state replaces the
 * stale one on screen, both halves of "handled visibly" (RFC 0004's S12
 * acceptance) without this hook growing either.
 */
export function usePutFolderPage(): UseMutationResult<
  GetPageResponse,
  Error,
  PutPageVariables
> {
  return useMutation({
    mutationFn: ({ id, body }: PutPageVariables) =>
      mutateApi(getPageResponse, { method: 'PUT', path: `/folders/${id}/page`, body }),
  })
}

export function usePutShelfPage(): UseMutationResult<
  GetPageResponse,
  Error,
  PutPageVariables
> {
  return useMutation({
    mutationFn: ({ id, body }: PutPageVariables) =>
      mutateApi(getPageResponse, { method: 'PUT', path: `/shelves/${id}/page`, body }),
  })
}

export function useCreateShelf(): UseMutationResult<Shelf, Error, PostShelvesBody> {
  return useMutation({
    mutationFn: (body: PostShelvesBody) =>
      mutateApi(shelf, { method: 'POST', path: '/shelves', body }),
  })
}

export interface PatchShelfVariables {
  readonly id: string
  readonly body: PatchShelfBody
}

/** PATCH /shelves/:id (7.16): rename rewrites the member labels in the same
 * transaction, 4.18's name-and-label lockstep, so no client bookkeeping. */
export function usePatchShelf(): UseMutationResult<Shelf, Error, PatchShelfVariables> {
  return useMutation({
    mutationFn: ({ id, body }: PatchShelfVariables) =>
      mutateApi(shelf, { method: 'PATCH', path: `/shelves/${id}`, body }),
  })
}

/** DELETE /shelves/:id: unlabels its folders and keeps them (9.10). */
export function useDeleteShelf(): UseMutationResult<void, Error, string> {
  return useMutation({
    mutationFn: (id: string) =>
      mutateApi(null, { method: 'DELETE', path: `/shelves/${id}` }),
  })
}

/** POST /folders/:id/duplicate (7.16): DES-198's copy rules server-side;
 * the answer is the copy's identity, which the caller navigates to. The tz is
 * the day a spent plan re-anchors on, the viewer's rather than the database's
 * (8.1, issue #76); without it the endpoint refuses a copy that would move a
 * date. */
export function useDuplicateFolder(): UseMutationResult<
  DuplicateFolderResponse,
  Error,
  string
> {
  return useMutation({
    mutationFn: (id: string) =>
      mutateApi(duplicateFolderResponse, {
        method: 'POST',
        path: `/folders/${id}/duplicate`,
        params: { tz: requestTimezone() },
      }),
  })
}

export function useMarkNotificationRead(): UseMutationResult<
  { read: true },
  Error,
  string
> {
  return useMutation({
    mutationFn: (id: string) =>
      mutateApi(postNotificationReadResponse, {
        method: 'POST',
        path: `/notifications/${id}/read`,
      }),
  })
}

export function useMarkAllNotificationsRead(): UseMutationResult<
  { read: number },
  Error,
  void
> {
  return useMutation({
    mutationFn: () =>
      mutateApi(postNotificationsReadAllResponse, {
        method: 'POST',
        path: '/notifications/read-all',
      }),
  })
}

export interface PostCommentVariables {
  readonly folderId: string
  readonly body: PostCommentBody
  /*
  Which task's thread this joins, added at S26 for the mount ledger L-246
  names.

  It is a query parameter rather than a body field because that is where 7.14
  puts it: `routes/conversation.ts` parses `threadQuery` off `req.query` on
  both the read and the write, and `postCommentBody` carries no task at all.
  The read half has taken one since S5 (`useThread`'s second argument); this
  is the write half catching up, and nothing about the frozen contract moves.
  */
  readonly taskId?: string
}

export function usePostComment(): UseMutationResult<
  CommentLine,
  Error,
  PostCommentVariables
> {
  return useMutation({
    mutationFn: ({ folderId, body, taskId }: PostCommentVariables) =>
      mutateApi(commentLine, {
        method: 'POST',
        path:
          taskId === undefined
            ? `/folders/${folderId}/comments`
            : `/folders/${folderId}/comments?task=${encodeURIComponent(taskId)}`,
        body,
      }),
  })
}

export interface PatchCommentVariables {
  readonly id: string
  readonly body: PatchCommentBody
}

export function usePatchComment(): UseMutationResult<
  { edited: true },
  Error,
  PatchCommentVariables
> {
  return useMutation({
    mutationFn: ({ id, body }: PatchCommentVariables) =>
      mutateApi(patchCommentResponse, { method: 'PATCH', path: `/comments/${id}`, body }),
  })
}

/** Author or folder owner (7.14); the menu offers it to exactly them. */
export function useDeleteComment(): UseMutationResult<void, Error, string> {
  return useMutation({
    mutationFn: (id: string) =>
      mutateApi(null, { method: 'DELETE', path: `/comments/${id}` }),
  })
}

/** PUT and DELETE /comments/:id/like, one bit per person (7.14). */
export function useSetCommentLike(): UseMutationResult<
  void,
  Error,
  { readonly id: string; readonly liked: boolean }
> {
  return useMutation({
    mutationFn: ({ id, liked }) =>
      mutateApi(null, {
        method: liked ? 'PUT' : 'DELETE',
        path: `/comments/${id}/like`,
      }),
  })
}

/**
 * DELETE /folders/:id/my-membership: 5.3's leave with the target fixed to
 * the caller, the address RFC 0005 change control item 5 gave the 9.6 door.
 * 204; the 5.3 rules (default folder, sole owner) answer 409 with their own
 * copy, which the toast carries verbatim.
 */
export function useLeaveFolder(): UseMutationResult<void, Error, string> {
  return useMutation({
    mutationFn: (id: string) =>
      mutateApi(null, { method: 'DELETE', path: `/folders/${id}/my-membership` }),
  })
}

/**
 * DELETE /trash/tasks/:id and DELETE /trash/folders/:id, 7.13's permanent
 * delete as amended by RFC 0005 change control items 36, 38 and 53. 204; the
 * folder owner's alone, a non-owner member answered 403 with the server's own
 * sentence, which `writeFailureMessage` carries; the cache invalidation that
 * follows every mutation refetches Trash and everything the cascade touched.
 * Built at S28b over the routes S28a landed.
 */
export function useDestroyTrashedTask(): UseMutationResult<void, Error, string> {
  return useMutation({
    mutationFn: (id: string) =>
      mutateApi(null, { method: 'DELETE', path: `/trash/tasks/${id}` }),
  })
}

export function useDestroyTrashedFolder(): UseMutationResult<void, Error, string> {
  return useMutation({
    mutationFn: (id: string) =>
      mutateApi(null, { method: 'DELETE', path: `/trash/folders/${id}` }),
  })
}

/** POST /folders/:id/transfer-ownership (7.16): owner-only, member target,
 * the DES-225/8.9 flow behind 9.6's "an owner leaves by transferring first". */
export function useTransferOwnership(): UseMutationResult<
  TransferOwnershipResponse,
  Error,
  { readonly id: string; readonly to: string }
> {
  return useMutation({
    mutationFn: ({ id, to }) =>
      mutateApi(transferOwnershipResponse, {
        method: 'POST',
        path: `/folders/${id}/transfer-ownership`,
        body: { to },
      }),
  })
}

export function useImportWorkflow(): UseMutationResult<
  ImportWorkflowResponse,
  Error,
  ImportWorkflowBody
> {
  return useMutation({
    /*
    tz on frozen 7.6's precedent rather than 7.0's view rule, which is how
    the route reads it: a file carrying a repeat or a reminder evaluates a
    date and needs 4.5's anchor, and 7.16 as widened answers 422 naming tz
    without one. Every file that imported before item 44's B3 still carries
    none, so the parameter goes only where it is read (RFC 0004's S27, the
    row's item 44 clause; AC-273 pins the server half).
    */
    mutationFn: (body: ImportWorkflowBody) =>
      mutateApi(importWorkflowResponse, {
        method: 'POST',
        path: '/workflows/import',
        body,
        ...(needsImportAnchor(body) ? { params: { tz: requestTimezone() } } : {}),
      }),
  })
}

/**
 * The file-picker path sends a recognisable workflow before validating its
 * fields so the endpoint can return its existing field-specific 422. A valid
 * timezone is harmless for files that need no anchor and necessary for raw
 * files whose reminder/repeat cannot be inspected without re-validating it.
 */
export function useImportWorkflowFile(): UseMutationResult<
  ImportWorkflowResponse,
  Error,
  unknown
> {
  return useMutation({
    meta: { [VALIDATION_ERROR_TOAST_META]: true },
    mutationFn: (body: unknown) =>
      mutateApi(importWorkflowResponse, {
        method: 'POST',
        path: '/workflows/import',
        body,
        params: { tz: requestTimezone() },
      }),
  })
}

/**
 * POST /views, the saved view of 4.19, which 9.1's "Save as view" writes.
 *
 * The definition is the filter model of `views/filter.ts`, which holds ids
 * and enums and never a display name; that is the client half of AC-209's
 * "a saved view survives a rename because it stored ids".
 */
export function useCreateSavedView(): UseMutationResult<
  SavedView,
  Error,
  PostViewBody
> {
  return useMutation({
    mutationFn: (body: PostViewBody) =>
      mutateApi(savedView, { method: 'POST', path: '/views', body }),
  })
}

/**
 * PATCH /views/:id, which 9.7's pin list writes when a saved view's switch
 * moves (S16).
 *
 * A saved view's pin lives on its own row rather than in `pinned_views`,
 * which 4.19 caps at the nine native keys, so the pin list writes two
 * different addresses for two kinds of row and the page is where they meet.
 * The whole body is `PatchViewBody`, not a pin flag, because the endpoint
 * already takes name and definition and a narrower hook here would be a
 * second, smaller idea of what a saved view is.
 */
export function usePatchSavedView(): UseMutationResult<
  SavedView,
  Error,
  { readonly id: string; readonly body: PatchViewBody }
> {
  return useMutation({
    mutationFn: ({ id, body }) =>
      mutateApi(savedView, { method: 'PATCH', path: `/views/${id}`, body }),
  })
}

/* ------------------------------------------------------------------ *
 * The sample workspace (RFC 0005 change control item 60)
 * ------------------------------------------------------------------ */

/**
 * DELETE /sample. Answers the names of the sample folders removal left
 * standing because someone else is a member, read off the one header the
 * 204 carries, so the strip can say so.
 */
export function useRemoveSample(): UseMutationResult<string[], Error, void> {
  return useMutation({
    mutationFn: async () => {
      let kept: string[] = []
      await mutateApi(null, {
        method: 'DELETE',
        path: '/sample',
        onHeaders: (headers) => {
          const raw = headers.get(SAMPLE_KEPT_HEADER)
          kept = raw === null || raw === '' ? [] : decodeURIComponent(raw).split('\n')
        },
      })
      return kept
    },
  })
}

/** POST /sample: the workspace again, idempotent while it is present. */
export function useRestoreSample(): UseMutationResult<SampleStatus, Error, void> {
  return useMutation({
    mutationFn: () => mutateApi(sampleStatus, { method: 'POST', path: '/sample' }),
  })
}
