/*
Every write this client makes.

Two conventions, both of which a page relies on and neither of which a page
implements:

- **A mutation invalidates nothing itself.** `queryClient.ts` invalidates on
  every success, which is 8.3's "refetch the active view after each own
  mutation" applied uniformly. A hook here that added its own invalidation would
  be adding a second strategy to a client 11.4 gives exactly one.
- **A mutation reports nothing itself.** The mutation cache raises 9.1's toasts
  off the error type. A hook that caught its own failure would be the
  page-specific error treatment the shared states exist to prevent.

So a hook here is a request and a shape, and that is all it should ever grow
into.

The tz parameters are 7.6's and 7.8's: complete and abandon evaluate a calendar
date when they generate a successor, and the pull dates its entry in the zone
the request carries. They are not view endpoints, so `mutateApi` does not add tz
for them; each call site that needs one asks for it, and the two that do are the
ones section 7 names.
*/
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { UseMutationResult } from '@tanstack/react-query'


import {
  deleteFolderResponse,
  folder,
  patchFolderLocationResponse,
  patchFolderMyMembershipResponse,
  patchFolderResponse,
  transferOwnershipResponse,
} from '../../shared/folders.js'
import type {
  DeleteFolderResponse,
  Folder,
  PatchFolderBody,
  PatchFolderLocationBody,
  PatchFolderMyMembershipBody,
  PostFoldersBody,
  TransferOwnershipResponse,
} from '../../shared/folders.js'
import { getSettingsResponse } from '../../shared/bundle.js'
import { SAMPLE_KEPT_HEADER, sampleStatus } from '../../shared/sample.js'
import type { SampleStatus } from '../../shared/sample.js'
import type {
  GetSettingsResponse,
  PatchSettingsBody,
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
import {
  facet,
  getFacetsResponse,
  patchFacetBody,
  postFacetBody,
  putFacetOrderBody,
  putMyFacetOrderBody,
  shareFacetBody,
} from '../../shared/facets.js'
import type {
  Facet,
  GetFacetsResponse,
  PatchFacetBody,
  PostFacetBody,
  PutFacetOrderBody,
  PutMyFacetOrderBody,
} from '../../shared/facets.js'
import { shelf } from '../../shared/shelves.js'
import type { PatchShelfBody, Shelf } from '../../shared/shelves.js'

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
import { INLINE_VALIDATION_META, INVALIDATES_META, VALIDATION_ERROR_TOAST_META } from './queryClient.js'
import type { InvalidatesMeta } from './queryClient.js'
import type { GetThreadResponse } from '../../shared/comments.js'
import { queryKeys } from './keys.js'
import { taskDependencyEdge } from '../../shared/task-dependencies.js'
import type { TaskDependencyEdge } from '../../shared/task-dependencies.js'

/*
Making a folder is one request, and it has to stay one.

AC-279 reads every mutation the hold makes between the confirm and the API going
quiet and expects one `POST /folders` plus one `PATCH /tasks/:id` per task moved
and nothing else: the gesture is a composition of two existing endpoints and
adds none. Every folder made anywhere in the client comes through here, the
hold's panel included (`pages/task-rows.tsx`'s `onMerge`), so a second call here
would fail that from every door.

**The wording rides the POST** (7.4, issues #21 and #70, and AC-377):
`postFoldersBody` takes `description`, the route reads it and
`domain/folders.ts` inserts it, so the sentence a new folder opens with costs no
second call. The default is written here rather than at each door, because here
is the one door: a caller that has its own wording still wins, the spread
reading its key when it carries one.
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
/**
 * 7.25's one write: `dependentId` gains `blockingId` as a blocker. "Blocks…"
 * is the same call with the two reversed. A 422 (self or cycle) is drawn
 * inline by the picker in words for a person, so it raises no toast.
 */
export interface AddDependencyVariables {
  readonly dependentId: string
  readonly blockingId: string
}

export function useAddTaskDependency(): UseMutationResult<
  TaskDependencyEdge,
  Error,
  AddDependencyVariables
> {
  return useMutation({
    mutationFn: ({ dependentId, blockingId }: AddDependencyVariables) =>
      mutateApi(taskDependencyEdge, {
        method: 'POST',
        path: `/tasks/${dependentId}/dependencies`,
        body: { blocking_task_id: blockingId },
      }),
    meta: { [INLINE_VALIDATION_META]: true },
  })
}

export interface RemoveDependencyVariables {
  readonly taskId: string
  readonly dependencyId: string
}

export function useRemoveTaskDependency(): UseMutationResult<
  void,
  Error,
  RemoveDependencyVariables
> {
  return useMutation({
    mutationFn: ({ taskId, dependencyId }: RemoveDependencyVariables) =>
      mutateApi(null, {
        method: 'DELETE',
        path: `/tasks/${taskId}/dependencies/${dependencyId}`,
      }),
  })
}

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
 * 7.6's order endpoint. The body names the two neighbours and nothing else; the
 * key is the server's arithmetic, and the answer is the placed task as a fresh
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

/**
 * DELETE /folders/:id, behind 9.6's confirm.
 *
 * 7.4 answers 200 with the counts of what the cascade removed, "so the client
 * can confirm what the dialog promised". The shape is parsed for that reason
 * rather than discarded, even though nothing renders it yet.
 */
export function useDeleteFolder(): UseMutationResult<DeleteFolderResponse, Error, string> {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const deleted = await mutateApi(deleteFolderResponse, {
        method: 'DELETE',
        path: `/folders/${id}`,
      })
      /* Dropped before the cache's blanket invalidation runs, so nothing
         refetches a folder that now answers 404 (the page being left may
         still be mounted while the navigation commits). A restore reads
         them afresh. */
      client.removeQueries({
        predicate: ({ queryKey }) =>
          (queryKey[0] === 'folders' && queryKey[1] === id) ||
          (queryKey[0] === 'backlinks' && queryKey[2] === id),
      })
      return deleted
    },
  })
}

