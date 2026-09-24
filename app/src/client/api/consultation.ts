/*
The client half of 7.28, a Folder's Consultation (issues #212, #320): the
Discussion list, one Discussion, its Outcomes, its conversation, and the
Trash pair.

A file of its own rather than more lines in `queries.ts` and `mutations.ts`
because the surface is one contract (`shared/consultation.ts`) and reads best
beside itself; the patterns are theirs exactly. Every call goes through
`http.ts`, every key through `keys.ts`, and every successful write is followed
by the mutation cache's unfiltered invalidation (queryClient.ts), so nothing
here patches the cache by hand.

A 409 (`discussion_frozen`, a resolved Discussion refusing an edit, a second
open General discussion) and a 403 carry the server's own sentence, which the
mutation cache already toasts verbatim (`writeFailureMessage`).
*/
import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query'
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
  Outcome,
  ResolveDiscussionBody,
  UpdateDiscussionBody,
} from '../../shared/consultation.js'
import { getPlain, mutateApi } from './http.js'
import { queryKeys } from './keys.js'

const discussionListResponse = z.object({
  discussions: z.array(discussionSchema),
  next_cursor: z.string().nullable().optional(),
})
export type DiscussionListPage = z.infer<typeof discussionListResponse>

const outcomesResponse = z.object({ outcomes: z.array(outcomeSchema) })
const outcomeResponse = z.object({ outcome: outcomeSchema, discussion: discussionSchema })
export type OutcomeWithDiscussion = z.infer<typeof outcomeResponse>

/** How often an open Discussion surface re-reads, D3's polite poll as `useThread`'s. */
const POLL_MS = 30_000

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
  })
}

/* GET /discussions/:id is `useDiscussion` in queries.ts (FE06's, shared). */

/** GET /discussions/:id/outcomes: every Outcome, newest first. */
export function useDiscussionOutcomes(
  id: string | null,
): UseQueryResult<{ outcomes: Outcome[] }> {
  return useQuery({
    queryKey: queryKeys.discussionOutcomes(id ?? ''),
    queryFn: () => getPlain(outcomesResponse, `/discussions/${id}/outcomes`),
    enabled: id !== null,
  })
}

/** GET /discussions/:id/comments: the Discussion's conversation (7.14). */
export function useDiscussionThread(id: string | null): UseQueryResult<GetThreadResponse> {
  return useQuery({
    queryKey: queryKeys.discussionThread(id ?? ''),
    queryFn: () => getPlain(getThreadResponse, `/discussions/${id}/comments`),
    enabled: id !== null,
    refetchInterval: id !== null ? POLL_MS : false,
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

/** Resolve with a new Outcome: `statement`, or `source_comment_id` ("Use as outcome"). */
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

/** DELETE /discussions/:id: to Trash, 204. */
export function useTrashDiscussion(): UseMutationResult<void, Error, string> {
  return useMutation({
    mutationFn: (id) => mutateApi(null, { method: 'DELETE', path: `/discussions/${id}` }),
  })
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
  { readonly discussionId: string; readonly body: PostCommentBody }
> {
  return useMutation({
    mutationFn: ({ discussionId, body }) =>
      mutateApi(commentLine, {
        method: 'POST',
        path: `/discussions/${discussionId}/comments`,
        body,
      }),
  })
}
