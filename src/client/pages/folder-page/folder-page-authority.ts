// What the folder page may offer this viewer, from the server's own table.
import { folderGates, viewerFacts } from '../../lib/folder-authority.js'
import type { FolderGates, FolderViewerFacts } from '../../lib/folder-authority.js'
import { mayPerform } from '../../../shared/folder-actions.js'
import type { FolderMember, GetFolderResponse } from '../../../shared/folders.js'

export function folderPageAuthority({
  detail,
  members,
  viewerId,
  headId,
  isDefault,
}: {
  readonly detail: GetFolderResponse | undefined
  readonly members: readonly FolderMember[]
  readonly viewerId: string | null
  readonly headId: string
  readonly isDefault: boolean
}): {
  readonly facts: FolderViewerFacts | null
  readonly gates: FolderGates | null
  readonly sharedPageEditable: boolean
  readonly tabsEditable: boolean
} {
  /* Gates read Access, never ownership: an owner may lower their own Access.
     `gates` is null until the folder and roster arrive, so nothing draws on a guess. */
  const facts = viewerFacts(detail, members, viewerId)
  const gates = facts === null ? null : folderGates(facts)

  /* Asked of the header's folder: the project root on a tab. */
  const sharedPageEditable =
    facts !== null &&
    viewerId !== null &&
    detail !== undefined &&
    mayPerform({
      folderId: headId,
      actorId: viewerId,
      access: facts.access,
      isOwner: facts.isOwner,
      isDefault: facts.isDefault,
      name: detail.name,
    }, 'folder.page.edit').allowed
  const tabsEditable = sharedPageEditable && !isDefault
  return { facts, gates, sharedPageEditable, tabsEditable }
}
