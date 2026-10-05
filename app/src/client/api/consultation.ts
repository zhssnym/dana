/* Client hooks for a folder's Consultation (spec 7.28): discussions, outcomes, posts and Trash. */
import { useCallback } from 'react'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  UseInfiniteQueryResult,
  UseMutationResult,
  UseQueryResult,
} from '@tanstack/react-query'
import { z } from 'zod'

import { commentLine, getThreadResponse } from '../../shared/comments.js'
import type { CommentLine, GetThreadResponse, PostCommentBody } from '../../shared/comments.js'
import { discussionSchema, outcomeSchema } from '../../shared/consultation.js'
import type {
  CreateDiscussionBody,
  Discussion,
  DiscussionListState,
  ResolveDiscussionBody,
  UpdateDiscussionBody,
} from '../../shared/consultation.js'
import { getPlain, mutateApi } from './http.js'
import { CHAT_WRITE, withPost } from './mutations.js'
import { mutationFailureMessage } from './queryClient.js'
import { showToast } from '../state/toasts.js'
import { queryKeys } from './keys.js'

const discussionListResponse = z.object({
  discussions: z.array(discussionSchema),
  next_cursor: z.string().nullable().optional(),
})
export type DiscussionListPage = z.infer<typeof discussionListResponse>

const outcomeResponse = z.object({ outcome: outcomeSchema, discussion: discussionSchema })
export type OutcomeWithDiscussion = z.infer<typeof outcomeResponse>

/*
 * Near-live without sockets: poll the open thread and the thread list. TanStack pauses intervals in a hidden
 * tab.
 */
const THREAD_POLL_MS = 4_000
const LIST_POLL_MS = 20_000
/** The open thread's own row: closed, renamed or trashed by someone else. */
const DISCUSSION_POLL_MS = 15_000

