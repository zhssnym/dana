/*
 * Every write this client makes. A hook neither invalidates nor toasts: queryClient.ts invalidates on every
 * success and the mutation cache raises the toasts. Only complete, abandon and pull send tz (spec 7.6, 7.8).
 */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import type { InfiniteData, UseMutationResult } from '@tanstack/react-query'
import type { GetDoneResponse, GetFolderTasksOpenResponse } from '../../shared/views.js'
import { todayInBrowserZone } from './tz.js'


import {
  deleteFolderResponse,
  folder,
  patchFolderLocationResponse,
  patchFolderMyMembershipResponse,
  patchFolderResponse,
  postFolderTabsBody,
  transferOwnershipResponse,
} from '../../shared/folders.js'
import type {
  DeleteFolderResponse,
  Folder,
  PatchFolderBody,
  PatchFolderLocationBody,
  PatchFolderMyMembershipBody,
  PostFolderTabsBody,
  PostFoldersBody,
  TransferOwnershipResponse,
} from '../../shared/folders.js'
import { getSettingsResponse } from '../../shared/bundle.js'
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
  patchTaskResponse,
  postTasksResponse,
  putTaskReminderResponse,
  taskTransitionResponse,
} from '../../shared/tasks.js'
import type {
  PatchTaskBody,
  PostTaskOrderBody,
  PostTasksBody,
  PutTaskReminderBody,
  TaskDetail,
  TaskTransitionResponse,
} from '../../shared/tasks.js'
import { deleteTaskMyDayResponse, postTaskMyDayResponse } from '../../shared/tasks.js'
import { patchCommentResponse } from '../../shared/comments.js'
import type { CommentLine, PatchCommentBody, ReactionKey } from '../../shared/comments.js'
import {
  postNotificationReadResponse,
  postNotificationsReadAllResponse,
} from '../../shared/events.js'
import { duplicateFolderResponse } from '../../shared/folders.js'
import type { DuplicateFolderResponse } from '../../shared/folders.js'
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

import type { FolderAccessPreset } from '../../shared/folder-access.js'
import { putResponsibilityResponse } from '../../shared/responsibility.js'
import type {
  PutResponsibilityResponse,
  ResponsibilityDocument,
} from '../../shared/responsibility.js'
import { defaultFolderDescription } from '../lib/folder-description.js'
import { mutateApi, requestTimezone } from './http.js'
import { INLINE_VALIDATION_META, INVALIDATES_META, VALIDATION_ERROR_TOAST_META } from './queryClient.js'
import type { InvalidatesMeta } from './queryClient.js'
import type { GetThreadResponse } from '../../shared/comments.js'
import { taskDependencyEdge } from '../../shared/task-dependencies.js'
import type { TaskDependencyEdge } from '../../shared/task-dependencies.js'

/*
 * Every folder is made here in one POST (AC-279 counts the requests). The description rides that POST; a
 * caller's own wording wins over the default.
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
 * `dependentId` gains `blockingId` as a blocker. A 422 (self or cycle) is drawn inline by the picker, not
 * toasted.
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

/** The body names the two neighbours; the server computes the order key. */
export function useOrderTask(): UseMutationResult<TaskDetail, Error, OrderTaskVariables> {
  return useMutation({
    mutationFn: ({ id, body }: OrderTaskVariables) =>
      mutateApi(patchTaskResponse, { method: 'POST', path: `/tasks/${id}/order`, body }),
  })
}

