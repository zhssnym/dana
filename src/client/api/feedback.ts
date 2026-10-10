import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query'
import { z } from 'zod'

import { getFeedbackResponse } from '../../shared/feedback.js'
import type { FeedbackStatus, GetFeedbackResponse, PostFeedbackBody } from '../../shared/feedback.js'
import { ApiError, getPlain, mutateApi } from './http.js'

const FEEDBACK_KEY = ['feedback'] as const

export function sendFeedback(body: PostFeedbackBody): Promise<unknown> {
  return mutateApi(z.object({ id: z.uuid() }), { method: 'POST', path: '/feedback', body })
}

export function useFeedback(): UseQueryResult<GetFeedbackResponse> {
  return useQuery({
    queryKey: FEEDBACK_KEY,
    queryFn: () => getPlain(getFeedbackResponse, '/feedback'),
    retry: (count, error) => !(error instanceof ApiError && error.status === 404) && count < 2,
  })
}

/** Moves the card at once; a refusal puts the server's answer back. */
export function useSetFeedbackStatus(): UseMutationResult<void, Error, { id: string, status: FeedbackStatus }> {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }) => mutateApi(null, { method: 'PATCH', path: `/feedback/${id}`, body: { status } }),
    onMutate: ({ id, status }) => {
      client.setQueryData<GetFeedbackResponse>(FEEDBACK_KEY, (old) =>
        old === undefined ? old : { items: old.items.map((item) => (item.id === id ? { ...item, status } : item)) })
    },
    onSettled: () => client.invalidateQueries({ queryKey: FEEDBACK_KEY }),
  })
}