/** `q` is sent trimmed and omitted when empty, so an empty search and no search share one cache entry. */
export function useDiscussions(
  folderId: string,
  state: DiscussionListState,
  q: string,
): UseInfiniteQueryResult<{ readonly pages: readonly DiscussionListPage[] }, Error> {
  const query = q.trim()
  return useInfiniteQuery({
    queryKey: queryKeys.discussions(folderId, state, query),
    queryFn: ({ pageParam }) =>
      getPlain(discussionListResponse, `/folders/${folderId}/discussions`, {
        state,
        q: query === '' ? undefined : query,
        cursor: pageParam,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    refetchInterval: LIST_POLL_MS,
  })
}

/*
 * Same key as `useDiscussion` in queries.ts, polled while the thread is open. TanStack uses the shortest
 * interval among a key's observers.
 */
export function useOpenDiscussion(id: string): UseQueryResult<Discussion> {
  return useQuery({
    queryKey: queryKeys.discussion(id),
    queryFn: () => getPlain(discussionSchema, `/discussions/${id}`),
    refetchInterval: DISCUSSION_POLL_MS,
  })
}

/**
 * Not a `useMutation`: the mutation cache refetches every query after a write, and a read mark goes out on
 * every open and every new post seen.
 */
export function useMarkDiscussionRead(): (id: string) => void {
  const client = useQueryClient()
  return useCallback(
    (id: string) => {
      mutateApi(null, { method: 'PUT', path: `/discussions/${id}/read` }).then(
        () => {
          void client.invalidateQueries({ queryKey: queryKeys.notifications() })
          void client.invalidateQueries({
            predicate: (query) => query.queryKey[0] === 'folders' && query.queryKey[2] === 'discussions',
          })
        },
        () => undefined,
      )
    },
    [client],
  )
}

export function useDiscussionThread(id: string | null): UseQueryResult<GetThreadResponse> {
  return useQuery({
    queryKey: queryKeys.discussionThread(id ?? ''),
    queryFn: () => getPlain(getThreadResponse, `/discussions/${id}/comments`),
    enabled: id !== null,
    refetchInterval: id !== null ? THREAD_POLL_MS : false,
  })
}

export function useOutcome(id: string | null): UseQueryResult<OutcomeWithDiscussion> {
  return useQuery({
    queryKey: queryKeys.outcome(id ?? ''),
    queryFn: () => getPlain(outcomeResponse, `/outcomes/${id}`),
    enabled: id !== null,
  })
}

/** Asks the mutation cache to toast a 422's own sentence (queryClient.ts). */
const validationToast = { validationErrorToast: true } as const

export function useCreateDiscussion(): UseMutationResult<
  Discussion,
  Error,
  { readonly folderId: string; readonly body: CreateDiscussionBody }
> {
  return useMutation({
    meta: validationToast,
    mutationFn: ({ folderId, body }) =>
      mutateApi(discussionSchema, {
        method: 'POST',
        path: `/folders/${folderId}/discussions`,
        body,
      }),
  })
}

export function useUpdateDiscussion(): UseMutationResult<
  Discussion,
  Error,
  { readonly id: string; readonly body: UpdateDiscussionBody }
> {
  return useMutation({
    meta: validationToast,
    mutationFn: ({ id, body }) =>
      mutateApi(discussionSchema, { method: 'PATCH', path: `/discussions/${id}`, body }),
  })
}

/** "Close thread": `{}` closes without a decision, `{ statement }` records one. */
export function useResolveDiscussion(): UseMutationResult<
  Discussion,
  Error,
  { readonly id: string; readonly body: ResolveDiscussionBody }
> {
  return useMutation({
    meta: validationToast,
    mutationFn: ({ id, body }) =>
      mutateApi(discussionSchema, {
        method: 'POST',
        path: `/discussions/${id}/resolve`,
        body,
      }),
  })
}

export function useReopenDiscussion(): UseMutationResult<Discussion, Error, string> {
  return useMutation({
    mutationFn: (id) =>
      mutateApi(discussionSchema, {
        method: 'POST',
        path: `/discussions/${id}/reopen`,
        body: {},
      }),
  })
}

/**
 * Not a `useMutation`: its blanket refetch would re-read the trashed Discussion (now 404) while the thread is
 * still on screen.
 */
export function useTrashFromThread(): (id: string) => void {
  const client = useQueryClient()
  return useCallback(
    (id: string) => {
      mutateApi(null, { method: 'DELETE', path: `/discussions/${id}` }).then(
        () => {
          void client.invalidateQueries({
            predicate: (query) =>
              (query.queryKey[0] === 'folders' && query.queryKey[2] === 'discussions') || query.queryKey[0] === 'trash',
          })
        },
        (error: unknown) => { showToast(mutationFailureMessage(error, undefined)) },
      )
    },
    [client],
  )
}

export function useRestoreDiscussion(): UseMutationResult<Discussion, Error, string> {
  return useMutation({
    mutationFn: (id) =>
      mutateApi(discussionSchema, { method: 'POST', path: `/discussions/${id}/restore` }),
  })
}

export function useDestroyTrashedDiscussion(): UseMutationResult<void, Error, string> {
  return useMutation({
    mutationFn: (id) =>
      mutateApi(null, { method: 'DELETE', path: `/trash/discussions/${id}` }),
  })
}

export function usePostDiscussionComment(): UseMutationResult<
  CommentLine,
  Error,
  { readonly discussionId: string; readonly body: PostCommentBody; readonly taskIds?: readonly string[] }
> {
  const client = useQueryClient()
  return useMutation({
    meta: CHAT_WRITE,
    onSuccess: (line, { discussionId, taskIds }) => {
      client.setQueryData<GetThreadResponse>(queryKeys.discussionThread(discussionId), (thread) => withPost(thread, line))
      /* A task's thread is linked from the task page after its first post, so refresh that task. */
      for (const taskId of taskIds ?? []) void client.invalidateQueries({ queryKey: queryKeys.task(taskId) })
    },
    mutationFn: ({ discussionId, body }) =>
      mutateApi(commentLine, {
        method: 'POST',
        path: `/discussions/${discussionId}/comments`,
        body,
      }),
  })
}

/** POST /tasks/:id/discussion: the task's one Discussion, made on first use (201) and found after (200). */
export function useDiscussTask(): UseMutationResult<
  { readonly discussion: Discussion; readonly tabId: string | null },
  Error,
  string
> {
  const client = useQueryClient()
  return useMutation({
    onSuccess: (_thread, taskId) => {
      void client.invalidateQueries({ queryKey: queryKeys.task(taskId) })
    },
    mutationFn: (taskId: string) =>
      mutateApi(
        z.object({ discussion: discussionSchema, discussion_tab_id: z.uuid().nullable().optional() }),
        { method: 'POST', path: `/tasks/${taskId}/discussion` },
      ).then((answer) => ({ discussion: answer.discussion, tabId: answer.discussion_tab_id ?? null })),
  })
}
