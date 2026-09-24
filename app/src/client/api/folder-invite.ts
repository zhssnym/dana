/*
The body of an invite into a folder. The shared schema refuses a folder_id
without an `access` (a pending folder invite must say what it grants), and
neither invite form offers a picker, so both send R8A's working default,
Can edit. One builder so the Share panel and the assignee invite cannot drift
apart again; folder-invite.test.ts parses it through the real schema.
*/
import type { FolderAccessPreset } from '../../shared/folder-access.js'
import type { PostInvitesBody } from '../../shared/invites.js'

export const DEFAULT_INVITE_ACCESS: FolderAccessPreset = 'can_edit'

export function folderInviteBody(
  email: string,
  folderId: string,
  access: FolderAccessPreset = DEFAULT_INVITE_ACCESS,
): PostInvitesBody {
  return { email, folder_id: folderId, access }
}
