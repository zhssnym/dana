/*
The Discussion tab (#212, #320; W-C): a Folder's threads, and one open thread
at a time.

Which one is open is the URL's (`?discussion=<id>`), so a thread is
addressable, the browser's Back returns to the list, and `/app/discussions/:id`
and `/app/outcomes/:id` (ConsultationLinkPage) resolve to this same place. A
thread just started from the list opens with its composer focused.
*/
import { useCallback, useState } from 'react'
import { useSearchParams } from 'react-router'

import type { PersonResolver } from '../../lib/thread.js'
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

  const open = useCallback(
    (id: string | null): void => {
      setSearch((current) => {
        const next = new URLSearchParams(current)
        next.delete('outcome')
        if (id === null) next.delete('discussion')
        else next.set('discussion', id)
        return next
      })
    },
    [setSearch],
  )

  return (
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
  )
}
