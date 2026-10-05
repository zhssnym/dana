// The folder header's "…" menu: the project's acts, or the page's on a sub-page.
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
          /* Duplicated server-side; the copy is the duplicator's own private
             folder, and the page goes to it: arriving there is the feedback. */
          duplicate.mutate(headId, {
            onSuccess: (made) => {
              navigate(paths.folder(made.id))
            },
          })
        },
        /* The project as a Dana file; its one home now (it left Share). */
        export: atProject && !isDefault ? () => void saveAsWorkflow() : undefined,
        archive: gates?.trash === true ? doArchive : undefined,
        /* Any member's, refused to the owner until they transfer and to the
           last Full-control member; `folderGates` reads both off the roster. */
        leave: gates?.leave === true ? askLeave : undefined,
        /* Full control's, which custody does not confer (AC-015). */
        delete: gates?.trash === true ? doDelete : undefined,
      }}
    />
  )
}
