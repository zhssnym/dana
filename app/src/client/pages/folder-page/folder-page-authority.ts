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
  /*
  **What this page may offer, from the server's own table** (issue #228).

  Every gate reads Access rather than ownership: a Full-control member who is
  not the owner may rename, and an owner whose Access has been lowered may not
  delete. `lib/folder-authority.ts` answers each from
  `shared/folder-actions.ts`, the same table the routes resolve against, so no
  bar is written twice; its own header carries the argument and its test the
  preset-by-preset table.

  The facts need the roster, which this page already reads, because the viewer's
  preset is their membership row and is never inferred from custody (an owner
  may lower their own Access). `gates` is null until both have arrived, so
  nothing draws on a guess.
  */
  const facts = viewerFacts(detail, members, viewerId)
  const gates = facts === null ? null : folderGates(facts)

  /* May edit the project's pages: its tabs, and a Doc's writing. Asked of
     the header's folder, the project root on a tab. */
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
