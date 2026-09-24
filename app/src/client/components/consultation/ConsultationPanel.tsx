/*
The Discussion tab (#212, #320; W-C): a Folder's threads, and one open thread
at a time.

Which one is open is the URL's (`?discussion=<id>`), so a thread is
addressable, the browser's Back returns to the list, and `/app/discussions/:id`
and `/app/outcomes/:id` (ConsultationLinkPage) resolve to this same place. A
thread just started from the list opens with its composer focused.

The tab has one address (r7): `?facet=<its id>`, as every tab has. A bare
`?conversation=open` (a notification about the page's own thread, an old
link) is rewritten to it in place once the tab's id is known, unless the tab
is hidden, where only that address can show it.
*/
import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'

import { useFolder, useFolderFacets } from '../../api/queries.js'

import type { PersonResolver } from '../../lib/thread.js'
import { RosterTints } from '../default-avatar.js'
import type { ConsultationViewer } from './authority.js'
import { DiscussionList } from './DiscussionList.js'
import { DiscussionView } from './DiscussionView.js'

export function ConsultationPanel({
  folderId,
  viewer,
  personOf,
}: {
  readonly folderId: string
  readonly viewer: ConsultationViewer | null
  readonly personOf: PersonResolver
}): React.JSX.Element {
  const [search, setSearch] = useSearchParams()
  const discussionId = search.get('discussion')
  const [started, setStarted] = useState<string | null>(null)
  /* The page's members, so no two of them wear one face here (r7). */
  const members = useFolder(folderId).data?.members ?? []
  const tab = useFolderFacets(folderId).data?.facets.find((facet) => facet.kind === 'consultation')
  const tabId = tab === undefined || tab.hidden ? null : tab.id

  useEffect(() => {
    if (tabId === null || search.get('conversation') !== 'open') return
    setSearch((current) => {
      const next = new URLSearchParams(current)
      next.delete('conversation')
      next.set('facet', tabId)
      return next
    }, { replace: true })
  }, [tabId, search, setSearch])

  const open = useCallback(
    (id: string | null): void => {
      setSearch((current) => {
        const next = new URLSearchParams(current)
        next.delete('outcome')
        if (id === null) {
          next.delete('discussion')
          /* A thread reached by its bare address (`?discussion=`, from a
             notification or a link) is on this tab only because of that
             param; its list stays here by the address the breadcrumb uses. */
          if (!next.has('facet')) {
            if (tabId !== null) next.set('facet', tabId)
            else next.set('conversation', 'open')
          }
        } else next.set('discussion', id)
        return next
      })
    },
    [setSearch, tabId],
  )

  return (
    <RosterTints ids={members.map((member) => member.user.id)}>
    <div className="mt-6">
      {discussionId === null ? (
        <DiscussionList
          folderId={folderId}
          viewer={viewer}
          personOf={personOf}
          onOpen={(id) => { open(id) }}
          onStarted={(id) => {
            setStarted(id)
            open(id)
          }}
        />
      ) : (
        <DiscussionView
          key={discussionId}
          discussionId={discussionId}
          folderId={folderId}
          viewer={viewer}
          personOf={personOf}
          justStarted={started === discussionId}
          onBack={() => { open(null) }}
        />
      )}
    </div>
    </RosterTints>
  )
}