export function useDeleteFolder(): UseMutationResult<DeleteFolderResponse, Error, string> {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const deleted = await mutateApi(deleteFolderResponse, {
        method: 'DELETE',
        path: `/folders/${id}`,
      })
      /*
       * Drop these before the blanket invalidation, so nothing refetches a folder that now answers 404 while
       * the page unmounts.
       */
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
 * Moves a page under another page, or to the root with `parent_folder_id: null`. The server refuses a cycle or
 * depth over 20 (422).
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

/** Label and color are personal: stored on the viewer's own membership row. */
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
 * One endpoint for three acts: remove a member, leave, or leave with ownership transfer. The server decides
 * which.
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

/** Sends the Access shown as `expected_access`, so a concurrent change is refused (409), not overwritten. */
export interface ChangeMemberAccessVariables {
  readonly folderId: string
  readonly userId: string
  readonly access: FolderAccessPreset
  readonly expected: FolderAccessPreset
}

export function useChangeMemberAccess(): UseMutationResult<
  void,
  Error,
  ChangeMemberAccessVariables
> {
  return useMutation({
    mutationFn: ({ folderId, userId, access, expected }: ChangeMemberAccessVariables) =>
      mutateApi(null, {
        method: 'PATCH',
        path: `/folders/${folderId}/members/${userId}`,
        body: { access, expected_access: expected },
      }),
  })
}

export function useSetSelfEditGrant(): UseMutationResult<
  void,
  Error,
  { readonly folderId: string; readonly userId: string; readonly enabled: boolean }
> {
  return useMutation({
    mutationFn: ({ folderId, userId, enabled }) =>
      mutateApi(null, {
        method: 'PUT',
        path: `/folders/${folderId}/members/${userId}/self-edit-grant`,
        body: { enabled },
      }),
  })
}

export function useSaveMemberBio(): UseMutationResult<
  void,
  Error,
  { readonly folderId: string; readonly userId: string; readonly bio: string | null }
> {
  return useMutation({
    mutationFn: ({ folderId, userId, bio }) =>
      mutateApi(null, {
        method: 'PATCH',
        path: `/folders/${folderId}/members/${userId}/bio`,
        body: { bio },
      }),
  })
}

/** A 409 or 422 is drawn in the editor, which keeps the draft, so neither toasts. */
export function useSaveResponsibility(): UseMutationResult<
  PutResponsibilityResponse,
  Error,
  {
    readonly folderId: string
    readonly userId: string
    readonly content: ResponsibilityDocument
    readonly baseRevision: string
  }
> {
  return useMutation({
    meta: { [INLINE_VALIDATION_META]: true },
    mutationFn: ({ folderId, userId, content, baseRevision }) =>
      mutateApi(putResponsibilityResponse, {
        method: 'PUT',
        path: `/folders/${folderId}/members/${userId}/responsibility`,
        body: { content, base_revision: baseRevision },
      }),
  })
}

/** The response carries the full Folder, so accepting can navigate into it without a second read. */
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

/** The server answers 429 within 24 hours of the last resend. */
export function useResendInvite(): UseMutationResult<PostInvitesResponse, Error, string> {
  return useMutation({
    mutationFn: (id: string) =>
      mutateApi(resendInviteResponse, { method: 'POST', path: `/invites/${id}/resend` }),
  })
}

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

type TickSnapshot = ReadonlyArray<readonly [readonly unknown[], unknown]>

/*
 * Optimistic tick: move the card in the folder's lists at once, and restore them if the server refuses. Cancel
 * in-flight reads of those lists first; their stale answer would make the card jump back.
 */
async function tickFolderLists(client: ReturnType<typeof useQueryClient>, { id, event }: TransitionVariables): Promise<TickSnapshot | undefined> {
  if (event !== 'complete' && event !== 'uncomplete') return undefined
  const isTasks = (section: string) => (query: { queryKey: readonly unknown[] }): boolean =>
    query.queryKey[0] === 'folders' && query.queryKey[2] === 'tasks' && query.queryKey[3] === section
  const openRows = (open: GetFolderTasksOpenResponse | undefined) => open === undefined ? [] : [...open.scheduled, ...open.unscheduled]
  const doneRows = (done: InfiniteData<GetDoneResponse> | undefined) => done?.pages.flatMap((page) => page.days.flatMap((day) => day.rows)) ?? []
  /* The folders whose list holds the card, as their key's first three parts. */
  const folders = new Set(event === 'complete'
    ? client.getQueriesData<GetFolderTasksOpenResponse>({ predicate: isTasks('open') }).filter(([, open]) => openRows(open).some((row) => row.id === id && !row.is_recurring)).map(([key]) => JSON.stringify(key.slice(0, 3)))
    : client.getQueriesData<InfiniteData<GetDoneResponse>>({ predicate: isTasks('completed') }).filter(([, done]) => doneRows(done).some((row) => row.id === id && !row.is_recurring)).map(([key]) => JSON.stringify(key.slice(0, 3))))
  if (folders.size === 0) return undefined
  const inFolder = (section: string) => (query: { queryKey: readonly unknown[] }): boolean => isTasks(section)(query) && folders.has(JSON.stringify(query.queryKey.slice(0, 3)))
  await client.cancelQueries({ predicate: (query) => inFolder('open')(query) || inFolder('completed')(query) })
  const snapshot: (readonly [readonly unknown[], unknown])[] = []
  const write = <T>(key: readonly unknown[], data: T): void => {
    if (!snapshot.some(([held]) => JSON.stringify(held) === JSON.stringify(key))) snapshot.push([key, client.getQueryData(key)])
    client.setQueryData<T>(key, data)
  }
  if (event === 'complete') {
    for (const [key, open] of client.getQueriesData<GetFolderTasksOpenResponse>({ predicate: inFolder('open') })) {
      const card = openRows(open).find((row) => row.id === id)
      // A repeating task waits for the server, which makes its next occurrence.
      if (open === undefined || card === undefined || card.is_recurring) continue
      write<GetFolderTasksOpenResponse>(key, {
        ...open,
        scheduled: open.scheduled.filter((row) => row.id !== id),
        unscheduled: open.unscheduled.filter((row) => row.id !== id),
      })
      const doneKey = [...key.slice(0, 3), 'completed']
      const done = client.getQueryData<InfiniteData<GetDoneResponse>>(doneKey)
      const first = done?.pages[0]
      if (done === undefined || first === undefined) continue
      const today = todayInBrowserZone()
      const moved = { ...card, status: 'completed' as const }
      const head = first.days[0]
      const days = head?.date === today
        ? [{ ...head, rows: [moved, ...head.rows] }, ...first.days.slice(1)]
        : [{ date: today, rows: [moved] }, ...first.days]
      write<InfiniteData<GetDoneResponse>>(doneKey, { ...done, pages: [{ ...first, days }, ...done.pages.slice(1)] })
    }
  } else {
    for (const [key, done] of client.getQueriesData<InfiniteData<GetDoneResponse>>({ predicate: inFolder('completed') })) {
      const card = doneRows(done).find((row) => row.id === id)
      if (done === undefined || card === undefined || card.is_recurring) continue
      write<InfiniteData<GetDoneResponse>>(key, {
        ...done,
        pages: done.pages.map((page) => ({
          ...page,
          days: page.days.map((day) => ({ ...day, rows: day.rows.filter((row) => row.id !== id) })).filter((day) => day.rows.length > 0),
        })),
      })
      const openKey = [...key.slice(0, 3), 'open']
      const open = client.getQueryData<GetFolderTasksOpenResponse>(openKey)
      if (open === undefined) continue
      const back = { ...card, status: 'pending' as const }
      write<GetFolderTasksOpenResponse>(openKey, card.due_date === null
        ? { ...open, unscheduled: [...open.unscheduled, back] }
        : { ...open, scheduled: [...open.scheduled, back] })
    }
  }
  return snapshot
}

export function useTransitionTask(): UseMutationResult<
  TaskTransitionResponse,
  Error,
  TransitionVariables,
  TickSnapshot | undefined
> {
  const client = useQueryClient()
  return useMutation({
    onMutate: (variables) => tickFolderLists(client, variables),
    onError: (_error, _variables, snapshot) => {
      for (const [key, data] of snapshot ?? []) client.setQueryData(key, data)
    },
    mutationFn: ({ id, event }: TransitionVariables) =>
      mutateApi(taskTransitionResponse, {
        method: 'POST',
        path: `/tasks/${id}/${event}`,
        // Only the two transitions that make a successor take tz (spec 7.6).
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
 * The body carries exactly one of the two reminder columns; which one depends on the task's due_time (spec
 * 9.3).
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

/** The only way to remove a reminder. Idempotent 204. */
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
      // Parsing shapes the request only; the server enforces every rule again.
      const parsed = postInvitesBody.parse(body)
      return mutateApi(postInvitesResponse, {
        method: 'POST',
        path: '/invites',
        body: parsed,
      })
    },
  })
}

/** The only settings write: pins, theme, density, clock, task-open surface, calendar zoom and arrangements. */
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

/** Folder restore only. A trashed task is restored by `useTransitionTask`: both share POST /tasks/:id/restore. */
export function useRestoreFolder(): UseMutationResult<Folder, Error, string> {
  return useMutation({
    mutationFn: (id: string) =>
      mutateApi(folder, { method: 'POST', path: `/folders/${id}/restore` }),
  })
}

/**
 * `:id` is any page of the project. On an unpicked project the kind picks the tabs (`usual` makes four); after
 * that it adds one tab at the end.
 */
export function useCreateTab(): UseMutationResult<
  Folder[],
  Error,
  { readonly folderId: string; readonly kind: PostFolderTabsBody['kind'] }
> {
  return useMutation({
    mutationFn: ({ folderId, kind }) =>
      mutateApi(z.array(folder), {
        method: 'POST',
        path: `/folders/${folderId}/tabs`,
        body: postFolderTabsBody.parse({ kind }),
      }),
  })
}

export interface PatchShelfVariables {
  readonly id: string
  readonly body: PatchShelfBody
}

/** Rename also rewrites the member labels on the server, so no client bookkeeping. */
export function usePatchShelf(): UseMutationResult<Shelf, Error, PatchShelfVariables> {
  return useMutation({
    mutationFn: ({ id, body }: PatchShelfVariables) =>
      mutateApi(shelf, { method: 'PATCH', path: `/shelves/${id}`, body }),
  })
}

export function useDeleteShelf(): UseMutationResult<void, Error, string> {
  return useMutation({
    mutationFn: (id: string) =>
      mutateApi(null, { method: 'DELETE', path: `/shelves/${id}` }),
  })
}

/**
 * One server act, not two calls: POST /shelves refuses cover fields, and two calls can leave a half copy. Asks
 * for the 422 sentence because "(copy)" can push the name past 40 characters.
 */
export function useDuplicateShelf(): UseMutationResult<Shelf, Error, string> {
  return useMutation({
    meta: { [VALIDATION_ERROR_TOAST_META]: true },
    mutationFn: (id: string) =>
      mutateApi(shelf, { method: 'POST', path: `/shelves/${id}/duplicate` }),
  })
}

/**
 * The copy rules are server-side. tz is the day a spent plan re-anchors on; without it a date-moving copy is
 * refused.
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
 * Chat writes are the one exception to unfiltered invalidation: they refresh only conversations and thread
 * lists.
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

/** Allowed for the author or a member with `comment.moderate` (Full control). */
export function useDeleteComment(): UseMutationResult<void, Error, string> {
  return useMutation({
    meta: CHAT_WRITE,
    mutationFn: (id: string) =>
      mutateApi(null, { method: 'DELETE', path: `/comments/${id}` }),
  })
}

export interface CommentReactionVariables {
  readonly id: string
  readonly reaction: ReactionKey
  readonly on: boolean
  readonly viewerId: string
}

/** A new reaction goes last, the viewer last in its `by`, and a reaction nobody holds is dropped. */
export function withReaction(line: CommentLine, { reaction, on, viewerId }: CommentReactionVariables): CommentLine {
  const held = line.reactions.find((r) => r.reaction === reaction)
  if (on) {
    if (held?.by.includes(viewerId) === true) return line
    return {
      ...line,
      reactions: held === undefined
        ? [...line.reactions, { reaction, by: [viewerId] }]
        : line.reactions.map((r) => (r === held ? { ...r, by: [...r.by, viewerId] } : r)),
    }
  }
  if (held?.by.includes(viewerId) !== true) return line
  return {
    ...line,
    reactions: line.reactions
      .map((r) => (r === held ? { ...r, by: r.by.filter((id) => id !== viewerId) } : r))
      .filter((r) => r.by.length > 0),
  }
}

/** Cached threads change at once and are restored if the server refuses. */
export function useSetCommentReaction(): UseMutationResult<
  void,
  Error,
  CommentReactionVariables,
  (readonly [readonly unknown[], unknown])[]
> {
  const client = useQueryClient()
  const isThread = (query: { queryKey: readonly unknown[] }): boolean =>
    (query.queryKey[0] === 'folders' || query.queryKey[0] === 'discussions') && query.queryKey[2] === 'thread'
  return useMutation({
    meta: CHAT_WRITE,
    onMutate: async (variables) => {
      await client.cancelQueries({ predicate: isThread })
      const snapshot: (readonly [readonly unknown[], unknown])[] = []
      for (const [key, thread] of client.getQueriesData<GetThreadResponse>({ predicate: isThread })) {
        if (thread?.comments.some((c) => c.id === variables.id) !== true) continue
        snapshot.push([key, thread])
        client.setQueryData<GetThreadResponse>(key, {
          ...thread,
          comments: thread.comments.map((c) => (c.id === variables.id ? withReaction(c, variables) : c)),
        })
      }
      return snapshot
    },
    onError: (_error, _variables, snapshot) => {
      for (const [key, data] of snapshot ?? []) client.setQueryData(key, data)
    },
    mutationFn: ({ id, reaction, on }) =>
      mutateApi(null, {
        method: on ? 'PUT' : 'DELETE',
        path: `/comments/${id}/reactions/${reaction}`,
      }),
  })
}

/** The server answers 409 with its own copy for the default folder or a sole owner. */
export function useLeaveFolder(): UseMutationResult<void, Error, string> {
  return useMutation({
    mutationFn: (id: string) =>
      mutateApi(null, { method: 'DELETE', path: `/folders/${id}/my-membership` }),
  })
}

/**
 * Full control only, with different rules for tasks and folders (a folder also needs the owner). The menu gates
 * each through `lib/trash.ts`'s `purgeable`.
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
     * Send tz only when the file has a repeat or reminder: the server needs it there (422) and older files
     * carry none.
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
 * Sends a recognisable workflow before validating its fields, so the server returns its field-specific 422.
 * With `parentId` the file's folders become sub-pages of that page.
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
