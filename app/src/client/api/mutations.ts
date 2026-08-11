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

import { folder } from '../../shared/folders.js'
import type { Folder, PostFoldersBody } from '../../shared/folders.js'
import { postInvitesBody, postInvitesResponse } from '../../shared/invites.js'
import type { PostInvitesBody, PostInvitesResponse } from '../../shared/invites.js'
import { patchMeSettingsResponse } from '../../shared/me.js'
import type { PatchMeSettingsBody, Settings } from '../../shared/me.js'
import {
  patchTaskResponse,
  postTasksResponse,
  taskTransitionResponse,
} from '../../shared/tasks.js'
import type {
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
