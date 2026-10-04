/*
The full-screen Discussion presentation (#212, #320, #553): a Folder's
threads, and one open thread at a time.

Which one is open is the URL's (`?discussion=<id>`), so a thread is
addressable, the browser's Back returns to the list, and `/app/discussions/:id`
and `/app/outcomes/:id` (ConsultationLinkPage) resolve to this same place. A
thread just started from the list opens with its composer focused.

The stored Discussion page is deliberately hidden from the horizontal tab
strip. The project header is the project-level entry point; this surface only
adds the explicit presentation switch back to Sidebar. A thread reached on
another page (`?discussion=` on a project with no Discussion page, the Desk)
draws here too, without that presentation switch.
*/
import { useCallback, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'

import { useAllPages, useFolder } from '../../api/queries.js'
import { PanelRight } from '../../lib/icons.js'
import type { PersonResolver } from '../../lib/thread.js'
import { Button } from '../ui/button.js'
import { RosterTints } from '../default-avatar.js'
import type { ConsultationViewer } from './authority.js'
import { DiscussionList } from './DiscussionList.js'
import { DiscussionView } from './DiscussionView.js'
import { moveDiscussionToSidebar } from './presentation.js'

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
  const navigate = useNavigate()
  const discussionId = search.get('discussion')
  const [started, setStarted] = useState<string | null>(null)
  /* The thread last left, whose row takes focus when the list returns. */
  const [left, setLeft] = useState<string | null>(null)
  const page = useFolder(folderId).data
  const pages = useAllPages().data ?? []
  /* The page's members, so no two of them wear one face here (r7). */
  const members = page?.members ?? []
  const fullScreen = page !== undefined && page.kind === 'discussion' && !page.is_default
  const projectId = fullScreen && page !== undefined ? page.project_id : null
  const sidebarTargetId = !fullScreen || page === undefined || projectId === null
    ? null
    : page.id !== projectId
      ? projectId
      : pages.find((candidate) =>
          candidate.project_id === projectId &&
          candidate.kind !== 'discussion' &&
          candidate.tab_position !== null
        )?.id ?? null

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
      <div className="mt-4">
        {fullScreen ? (
          <div className="mb-3 flex min-h-8 items-center justify-end border-b border-border pb-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={projectId === null || sidebarTargetId === null}
              onClick={() => {
                if (projectId === null || sidebarTargetId === null) return
                moveDiscussionToSidebar(navigate, projectId, discussionId, sidebarTargetId)
              }}
            >
              <PanelRight className="size-4" strokeWidth={1.75} aria-hidden="true" />
              Sidebar view
            </Button>
          </div>
        ) : null}
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
