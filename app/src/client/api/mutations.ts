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

import { deleteFolderResponse, folder } from '../../shared/folders.js'
import type { DeleteFolderResponse, Folder, PostFoldersBody } from '../../shared/folders.js'
import { postInvitesBody, postInvitesResponse } from '../../shared/invites.js'
import type { PostInvitesBody, PostInvitesResponse } from '../../shared/invites.js'
import { patchMeSettingsResponse } from '../../shared/me.js'
import type { PatchMeSettingsBody, Settings } from '../../shared/me.js'
import {
  patchStepResponse,
  patchTaskResponse,
  postTaskStepsResponse,
  postTasksResponse,
  taskTransitionResponse,
} from '../../shared/tasks.js'
import type {
  PatchStepBody,
  PatchTaskBody,
  PostTasksBody,
  TaskDetail,
  TaskTransitionResponse,
} from '../../shared/tasks.js'
import { deleteTaskMyDayResponse, postTaskMyDayResponse } from '../../shared/tasks.js'

import { mutateApi, requestTimezone } from './http.js'

export function useCreateFolder(): UseMutationResult<Folder, Error, PostFoldersBody> {
  return useMutation({
    mutationFn: (body: PostFoldersBody) =>
      mutateApi(folder, { method: 'POST', path: '/folders', body }),
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

export function useUpdateSettings(): UseMutationResult<
  Settings,
  Error,
  PatchMeSettingsBody
> {
  return useMutation({
    mutationFn: (body: PatchMeSettingsBody) =>
      mutateApi(patchMeSettingsResponse, {
        method: 'PATCH',
        path: '/me/settings',
        body,
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
