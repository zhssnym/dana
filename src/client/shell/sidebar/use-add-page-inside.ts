import { useRef } from 'react'
import { useNavigate } from 'react-router'
import { useCreateFolder } from '../../api/mutations.js'
import { folderActionPath } from './folder-action.js'

/** Opens the new page with its name selected, so typing replaces "Untitled". */
export function useAddPageInside(): (parentId: string, onMade?: () => void) => void {
  const navigate = useNavigate()
  const create = useCreateFolder()
  /* A ref, not isPending, which has not rendered yet when a held key or double
     click repeats. */
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
