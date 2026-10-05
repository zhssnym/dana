/* The 7.20 sample workspace responses. DELETE answers 204 with no body. */
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

/** Sample folders left standing because someone else is a member, sent in a header so the 204 stays bodiless. */
export const SAMPLE_KEPT_HEADER = 'x-dana-sample-kept'

/** The sample pages it moved to Trash, with what the person wrote in them. */
export const SAMPLE_TRASHED_HEADER = 'x-dana-sample-trashed'
