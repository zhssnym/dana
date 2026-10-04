/*
The full-screen Discussion presentation (#212, #320, #553, #560, #570): a
Folder's threads, and one open thread at a time.

Which one is open is the URL's (`?discussion=<id>`), so a thread is
addressable, the browser's Back returns to the list, and `/app/discussions/:id`
and `/app/outcomes/:id` (ConsultationLinkPage) resolve to this same place. A
thread just started from the list opens with its composer focused.

The stored Discussion page is deliberately hidden from the horizontal page
strip. A contextual page header replaces the Work head while focused, gives
one navigation path back to the exact source route, and keeps the full-screen/
sidebar presentation switch icon-only. The list and a thread share that parent
context, with the thread title heading its own conversation.

The presentation/thread/filter/return state is owned by the active workspace
tab. The URL remains canonical for an addressable full-screen thread; the tab
state remembers the filter, presentation and exact page/view/query/hash the
user came from.
*/
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router'

import { useAllPages, useFolder } from '../../api/queries.js'
import { MessagesSquare, PanelRight } from '../../lib/icons.js'
import type { PersonResolver } from '../../lib/thread.js'
import { paths } from '../../routes.js'
import { openDiscussionFullScreen, setChatDockFilter } from '../../state/chat-dock.js'
import { useActiveCollaboration } from '../../shell/tabs.js'
import { DEFAULT_TAB_NAMES, projectTabs } from '../../../shared/folders.js'
import type { Folder } from '../../../shared/folders.js'
import { RosterTints } from '../default-avatar.js'
import { ContextPageHeader } from '../context-page-header.js'
import { Button } from '../ui/button.js'
import type { ConsultationViewer } from './authority.js'
import { DiscussionList } from './DiscussionList.js'
import { DiscussionView } from './DiscussionView.js'
import {
  discussionReturnTo,
  leaveDiscussionFullScreen,
  moveDiscussionToSidebar,
} from './presentation.js'

function folderIdFromPath(path: string): string | null {
  const match = /^\/app\/folders\/([^/?#]+)/.exec(path)
  if (match?.[1] === undefined) return null
  try {
    return decodeURIComponent(match[1])
  } catch {
    return match[1]
  }
}

function sourceLabel(
  path: string,
  pages: readonly Folder[],
): string {
  if (path.startsWith('/app/tasks/')) return 'Task'
  const folderId = folderIdFromPath(path)
  if (folderId === null) return 'Back'
  const page = pages.find((candidate) => candidate.id === folderId)
  if (page === undefined) return 'Back'
  if (page.id === page.project_id) return DEFAULT_TAB_NAMES[page.kind ?? 'work']
  return page.name
}

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
  const location = useLocation()
  const navigate = useNavigate()
  const discussionId = search.get('discussion')
  const [started, setStarted] = useState<string | null>(null)
  /* The thread last left, whose row takes focus when the list returns. */
  const [left, setLeft] = useState<string | null>(null)
  const page = useFolder(folderId).data
  const projectId = page?.project_id ?? folderId
  const allPages = useAllPages(page !== undefined).data ?? []
  const collaboration = useActiveCollaboration()
  const filter =
    collaboration?.kind === 'discussion' && collaboration.folderId === projectId
      ? collaboration.filter
      : 'open'
  /* The page's members, so no two of them wear one face here (r7). */
  const members = page?.members ?? []

  /* A direct full-screen URL seeds the active workspace tab; a sidebar-to-full
     transition updates only presentation/thread and keeps the existing filter
     and return path. If Team is the tab's active collaboration surface, do not
     replace it just because the Discussion page remounted after a workspace-
     tab switch. Once Team closes, the effect runs again and the URL becomes
     the Discussion presentation state. */
  useEffect(() => {
    if (page === undefined || collaboration?.kind === 'team') return
    openDiscussionFullScreen({ folderId: page.project_id, discussionId })
  }, [page?.project_id, discussionId, collaboration?.kind])

  const projectPages = useMemo(
    () => projectTabs(allPages, projectId),
    [allPages, projectId],
  )

  /* A direct/deep link has no remembered source. If it is layered onto an
     ordinary Work/Doc route, stripping only Discussion's own params restores
     that exact route/view/filter state. A stored Discussion page instead falls
     back to the project's primary visible Work page, then another visible
     non-Discussion page, and only then Today for malformed legacy projects. */
  const withoutDiscussion = new URLSearchParams(location.search)
  withoutDiscussion.delete('discussion')
  withoutDiscussion.delete('conversation')
  withoutDiscussion.delete('outcome')
  const cleanQuery = withoutDiscussion.size === 0 ? '' : `?${withoutDiscussion.toString()}`
  const currentPageFallback = `${location.pathname}${cleanQuery}${location.hash}`
  const primaryPage =
    projectPages.find((candidate) => candidate.kind === 'work') ??
    projectPages.find((candidate) => candidate.kind !== 'discussion')
  const fallbackTarget = page?.kind !== 'discussion'
    ? currentPageFallback
    : primaryPage === undefined ? paths.today : paths.folder(primaryPage.id)
  const returnTarget = discussionReturnTo(projectId) ?? fallbackTarget
  const returnLabel = sourceLabel(returnTarget, projectPages)
  const projectName = projectPages.find((candidate) => candidate.id === projectId)?.name ?? page?.name ?? 'Work'
  const parentLabel = projectName === returnLabel ? projectName : `${projectName} · ${returnLabel}`

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
      <section className="min-w-0" aria-label="Discussion">
        <div data-discussion-context-bar="">
          <ContextPageHeader
            parent={parentLabel}
            title="Discussion"
            backLabel={`Back to ${returnLabel}`}
            icon={MessagesSquare}
            compact={discussionId !== null}
            heading={discussionId === null ? (
              <h1 className="truncate text-[length:var(--text-title-size)] leading-[var(--text-title-line)] font-title text-foreground">Discussion</h1>
            ) : (
              <span className="text-sm font-section text-foreground">Discussion</span>
            )}
            onBack={() => { leaveDiscussionFullScreen(navigate, returnTarget) }}
            actions={(
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Open in side panel"
                title="Open in side panel"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => {
                  moveDiscussionToSidebar(navigate, projectId, discussionId, returnTarget)
                }}
              >
                <PanelRight className="size-4" strokeWidth={1.75} aria-hidden="true" />
              </Button>
            )}
          />
        </div>

        <div className="min-w-0 pt-[var(--space-group)]">
          {discussionId === null ? (
            <DiscussionList
              folderId={folderId}
              viewer={viewer}
              personOf={personOf}
              returnTo={left}
              filter={filter}
              onFilterChange={setChatDockFilter}
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
      </section>
    </RosterTints>
  )
}
