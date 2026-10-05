// The folder page's Team panel, open while `sharing` is, with its way into Transfer.
import { otherMembers } from '../../lib/folder-authority.js'
import type { FolderGates, FolderViewerFacts } from '../../lib/folder-authority.js'
import { FolderSharingPanel } from '../FolderSharingPanel.js'
import type { GetConnectionsResponse } from '../../../shared/connections.js'
import type { FolderMember, GetFolderResponse } from '../../../shared/folders.js'

export function FolderTeamPanel({
  sharing,
  detail,
  projectName,
  connections,
  facts,
  viewerId,
  setSharing,
  gates,
  members,
  setTransferOpen,
}: {
  readonly sharing: boolean
  readonly detail: GetFolderResponse | undefined
  readonly projectName: string | undefined
  readonly connections: GetConnectionsResponse | undefined
  readonly facts: FolderViewerFacts | null
  readonly viewerId: string | null
  readonly setSharing: (next: boolean) => void
  readonly gates: FolderGates | null
  readonly members: readonly FolderMember[]
  readonly setTransferOpen: (next: boolean) => void
}): React.JSX.Element | null {
  /* Everybody else in the folder, which is a different question and the one
     the owner's delete dialog asks: somebody to hand it to is not the same as
     somebody who is in it. */
  const others = otherMembers(members, viewerId)
  return sharing && detail !== undefined ? (
    <FolderSharingPanel
      folder={detail}
      projectName={projectName}
      connections={connections}
      viewer={facts}
      viewerId={viewerId}
      onClose={() => {
        setSharing(false)
      }}
      /* Transfer is Share's (M4); Export is the project's "…" (u2). */
      /* Offered whenever the folder is shared and the viewer owns it,
         rather than only when somebody is eligible: the dialog says what
         to do when nobody is. */
      onTransfer={
        gates?.transferOwnership === true && others.length > 0
          ? () => {
              /* After Share has closed and handed focus back to its
                 button, so the dialog keeps focus (Escape closes it). */
              setSharing(false)
              window.setTimeout(() => {
                setTransferOpen(true)
              }, 0)
            }
          : undefined
      }
    />
  ) : null
}
