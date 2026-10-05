/* "Add a page inside", shared by the row's menu and the page's own. */
import { useRef } from 'react'
import { useNavigate } from 'react-router'
import { useCreateFolder } from '../../api/mutations.js'
import { folderActionPath } from './folder-action.js'

/**
 * The folder menu's "Add a page inside", wherever the menu opens (the row and
 * the page's own "…"): an Untitled sub-page, opened with its name field
 * focused and selected, so typing replaces "Untitled".
 */
export function useAddPageInside(): (parentId: string, onMade?: () => void) => void {
  const navigate = useNavigate()
  const create = useCreateFolder()
  /* One page per press: a held key or a double click must not stack Untitled
     pages while the first create is in flight. Set on the press, before the
     mutation's own pending state has rendered. */
  const creating = useRef(false)
  return (parentId, onMade) => {
    if (creating.current) return
    creating.current = true
    create.mutate(
      { name: 'Untitled', parent_folder_id: parentId },
      {
        onSettled: () => {
          creating.current = false
        },
        onSuccess: (made) => {
          onMade?.()
          void navigate(folderActionPath(made.id, 'rename'))
        },
      },
    )
  }
}
