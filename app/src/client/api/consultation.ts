/*
The client half of 7.28, a Folder's Consultation (issues #212, #320): the
Discussion list, one Discussion, its Outcomes, its conversation, and the
Trash pair.

A file of its own rather than more lines in `queries.ts` and `mutations.ts`
because the surface is one contract (`shared/consultation.ts`) and reads best
beside itself; the patterns are theirs exactly. Every call goes through
`http.ts`, every key through `keys.ts`, and every successful write is followed
by the mutation cache's unfiltered invalidation (queryClient.ts), except a
post, which refreshes only the conversations and lists (`CHAT_WRITE`) and
joins its thread's cached read at once.

A 409 (`discussion_frozen`, a resolved Discussion refusing an edit, a second
open General discussion) and a 403 carry the server's own sentence, which the
mutation cache already toasts verbatim (`writeFailureMessage`).
*/
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

/* r5 discuss: near-live without sockets. An open thread re-reads every few
   seconds and the list of threads every twenty, only while the tab is visible
   (TanStack pauses an interval in a hidden tab), and every read refetches on
   focus as all reads do. */
const THREAD_POLL_MS = 4_000
const LIST_POLL_MS = 20_000
/** The open thread's own row: closed, renamed or trashed by someone else. */
const DISCUSSION_POLL_MS = 15_000

/* ------------------------------------------------------------------ *
 * Reads
 * ------------------------------------------------------------------ */

/**
 * GET /folders/:id/discussions: most recent activity first, keyset paged.
 * `q` is sent trimmed and omitted when empty, so an empty search and no search
 * are one cache entry.
 */
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

/* GET /discussions/:id is `useDiscussion` in queries.ts (FE06's, shared).
   This is the same read under the same key, polled while the thread is open:
   TanStack runs the shortest interval among a key's observers. */
export function useOpenDiscussion(id: string): UseQueryResult<Discussion> {
  return useQuery({
    queryKey: queryKeys.discussion(id),
    queryFn: () => getPlain(discussionSchema, `/discussions/${id}`),
    refetchInterval: DISCUSSION_POLL_MS,
  })
}

/**
 * PUT /discussions/:id/read: this person has read the thread up to now; the
 * server also marks the thread's post notifications read. Sent outside
 * `useMutation` on purpose: the mutation cache refetches every query after a
 * write, and a read mark goes out on every open and every new post seen, so
 * only the bell and the lists of threads are refreshed.
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

/** GET /discussions/:id/comments: the Discussion's conversation (7.14). */
export function useDiscussionThread(id: string | null): UseQueryResult<GetThreadResponse> {
  return useQuery({
    queryKey: queryKeys.discussionThread(id ?? ''),
    queryFn: () => getPlain(getThreadResponse, `/discussions/${id}/comments`),
    enabled: id !== null,
    refetchInterval: id !== null ? THREAD_POLL_MS : false,
  })
}

/** GET /outcomes/:id: the Outcome and its parent Discussion (Dana Link kind). */
export function useOutcome(id: string | null): UseQueryResult<OutcomeWithDiscussion> {
  return useQuery({
    queryKey: queryKeys.outcome(id ?? ''),
    queryFn: () => getPlain(outcomeResponse, `/outcomes/${id}`),
    enabled: id !== null,
  })
}

/* ------------------------------------------------------------------ *
 * Writes
 * ------------------------------------------------------------------ */

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
 * Move to Trash from inside the thread. Not a `useMutation`: the mutation
 * cache refetches every live query after a write, and the thread (and the
 * breadcrumb naming it) is still on screen while the page goes back to the
 * list, so it would ask for a Discussion that is now 404 here. Only the lists
 * and Trash are refreshed; a refusal is toasted as any write's is.
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

/** DELETE /trash/discussions/:id: permanent, Full control's (`discussion.purge`). */
export function useDestroyTrashedDiscussion(): UseMutationResult<void, Error, string> {
  return useMutation({
    mutationFn: (id) =>
      mutateApi(null, { method: 'DELETE', path: `/trash/discussions/${id}` }),
  })
}

/** POST /discussions/:id/comments. Edit, delete and like are 7.14's
 * `/comments/:id` routes, which `usePatchComment` and friends already carry. */
export function usePostDiscussionComment(): UseMutationResult<
  CommentLine,
  Error,
  { readonly discussionId: string; readonly body: PostCommentBody; readonly taskId?: string | null }
> {
  const client = useQueryClient()
  return useMutation({
    meta: CHAT_WRITE,
    onSuccess: (line, { discussionId, taskId }) => {
      client.setQueryData<GetThreadResponse>(queryKeys.discussionThread(discussionId), (thread) => withPost(thread, line))
      /* A task's thread is linked from the task page once someone has
         written in it (M5), so its first post changes that page. */
      if (taskId != null) void client.invalidateQueries({ queryKey: queryKeys.task(taskId) })
    },
    mutationFn: ({ discussionId, body }) =>
      mutateApi(commentLine, {
        method: 'POST',
        path: `/discussions/${discussionId}/comments`,
        body,
      }),
  })
}

/**
 * POST /tasks/:id/discussion (M5): the task's one Discussion, made on first
 * use and found after that (201, then 200). The caller goes to it.
 */
export function useDiscussTask(): UseMutationResult<Discussion, Error, string> {
  const client = useQueryClient()
  return useMutation({
    onSuccess: (_thread, taskId) => {
      void client.invalidateQueries({ queryKey: queryKeys.task(taskId) })
    },
    mutationFn: (taskId: string) =>
      mutateApi(z.object({ discussion: discussionSchema }), {
        method: 'POST',
        path: `/tasks/${taskId}/discussion`,
      }).then((answer) => answer.discussion),
  })
}
