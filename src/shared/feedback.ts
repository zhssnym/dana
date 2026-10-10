import { z } from 'zod'

import { postContent } from './comments.js'

export const FEEDBACK_KINDS = ['bug', 'idea', 'other'] as const
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number]

/** Sent with each item so nobody has to type where they were. */
export const feedbackContext = z.object({
  path: z.string().max(500),
  user_agent: z.string().max(500),
  viewport: z.string().max(20),
  theme: z.string().max(10),
})
export type FeedbackContext = z.infer<typeof feedbackContext>

export const postFeedbackBody = z.object({
  kind: z.enum(FEEDBACK_KINDS),
  content: postContent,
  context: feedbackContext,
})
export type PostFeedbackBody = z.infer<typeof postFeedbackBody>

export const patchFeedbackBody = z.object({ done: z.boolean() })

export const feedbackFile = z.object({
  id: z.uuid(),
  name: z.string(),
  mime: z.string(),
  bytes: z.number().int(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
})

export const feedbackItem = z.object({
  id: z.uuid(),
  kind: z.enum(FEEDBACK_KINDS),
  email: z.string().nullable(),
  display_name: z.string().nullable(),
  created_at: z.iso.datetime(),
  done: z.boolean(),
  content: postContent,
  context: feedbackContext,
  files: z.array(feedbackFile),
})
export type FeedbackItem = z.infer<typeof feedbackItem>

/** Operators only. Open items first, newest first. */
export const getFeedbackResponse = z.object({ items: z.array(feedbackItem) })
export type GetFeedbackResponse = z.infer<typeof getFeedbackResponse>
