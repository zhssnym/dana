/*
"Ask for input" rounds inside a Discussion (migration 0030). Three response
modes: choose, advice, concerns. At most one open round per Discussion; a
closed round never reopens, and resolving the Discussion closes it. Responses
freeze at close. Counts only: no winner, score or veto. Rounds are not Dana Link
targets.
*/
import { z } from 'zod'

export const INPUT_MODES = ['choose', 'advice', 'concerns'] as const
export type InputMode = (typeof INPUT_MODES)[number]

export const INPUT_ROUND_STATES = ['open', 'closed'] as const
export type InputRoundState = (typeof INPUT_ROUND_STATES)[number]

/** `closed`: a person closed it. `discussion_resolved`: resolving closed it; `closed_by` is null. */
export const INPUT_CLOSE_REASONS = ['closed', 'discussion_resolved'] as const
export type InputCloseReason = (typeof INPUT_CLOSE_REASONS)[number]

export const CONCERN_VALUES = ['no_concern', 'concern'] as const
export type ConcernValue = (typeof CONCERN_VALUES)[number]

/** `discussion_input_rounds_prompt_length_check`. */
export const INPUT_PROMPT_MAX = 1000
/** `discussion_input_options_label_length_check`. */
export const INPUT_OPTION_LABEL_MAX = 200
export const INPUT_OPTIONS_MIN = 2
export const INPUT_OPTIONS_MAX = 20
/** `discussion_input_responses_body_length_check`, the comment body's limit. */
export const INPUT_RESPONSE_BODY_MAX = 4000

/* ------------------------------------------------------------------ *
 * Response shapes
 * ------------------------------------------------------------------ */

export const inputOptionSchema = z.object({
  id: z.uuid(),
  label: z.string(),
  position: z.number().int(),
})
export type InputOption = z.infer<typeof inputOptionSchema>

/** One participant's current response; only the mode's own fields are non-null.
 * For concerns, `body` is the reason (required for `concern`). */
export const inputResponseSchema = z.object({
  user_id: z.uuid(),
  option_id: z.uuid().nullable(),
  concern: z.enum(CONCERN_VALUES).nullable(),
  body: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
})
export type InputResponse = z.infer<typeof inputResponseSchema>

export const inputChoiceCountSchema = z.object({
  option_id: z.uuid(),
  count: z.number().int(),
})
export type InputChoiceCount = z.infer<typeof inputChoiceCountSchema>

export const inputRoundSchema = z.object({
  id: z.uuid(),
  discussion_id: z.uuid(),
  mode: z.enum(INPUT_MODES),
  prompt: z.string(),
  state: z.enum(INPUT_ROUND_STATES),
  created_by: z.uuid(),
  created_at: z.string(),
  close_reason: z.enum(INPUT_CLOSE_REASONS).nullable(),
  closed_by: z.uuid().nullable(),
  closed_at: z.string().nullable(),
  /** In position order; empty unless `mode` is `choose`. */
  options: z.array(inputOptionSchema),
  /** Oldest first, visible to anyone who can read the Discussion. No anonymous input. */
  responses: z.array(inputResponseSchema),
  /** `choose` only: every option in order, zeros included. */
  choice_counts: z.array(inputChoiceCountSchema).nullable(),
  /** The viewer's own current response, or null. */
  my_response: inputResponseSchema.nullable(),
})
export type InputRound = z.infer<typeof inputRoundSchema>

export const inputRoundListResponse = z.object({
  input_rounds: z.array(inputRoundSchema),
})

export interface InputRoundListResponse {
  /** Newest first. At most one has `state: 'open'`. */
  input_rounds: InputRound[]
}

/** POST /discussions/:id/input-rounds. `options` (2 to 20) only for `choose`. */
export const openInputRoundBody = z.object({
  mode: z.enum(INPUT_MODES),
  prompt: z.string().trim().min(1).max(INPUT_PROMPT_MAX),
  options: z
    .array(z.string().trim().min(1).max(INPUT_OPTION_LABEL_MAX))
    .max(INPUT_OPTIONS_MAX)
    .optional(),
})
export type OpenInputRoundBody = z.infer<typeof openInputRoundBody>

/**
 * PUT /input-rounds/:id/response. Required fields depend on the mode, so the
 * server checks them against the round (422): choose needs `option_id`, advice
 * `body`, concerns `concern` (plus `body` for a concern).
 */
export const putInputResponseBody = z.object({
  option_id: z.uuid().optional(),
  concern: z.enum(CONCERN_VALUES).optional(),
  body: z.string().max(INPUT_RESPONSE_BODY_MAX).optional(),
})
export type PutInputResponseBody = z.infer<typeof putInputResponseBody>

/** POST /input-rounds/:id/close carries nothing. */
export const closeInputRoundBody = z.object({})