/**
 * PATCH /folders/:id/location (wave 2 page tree): move a page under another
 * page, or to the root with `parent_folder_id: null`. The server refuses a
 * cycle or a tree deeper than 20 with 422. Invalidation is queryClient.ts's,
 * like every mutation here.
 */
export interface MoveFolderVariables {
  readonly id: string
  readonly body: PatchFolderLocationBody
}

export function useMoveFolder(): UseMutationResult<Folder, Error, MoveFolderVariables> {
  return useMutation({
    mutationFn: ({ id, body }: MoveFolderVariables) =>
      mutateApi(patchFolderLocationResponse, {
        method: 'PATCH',
        path: `/folders/${id}/location`,
        body,
      }),
    // A cycle or a too-deep tree is the server's 422 sentence, shown as is.
    meta: { [VALIDATION_ERROR_TOAST_META]: true },
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
 * stub (7.5), which is what lets 9.8's "accepting a folder invite lands inside
 * that folder" navigate without a second read.
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
 * 7.9's PUT, the edit path's half of the reminder write.
 *
 * It answers the affected TaskDetail: 7.0 gives the reminder no object of its
 * own, section 7 offers no GET for one, and TaskDetail already carries a
 * reminder field, so the parent task is the only object the contract holds that
 * reports what the call did. Parsed against that shape for the same reason
 * every other response here is.
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
 * Settings and restore
 * ------------------------------------------------------------------ */

/**
 * The 4.19 bundle's write, and the client's only settings write.
 *
 * It owns the pin list, the theme, the density, the clock, the task-open
 * surface, the calendar's zoom and the arrangements. The three page flags of
 * 7.2 are still the server's and still derive into the pin list, and no surface
 * in this client writes them directly.
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
 * The task restore is not here and that is not an omission: 7.13 and 7.6 share
 * one address, `POST /tasks/:id/restore`, the server forking on the row's state
 * because the two meanings have disjoint domains. `useTransitionTask` already
 * sends it, so a trashed task is restored by the transition hook.
 */
export function useRestoreFolder(): UseMutationResult<Folder, Error, string> {
  return useMutation({
    mutationFn: (id: string) =>
      mutateApi(folder, { method: 'POST', path: `/folders/${id}/restore` }),
  })
}

export function useCreateFacet(): UseMutationResult<
  Facet,
  Error,
  { readonly folderId: string; readonly body: PostFacetBody }
> {
  return useMutation({
    mutationFn: ({ folderId, body }) =>
      mutateApi(facet, {
        method: 'POST',
        path: `/folders/${folderId}/facets`,
        body: postFacetBody.parse(body),
      }),
  })
}

export function usePatchFacet(): UseMutationResult<
  Facet,
  Error,
  { readonly folderId: string; readonly facetId: string; readonly body: PatchFacetBody }
> {
  return useMutation({
    mutationFn: ({ folderId, facetId, body }) =>
      mutateApi(facet, {
        method: 'PATCH',
        path: `/folders/${folderId}/facets/${facetId}`,
        body: patchFacetBody.parse(body),
      }),
  })
}

export function usePutFacetOrder(): UseMutationResult<
  GetFacetsResponse,
  Error,
  { readonly folderId: string; readonly body: PutFacetOrderBody }
> {
  return useMutation({
    mutationFn: ({ folderId, body }) =>
      mutateApi(getFacetsResponse, {
        method: 'PUT',
        path: `/folders/${folderId}/facets/order`,
        body: putFacetOrderBody.parse(body),
      }),
  })
}

export function usePutMyFacetOrder(): UseMutationResult<
  GetFacetsResponse,
  Error,
  { readonly folderId: string; readonly body: PutMyFacetOrderBody }
> {
  return useMutation({
    mutationFn: ({ folderId, body }) =>
      mutateApi(getFacetsResponse, {
        method: 'PUT',
        path: `/folders/${folderId}/facets/my-order`,
        body: putMyFacetOrderBody.parse(body),
      }),
  })
}

export function useShareFacet(): UseMutationResult<
  Facet,
  Error,
  { readonly folderId: string; readonly facetId: string }
> {
  return useMutation({
    mutationFn: ({ folderId, facetId }) =>
      mutateApi(facet, {
        method: 'POST',
        path: `/folders/${folderId}/facets/${facetId}/share`,
        body: shareFacetBody.parse({ confirm: true }),
      }),
  })
}

export function useDeleteFacet(): UseMutationResult<
  void,
  Error,
  { readonly folderId: string; readonly facetId: string }
> {
  return useMutation({
    mutationFn: ({ folderId, facetId }) =>
      mutateApi(null, {
        method: 'DELETE',
        path: `/folders/${folderId}/facets/${facetId}`,
      }),
  })
}

export function useRestoreFacet(): UseMutationResult<Facet, Error, string> {
  return useMutation({
    mutationFn: (id: string) =>
      mutateApi(facet, { method: 'POST', path: `/facets/${id}/restore` }),
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

/**
 * POST /shelves/:id/duplicate (7.16; issues #117, #128). 201 with the whole new
 * Shelf, which the caller navigates to.
 *
 * **One act on the server rather than two calls.** `POST /shelves` refuses all
 * three cover fields out loud rather than dropping them, so a copy made through
 * it would come out bare, and two calls have a gap between them in which a
 * failure leaves a half-duplicated shelf. The copy carries the icon, colour,
 * description, `cover_preset` and `cover_focal_y` verbatim and **a cover file
 * of its own** — the picture is copied rather than shared, because one
 * `cover_file_id` on two shelves is not independence: the foreign key's ON
 * DELETE SET NULL blanks both the moment that file goes. Changing or removing
 * the cover on either shelf must not change the other.
 *
 * It does not carry the shelf's page (4.17), which is 7.16's own distinction
 * and not this client's to make.
 *
 * **It asks for its 422's own sentence, which is the second thing this act can
 * be refused for.** 7.16 answers `name: you already have a shelf with this
 * name.` where "(copy)" and its numbered successors will not fit inside 10.3's
 * forty characters — a real outcome for a shelf named at the cap, and one the
 * person can act on by shortening the name. Without the meta the mutation cache
 * says "Something went wrong. Nothing was saved. Try again.", which is true and
 * useless, and trying again produces the same refusal for ever. The 413 the
 * copy's quota can earn needs no meta: `writeFailureMessage` passes every
 * `quota_exceeded` sentence through, that status having one producer.
 */
export function useDuplicateShelf(): UseMutationResult<Shelf, Error, string> {
  return useMutation({
    meta: { [VALIDATION_ERROR_TOAST_META]: true },
    mutationFn: (id: string) =>
      mutateApi(shelf, { method: 'POST', path: `/shelves/${id}/duplicate` }),
  })
}

/**
 * POST /folders/:id/duplicate (7.16): the copy rules are server-side; the
 * answer is the copy's identity, which the caller navigates to. The tz is the
 * day a spent plan re-anchors on, the viewer's rather than the database's (8.1,
 * issue #76); without it the endpoint refuses a copy that would move a date.
 */
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

/** Reading a notification changes the bell and nothing else (r7). */
const BELL_WRITE = { [INVALIDATES_META]: (() => (key) => key[0] === 'notifications') satisfies InvalidatesMeta } as const

export function useMarkNotificationRead(): UseMutationResult<
  { read: true },
  Error,
  string
> {
  return useMutation({
    meta: BELL_WRITE,
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
    meta: BELL_WRITE,
    mutationFn: () =>
      mutateApi(postNotificationsReadAllResponse, {
        method: 'POST',
        path: '/notifications/read-all',
      }),
  })
}

/*
Chat writes (r7) are the one exception to "a mutation invalidates nothing
itself" (queryClient.ts `INVALIDATES_META`): a post, edit, delete or like
refreshes the conversations and the lists of threads, not the whole app.
*/
const chatChanged: InvalidatesMeta = () => (key) =>
  (key[0] === 'folders' && (key[2] === 'thread' || key[2] === 'discussions')) ||
  (key[0] === 'discussions' && key[2] === 'thread')
export const CHAT_WRITE = { [INVALIDATES_META]: chatChanged } as const

/** A sent post joins its thread's cached read at once, before any refetch. */
export function withPost(thread: GetThreadResponse | undefined, line: CommentLine): GetThreadResponse | undefined {
  if (thread === undefined || thread.comments.some((c) => c.id === line.id)) return thread
  return { ...thread, comments: [...thread.comments, line] }
}

export interface PostCommentVariables {
  readonly folderId: string
  readonly body: PostCommentBody
  /*
  Which task's thread this joins.

  It is a query parameter rather than a body field because that is where 7.14
  puts it: `routes/conversation.ts` parses `threadQuery` off `req.query` on both
  the read and the write, and `postCommentBody` carries no task at all. The read
  half takes one too (`useThread`'s second argument).
  */
  readonly taskId?: string
}

export function usePostComment(): UseMutationResult<
  CommentLine,
  Error,
  PostCommentVariables
> {
  const client = useQueryClient()
  return useMutation({
    meta: CHAT_WRITE,
    onSuccess: (line, { folderId, taskId }) => {
      client.setQueryData<GetThreadResponse>(queryKeys.thread(folderId, taskId ?? null), (thread) => withPost(thread, line))
    },
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
    meta: CHAT_WRITE,
    mutationFn: ({ id, body }: PatchCommentVariables) =>
      mutateApi(patchCommentResponse, { method: 'PATCH', path: `/comments/${id}`, body }),
  })
}

/**
 * The author, or a member who may moderate — `comment.moderate`, which is Full
 * control's rather than custody's (7.14, issue #228). The menu offers it to
 * exactly them, through `folderGates(...).moderate` and `lib/thread.ts`
 * (AC-790).
 */
export function useDeleteComment(): UseMutationResult<void, Error, string> {
  return useMutation({
    meta: CHAT_WRITE,
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
    meta: CHAT_WRITE,
    mutationFn: ({ id, liked }) =>
      mutateApi(null, {
        method: liked ? 'PUT' : 'DELETE',
        path: `/comments/${id}/like`,
      }),
  })
}

/**
 * DELETE /folders/:id/my-membership: 5.3's leave with the target fixed to the
 * caller, the 9.6 door. 204; the 5.3 rules (default folder, sole owner) answer
 * 409 with their own copy, which the toast carries verbatim.
 */
export function useLeaveFolder(): UseMutationResult<void, Error, string> {
  return useMutation({
    mutationFn: (id: string) =>
      mutateApi(null, { method: 'DELETE', path: `/folders/${id}/my-membership` }),
  })
}

/**
 * DELETE /trash/tasks/:id and DELETE /trash/folders/:id, 7.13's permanent
 * delete. 204; **Full control's, and not one rule for the two** — a task's
 * ignores ownership, a folder's requires the owner beside Full control (#228) —
 * so the menu offers each through `folderGates(...).destroyTask` and
 * `.destroyFolder`, by way of `lib/trash.ts`'s `purgeable` (AC-790). Anybody
 * below the bar is answered 403 with the server's own sentence, which
 * `writeFailureMessage` carries; the cache invalidation that follows every
 * mutation refetches Trash and everything the cascade touched.
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

export function useDestroyTrashedFacet(): UseMutationResult<void, Error, string> {
  return useMutation({
    mutationFn: (id: string) =>
      mutateApi(null, { method: 'DELETE', path: `/trash/facets/${id}` }),
  })
}

/**
 * POST /folders/:id/transfer-ownership (7.16): owner-only, member target, the
 * 8.9 flow behind 9.6's "an owner leaves by transferring first".
 */
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
    tz on 7.6's precedent rather than 7.0's view rule, which is how the route
    reads it: a file carrying a repeat or a reminder evaluates a date and needs
    4.5's anchor, and 7.16 answers 422 naming tz without one. Older files carry
    none, so the parameter goes only where it is read (AC-273 pins the server
    half).
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
 *
 * With `parentId` the file imports into that page: its folders become the
 * page's sub-pages (POST /folders/:id/import).
 */
export function useImportWorkflowFile(): UseMutationResult<
  ImportWorkflowResponse,
  Error,
  { body: unknown; parentId?: string }
> {
  return useMutation({
    meta: { [VALIDATION_ERROR_TOAST_META]: true },
    mutationFn: ({ body, parentId }: { body: unknown; parentId?: string }) =>
      mutateApi(importWorkflowResponse, {
        method: 'POST',
        path: parentId === undefined ? '/workflows/import' : `/folders/${parentId}/import`,
        body,
        params: { tz: requestTimezone() },
      }),
  })
}

/* ------------------------------------------------------------------ *
 * The sample workspace (7.20)
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
