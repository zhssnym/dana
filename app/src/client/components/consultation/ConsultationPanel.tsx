/*
The Consultation facet (#212, #320): a Folder's Discussions, and one open
Discussion at a time.

Which one is open is the URL's (`?discussion=<id>`, and `&outcome=<id>` when a
Dana Link to an Outcome brought the person here), so a Discussion is
addressable, the browser's Back returns to the list, and
`/app/discussions/:id` and `/app/outcomes/:id` (ConsultationLinkPage) resolve
to this same place.
*/
import { useCallback } from 'react'
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
  const focusOutcomeId = search.get('outcome')

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
        <DiscussionList folderId={folderId} viewer={viewer} onOpen={(id) => open(id)} />
      ) : (
        <DiscussionView
          key={discussionId}
          discussionId={discussionId}
          folderId={folderId}
          viewer={viewer}
          personOf={personOf}
          focusOutcomeId={focusOutcomeId}
          onBack={() => open(null)}
        />
      )}
    </div>
  )
}
