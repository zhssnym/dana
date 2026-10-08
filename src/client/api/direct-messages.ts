import {
  directConversation,
  directMessage,
  directMessagePage,
} from '../../shared/direct-messages.js'
import type { DirectConversation, DirectMessage, DirectMessagePage } from '../../shared/direct-messages.js'
import { getPlain, mutateApi } from './http.js'

export function openDirectMessage(folderId: string, memberId: string): Promise<DirectConversation> {
  return mutateApi(directConversation, {
    method: 'POST', path: '/direct-conversations',
    body: { folder_id: folderId, member_id: memberId },
  })
}

export function readDirectMessages(id: string, before?: string): Promise<DirectMessagePage> {
  return getPlain(directMessagePage, `/direct-conversations/${id}/messages`, { before })
}

export function sendDirectMessage(id: string, body: string): Promise<DirectMessage> {
  return mutateApi(directMessage, {
    method: 'POST', path: `/direct-conversations/${id}/messages`, body: { body },
  })
}
