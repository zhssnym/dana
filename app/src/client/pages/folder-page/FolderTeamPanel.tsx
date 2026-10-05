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
      /* Offered once the folder is shared, even if nobody is eligible yet:
         the dialog says what to do then. */
      onTransfer={
        gates?.transferOwnership === true && others.length > 0
          ? () => {
              /* Open after Share returns focus to its button, so the dialog keeps focus. */
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
