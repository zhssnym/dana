/*
Structured input rounds (issue #321, product authority #212 R3 and R4): the
optional "Ask for input" inside a Discussion, which both sides import.

Storage is migration 0030: `discussion_input_rounds`, `discussion_input_options`
and `discussion_input_responses`. The rules this file restates:

- **Three modes, and they are response shapes, not Discussion types.**
  `choose` (two or more explicit options, one current choice each),
  `advice` (one current free-text response each), `concerns` (one current
  `no_concern | concern` each, and `concern` needs a reason).
- **At most one open round per Discussion**, many over time. A closed round
  never reopens; reopening a Discussion opens nothing. Resolving the
  Discussion closes its open round in the same transaction
  (`close_reason: 'discussion_resolved'`).
- **Responses freeze at close.** While open, a participant may change or
  withdraw their own; after, nothing writes them.
- **No winner, no score, no weight, no veto.** A `choose` round answers plain
  per-option counts; `advice` and `concerns` answer the responses themselves,
  with their actors, and nothing aggregated. Nothing here derives authority.
- **Rounds are not Dana Link targets** (M1): Discussion and Outcome are the
  addressable Consultation objects.

**A request field declared here and read by no route is dropped with a 200**
(shared/tasks.ts); every field below is read by `domain/consultation-input.ts`.
*/
import { z } from 'zod'

export const INPUT_MODES = ['choose', 'advice', 'concerns'] as const
export type InputMode = (typeof INPUT_MODES)[number]

export const INPUT_ROUND_STATES = ['open', 'closed'] as const
export type InputRoundState = (typeof INPUT_ROUND_STATES)[number]

/** `closed`: a person closed it (`closed_by`). `discussion_resolved`:
 * resolving its Discussion closed it, and `closed_by` is null. */
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

/** One participant's current response. Exactly the mode's own fields are
 * non-null: `option_id` for choose, `body` for advice, `concern` (and `body`
 * as the reason, required for `concern`, optional for `no_concern`) for
 * concerns. */
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
  /** Every current response, oldest first. Visible to every member who can
   * read the Discussion (Can view+); M1 has no anonymous input. */
  responses: z.array(inputResponseSchema),
  /** `choose` only: one entry per option, in position order, zeros
   * included. Null for `advice` and `concerns`, which are not tallied. */
  choice_counts: z.array(inputChoiceCountSchema).nullable(),
  /** The viewer's own current response, or null. */
  my_response: inputResponseSchema.nullable(),
})
export type InputRound = z.infer<typeof inputRoundSchema>

export interface InputRoundListResponse {
  /** Newest first. At most one has `state: 'open'`. */
  input_rounds: InputRound[]
}

/* ------------------------------------------------------------------ *
 * Request bodies
 * ------------------------------------------------------------------ */

/** POST /discussions/:id/input-rounds. `options` is required for `choose`
 * (2..20 distinct labels) and refused for the other two modes. */
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
 * PUT /input-rounds/:id/response: submit or change one's own response. Which
 * fields are required depends on the round's mode, so the shape is checked
 * by the server against the round (422 naming the field):
 *
 * - choose: `option_id` (an option of this round); nothing else.
 * - advice: `body`, non-blank; nothing else.
 * - concerns: `concern`; `body` is the reason, required when `concern`.
 */
export const putInputResponseBody = z.object({
  option_id: z.uuid().optional(),
  concern: z.enum(CONCERN_VALUES).optional(),
  body: z.string().max(INPUT_RESPONSE_BODY_MAX).optional(),
})
export type PutInputResponseBody = z.infer<typeof putInputResponseBody>

/** POST /input-rounds/:id/close carries nothing. */
export const closeInputRoundBody = z.object({})
