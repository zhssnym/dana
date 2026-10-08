import { z } from 'zod'

export const openDirectConversationBody = z.object({
  folder_id: z.uuid(),
  member_id: z.uuid(),
})
export type OpenDirectConversationBody = z.infer<typeof openDirectConversationBody>

export const directConversation = z.object({ id: z.uuid() })
export type DirectConversation = z.infer<typeof directConversation>

export const directConversationSummary = z.object({
  id: z.uuid(),
  member_id: z.uuid(),
  member_name: z.string(),
  member_image: z.string().nullable(),
  latest_id: z.uuid(),
  latest_body: z.string(),
  latest_at: z.iso.datetime(),
  latest_author_id: z.uuid(),
  unread: z.number().int().nonnegative(),
})
export type DirectConversationSummary = z.infer<typeof directConversationSummary>
export const directConversationList = z.array(directConversationSummary)
export const readDirectMessageBody = z.object({ through: z.uuid() })
export const readDirectMessageResponse = z.object({ read: z.number().int().nonnegative() })

export const directMessage = z.object({
  id: z.uuid(),
  conversation_id: z.uuid(),
  author_id: z.uuid(),
  body: z.string(),
  created_at: z.iso.datetime(),
})
export type DirectMessage = z.infer<typeof directMessage>

export const directMessagePage = z.object({
  messages: z.array(directMessage),
  has_more: z.boolean(),
})
export type DirectMessagePage = z.infer<typeof directMessagePage>

export const directMessageQuery = z.object({ before: z.uuid().optional() })
export const sendDirectMessageBody = z.object({ body: z.string().trim().min(1).max(4000) })
