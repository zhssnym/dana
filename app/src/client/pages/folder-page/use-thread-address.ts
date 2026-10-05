// Where a thread's address on the folder page is drawn: here, or on the Discussion tab.
import { useEffect } from 'react'
import type { NavigateFunction } from 'react-router'

import { paths } from '../../routes.js'
import type { Folder, PageKind } from '../../../shared/folders.js'

export function useThreadAddress({
  search,
  navigate,
  id,
  kind,
  isDefault,
  discussionTab,
}: {
  readonly search: URLSearchParams
  readonly navigate: NavigateFunction
  readonly id: string
  readonly kind: PageKind | null
  readonly isDefault: boolean
  readonly discussionTab: Folder | undefined
}): boolean {
  /* A thread's address: `?discussion=` (ConsultationLinkPage, Discuss, an
     old link) or a notification's `?conversation=open` about the page's own
     thread, never on Desk. On a project with a Discussion tab it moves there;
     otherwise (the Desk, a project without one) the thread is drawn here. */
  const threadAsked =
    search.get('discussion') !== null || (search.get('conversation') === 'open' && !isDefault)
  const moveThreadTo =
    threadAsked && kind !== 'discussion' && discussionTab !== undefined && discussionTab.id !== id
      ? discussionTab.id
      : null
  useEffect(() => {
    if (moveThreadTo === null) return
    const next = new URLSearchParams(search)
    next.delete('conversation')
    const query = next.size === 0 ? '' : `?${next.toString()}`
    void navigate(`${paths.folder(moveThreadTo)}${query}`, { replace: true })
  }, [moveThreadTo, search, navigate])
  const threadHere = kind === 'discussion' || (threadAsked && moveThreadTo === null)
  return threadHere
}
