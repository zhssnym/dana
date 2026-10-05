// Runs an act the Library asked for by link (`?folder-action=`), once.
import { useEffect, useRef } from 'react'
import type { SetURLSearchParams } from 'react-router'

import { showToast } from '../../state/toasts.js'
import type { FolderGates } from '../../lib/folder-authority.js'
import { ruleFor } from '../../../shared/folder-actions.js'
/* Aliased: `shell/app-sidebar.tsx` exports a different `FolderAction`
   (the acts a Library row reaches by link). */
import type { FolderAction as FolderActionName } from '../../../shared/folder-actions.js'
import { FOLDER_ACTION_PARAM } from '../../shell/app-sidebar.js'
import type { GetFolderResponse } from '../../../shared/folders.js'
import type { FolderActs } from './folder-acts.js'

export function useFolderActionParam({
  search,
  setSearch,
  detail,
  gates,
  setRenaming,
  setCoverOpen,
  setHistoryOpen,
  acts,
}: {
  readonly search: URLSearchParams
  readonly setSearch: SetURLSearchParams
  readonly detail: GetFolderResponse | undefined
  readonly gates: FolderGates | null
  readonly setRenaming: (next: boolean) => void
  readonly setCoverOpen: (next: boolean) => void
  readonly setHistoryOpen: (next: boolean) => void
  readonly acts: Pick<FolderActs, 'askLeave' | 'doArchive' | 'doDelete'>
}): void {
  /* Waits for the folder, since the acts name it, then runs once. The param is
     dropped with `replace`, so a reload or Back does not run it again. */
  const ranAction = useRef(false)
  useEffect(() => {
    const action = search.get(FOLDER_ACTION_PARAM)
    /* The page is not remounted between folders, so the guard re-arms once
       the act is dropped from the address. */
    if (action === null) {
      ranAction.current = false
      return
    }
    if (ranAction.current) return
    if (detail === undefined) return
    /* Wait for the roster too: a gate read before it arrives would swallow
       the act, because `ranAction` is set next. */
    if (gates === null) return
    ranAction.current = true
    /* Known gap: React Router's search lags the address bar, so this can write
       back params already dropped. A fix must also use `window.location.pathname`,
       like `PlaceChrome`'s `changeFilter`. */
    setSearch(
      (current) => {
        const next = new URLSearchParams(current)
        next.delete(FOLDER_ACTION_PARAM)
        return next
      },
      { replace: true },
    )
    /* A pasted or stale link can carry an act the viewer may not perform, so say
       why with the route's own 403 sentence instead of doing nothing. */
    const refuse = (act: FolderActionName): void => {
      showToast(ruleFor(act).why)
    }
    if (action === 'rename') {
      if (gates?.identity === true) setRenaming(true)
      else refuse('folder.profile.edit')
    } else if (action === 'cover') {
      if (gates?.identity === true) setCoverOpen(true)
      else refuse('folder.profile.edit')
    } else if (action === 'history') setHistoryOpen(true)
    /* Leave always asks: its refusals depend on state, not preset, and the
       route's 409 toast already says why. */
    else if (action === 'leave') acts.askLeave()
    else if (action === 'archive') {
      if (gates?.trash === true) acts.doArchive()
      else refuse('folder.trash')
    }
    else if (action === 'delete') {
      if (gates?.trash === true) acts.doDelete()
      else refuse('folder.trash')
    }
  })
}
