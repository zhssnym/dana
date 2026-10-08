import { z } from 'zod'

export const openDirectConversationBody = z.object({
  folder_id: z.uuid(),
  member_id: z.uuid(),
})
export type OpenDirectConversationBody = z.infer<typeof openDirectConversationBody>

export const directConversation = z.object({ id: z.uuid() })
export type DirectConversation = z.infer<typeof directConversation>

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
