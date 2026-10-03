/*
PROTOTYPE (experimental/chat-side-panel): the chat dock.

One panel fixed at the window's right edge holding a project's chat and its
people. It stays open while the person works: a task opens its conversation
here, beside the task. Which project, section and thread are open is
`state/chat-dock.ts`, never the URL, so nothing here navigates.

The chat is the Discussion tab's own list and thread (`consultation/`), with
the open thread read from the dock's store. The viewer's facts and the
people directory are derived the way `FolderPage` derives them for its
`ConsultationPanel`: the roster is the project's (a tab's header folder),
and names fall back to connections, then "Someone".
*/
import { useCallback, useMemo, useState } from 'react'

import { FOLDER_ACCESS_LABELS } from '../../../shared/folder-access.js'
import type { GetFolderResponse } from '../../../shared/folders.js'
import { useConnections, useFolder, useMe } from '../../api/queries.js'
import { viewerFacts } from '../../lib/folder-authority.js'
import { X } from '../../lib/icons.js'
import type { PersonResolver } from '../../lib/thread.js'
import { initialsOf } from '../../parts/presenters.js'
import { closeChatDock, manageTeam, openChatDock, useChatDock } from '../../state/chat-dock.js'
import type { ConsultationViewer } from '../consultation/authority.js'
import { DiscussionList } from '../consultation/DiscussionList.js'
import { DiscussionView } from '../consultation/DiscussionView.js'
import { RosterTints } from '../default-avatar.js'
import { PersonFace } from '../person-face.js'
import { InlineError, SkeletonList } from '../state-patterns.js'
import { Button } from '../ui/button.js'
import { cn } from '../ui/utils.js'

type Section = 'chat' | 'people'

export function ChatDock(): React.JSX.Element | null {
  const dock = useChatDock()
  if (dock === null) return null
  return <Dock key={dock.folderId} folderId={dock.folderId} section={dock.section} discussionId={dock.discussionId} />
}

function Dock({
  folderId,
  section,
  discussionId,
}: {
  readonly folderId: string
  readonly section: Section
  readonly discussionId: string | null
}): React.JSX.Element {
  /* The page the dock was opened from; a tab's people and name are its
     project's, as on the page's own header. */
  const here = useFolder(folderId)
  const onTab = here.data !== undefined && here.data.tab_position !== null
  const headId = onTab ? here.data.project_id : folderId
  const head = useFolder(headId, here.data !== undefined)
  const project = head.data
  const viewerId = useMe().data?.user.id ?? null
  const connections = useConnections()

  const members = useMemo(() => project?.members ?? [], [project?.members])
  const facts = viewerFacts(project, members, viewerId)
  const viewer: ConsultationViewer | null = facts === null || viewerId === null ? null : { viewerId, facts }

  const people = useMemo(() => {
    const known = new Map<string, { name: string; image?: string }>()
    for (const { user } of [...members, ...(connections.data ?? [])]) {
      if (user.display_name === null || known.has(user.id)) continue
      known.set(user.id, { name: user.display_name, ...(user.avatar_url === null ? {} : { image: user.avatar_url }) })
    }
    return known
  }, [members, connections.data])
  const personOf: PersonResolver = useCallback((authorId) => people.get(authorId) ?? { name: 'Someone' }, [people])

  const failed = here.isError ? here : head.isError ? head : null
  const switchTo = (to: Section, label: string): React.JSX.Element => (
    <button
      type="button"
      aria-pressed={section === to}
      className={cn(
        'h-[var(--control-height)] rounded-sm px-1.5 text-sm outline-none focus-visible:bg-hover',
        section === to ? 'font-section text-foreground' : 'text-muted-foreground hover:text-foreground',
      )}
      /* Back to Chat keeps the thread that was open. */
      onClick={() => { openChatDock({ folderId, section: to, discussionId }) }}
    >
      {label}
    </button>
  )

  return (
    <aside
      data-chat-dock=""
      aria-label="Project chat"
      /* Under the sheets, menus and dialogs (z-50), so a thread's own menu
         and the full people panel open over it. */
      className="fixed top-0 right-0 bottom-0 z-40 flex w-[var(--sharing-panel-width)] max-w-full flex-col border-l border-border bg-background"
    >
      <header className="flex h-12 shrink-0 items-center gap-1 border-b border-border pr-2 pl-4">
        <p className="min-w-0 flex-1 truncate text-sm font-title text-foreground" title={project?.name}>
          {project?.name ?? ''}
        </p>
        <div role="group" aria-label="Show" className="flex shrink-0 items-center gap-1">
          {switchTo('chat', 'Chat')}
          {switchTo('people', 'People')}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Close chat"
          className="ml-1 shrink-0 text-muted-foreground hover:text-foreground"
          onClick={closeChatDock}
        >
          <X className="size-4" strokeWidth={1.75} aria-hidden="true" />
        </Button>
      </header>

      <RosterTints ids={members.map((member) => member.user.id)}>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto px-4 pt-4">
          {failed !== null ? (
            <InlineError onRetry={() => void failed.refetch()} />
          ) : project === undefined ? (
            <SkeletonList />
          ) : section === 'people' ? (
            <People project={project} viewerId={viewerId} />
          ) : (
            <Chat folderId={folderId} discussionId={discussionId} viewer={viewer} personOf={personOf} />
          )}
        </div>
      </RosterTints>
    </aside>
  )
}

/* `ConsultationPanel`, with the open thread in the dock's store. */
function Chat({
  folderId,
  discussionId,
  viewer,
  personOf,
}: {
  readonly folderId: string
  readonly discussionId: string | null
  readonly viewer: ConsultationViewer | null
  readonly personOf: PersonResolver
}): React.JSX.Element {
  const [started, setStarted] = useState<string | null>(null)
  /* The thread last left, whose row takes focus when the list returns. */
  const [left, setLeft] = useState<string | null>(null)
  const open = (id: string | null): void => { openChatDock({ folderId, section: 'chat', discussionId: id }) }

  if (discussionId === null) {
    return (
      <div className="pb-4">
        <DiscussionList
          folderId={folderId}
          viewer={viewer}
          personOf={personOf}
          returnTo={left}
          onOpen={open}
          onStarted={(id) => {
            setStarted(id)
            open(id)
          }}
        />
      </div>
    )
  }
  return (
    <DiscussionView
      key={discussionId}
      docked
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
  )
}

/* Who is on the project, read-only; changing it is the full people panel. */
function People({ project, viewerId }: { readonly project: GetFolderResponse; readonly viewerId: string | null }): React.JSX.Element {
  const members = [...project.members].sort((a, b) => Number(b.is_owner) - Number(a.is_owner))
  return (
    <div className="pb-4">
      <ul role="list" className="flex flex-col gap-[var(--space-row)]">
        {members.map((member) => {
          const name = member.user.display_name ?? 'Someone'
          return (
            <li key={member.user.id} className="flex min-h-[var(--row-height)] items-center gap-[var(--space-inline)] py-1">
              <PersonFace id={member.user.id} name={name} initials={initialsOf(name)} image={member.user.avatar_url} />
              <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                {name}
                {member.user.id === viewerId ? <span className="text-muted-foreground"> (you)</span> : null}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {member.is_owner ? 'Owner' : FOLDER_ACCESS_LABELS[member.access]}
              </span>
            </li>
          )
        })}
      </ul>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="mt-[var(--space-group)] -ml-1.5 font-normal text-muted-foreground"
        onClick={manageTeam}
      >
        Manage team
      </Button>
    </div>
  )
}
