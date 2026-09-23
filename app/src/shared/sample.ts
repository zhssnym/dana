/*
The sample workspace surface (7.20): what
GET /sample answers, and what POST /sample answers again. DELETE answers
204 and no body, so no schema is here for it.
*/
import { z } from 'zod'

export const sampleCounts = z.object({
  shelves: z.number().int().nonnegative(),
  folders: z.number().int().nonnegative(),
  tasks: z.number().int().nonnegative(),
  views: z.number().int().nonnegative(),
})
export type SampleCounts = z.infer<typeof sampleCounts>

export const sampleStatus = z.object({
  present: z.boolean(),
  counts: sampleCounts,
})
export type SampleStatus = z.infer<typeof sampleStatus>

/** DELETE /sample's one optional word back: the sample folders it left
 * standing because someone else is a member (7.20's shared-folder rule).
 * Carried in a header rather than a body so the 204 stays a 204. */
export const SAMPLE_KEPT_HEADER = 'x-dana-sample-kept'
