/* The Library's two creates, New work and New collection. */
import { useRef } from 'react'
import { useNavigate } from 'react-router'
import { useCreateFolder } from '../../api/mutations.js'
import { useCreateShelf } from '../../api/shelf-mutations.js'
import { paths } from '../../routes.js'
import type { Shelf } from '../../../shared/shelves.js'
import { folderActionPath, SHELF_ACTION_PARAM } from './folder-action.js'
import { untitledCollectionName } from './library-pages.js'

const NO_SHELVES: readonly Shelf[] = []

export function useLibraryCreate(shelves: readonly Shelf[] | undefined): {
  readonly newPage: () => void
  readonly newCollection: () => void
} {
  const navigate = useNavigate()
  const create = useCreateFolder()
  const createShelf = useCreateShelf()
  /* One page per press, the row "+"'s rule: a double click must not stack
     Untitled pages while the first create is in flight. A ref and not
     `create.isPending`, which has not rendered yet when the second click of a
     double click arrives. Opened with its name selected, so typing replaces
     "Untitled". */
  const creating = useRef(false)
  const newPage = (): void => {
    if (creating.current) return
    creating.current = true
    /* `kind: null`: the new project's page offers the picker (step 7). */
    create.mutate(
      { name: 'Untitled', kind: null },
      {
        onSettled: () => {
          creating.current = false
        },
        onSuccess: (made) => void navigate(folderActionPath(made.id, 'rename')),
      },
    )
  }
  /* Collection creation mirrors a new Work: one request, then its existing
     title editor is the naming surface. No dialog and no second Collection UI. */
  const creatingCollection = useRef(false)
  const newCollection = (): void => {
    if (creatingCollection.current) return
    creatingCollection.current = true
    createShelf.mutate(
      { name: untitledCollectionName(shelves ?? NO_SHELVES) },
      {
        onSettled: () => {
          creatingCollection.current = false
        },
        onSuccess: (made) => {
          void navigate(`${paths.shelf(made.id)}?${SHELF_ACTION_PARAM}=rename`)
        },
      },
    )
  }
  return { newPage, newCollection }
}
