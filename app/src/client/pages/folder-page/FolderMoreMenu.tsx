// The header's "…" menu: the project's acts, or the page's on a sub-page.
import type { NavigateFunction } from 'react-router'

import type { useDuplicateFolder } from '../../api/mutations.js'
import { ObjectMenu } from '../../components/object-menu.js'
import type { FolderGates } from '../../lib/folder-authority.js'
import { folderLink } from '../../lib/nav-links.js'
import { copyLink } from '../../lib/object-acts.js'
import { paths } from '../../routes.js'
import type { FolderActs } from './folder-acts.js'

export function FolderMoreMenu({
  atProject,
  name,
  id,
  headId,
  isDefault,
  gates,
  setHistoryOpen,
  duplicate,
  navigate,
  acts,
}: {
  readonly atProject: boolean
  readonly name: string
  readonly id: string
  readonly headId: string
  readonly isDefault: boolean
  readonly gates: FolderGates | null
  readonly setHistoryOpen: (next: boolean) => void
  readonly duplicate: ReturnType<typeof useDuplicateFolder>
  readonly navigate: NavigateFunction
  readonly acts: FolderActs
}): React.JSX.Element {
  const { doArchive, askLeave, doDelete, saveAsWorkflow } = acts
  return (
    <ObjectMenu
      kind={atProject ? 'project' : 'folder'}
      name={name}
      align="end"
      handlers={{
        history: () => {
          setHistoryOpen(true)
        },
        'copy-link': () => {
          copyLink(folderLink(id))
        },
        duplicate: () => {
          /* Arriving at the copy is the feedback. */
          duplicate.mutate(headId, {
            onSuccess: (made) => {
              navigate(paths.folder(made.id))
            },
          })
        },
        export: atProject && !isDefault ? () => void saveAsWorkflow() : undefined,
        archive: gates?.trash === true ? doArchive : undefined,
        leave: gates?.leave === true ? askLeave : undefined,
        /* Full control's; ownership alone does not grant it. */
        delete: gates?.trash === true ? doDelete : undefined,
      }}
    />
  )
}
