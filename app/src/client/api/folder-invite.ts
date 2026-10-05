/*
 * Body for a folder invite. The schema needs an `access`, and neither invite form has a picker, so both send
 * Can edit.
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
