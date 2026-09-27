/*
The Discussion tab (#212, #320; W-C): a Folder's threads, and one open thread
at a time.

Which one is open is the URL's (`?discussion=<id>`), so a thread is
addressable, the browser's Back returns to the list, and `/app/discussions/:id`
and `/app/outcomes/:id` (ConsultationLinkPage) resolve to this same place. A
thread just started from the list opens with its composer focused.

Since step 7 the tab is a page of its own (`/app/folders/<tab id>`), and
the server lists every thread of the tab's project. A thread reached on
another page (`?discussion=` on a project with no Discussion tab, the Desk)
draws here too; closing it drops the parameter, which shows that page again.
*/
import { useCallback, useState } from 'react'
import { useSearchParams } from 'react-router'

import { useFolder } from '../../api/queries.js'

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
  /* The thread last left, whose row takes focus when the list returns. */
  const [left, setLeft] = useState<string | null>(null)
  /* The page's members, so no two of them wear one face here (r7). */
  const members = useFolder(folderId).data?.members ?? []

  const open = useCallback(
    (id: string | null): void => {
      setSearch((current) => {
        const next = new URLSearchParams(current)
        next.delete('outcome')
        next.delete('conversation')
        if (id === null) next.delete('discussion')
        else next.set('discussion', id)
        return next
      })
    },
    [setSearch],
  )

  return (
    <RosterTints ids={members.map((member) => member.user.id)}>
    <div className="mt-6">
      {discussionId === null ? (
        <DiscussionList
          folderId={folderId}
          viewer={viewer}
          personOf={personOf}
          returnTo={left}
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
          onBack={() => {
            setLeft(discussionId)
            open(null)
          }}
        />
      )}
    </div>
    </RosterTints>
  )
}
