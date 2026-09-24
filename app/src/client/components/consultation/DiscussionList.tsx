/*
The Discussion tab's list of threads (W-C), most recent activity first as the
server orders them (#212, #320).

Each row: the title, the newest post's preview, the faces of who is talking,
how many posts, and when. Closed threads fold under "Closed (n)". The last row
is "New thread": click, type a title, Enter — the thread opens with the
composer focused; Escape lets it go. Nothing else: no filter, no search, no
dialog.
*/
import { useState } from 'react'

import { useCreateDiscussion, useDiscussions } from '../../api/consultation.js'
import type { Discussion } from '../../../shared/consultation.js'
import { DISCUSSION_TITLE_MAX, GENERAL_DISCUSSION_TITLE } from '../../../shared/consultation.js'
import { ChevronDown, ChevronRight, MessageSquare, Plus } from '../../lib/icons.js'
import type { PersonResolver } from '../../lib/thread.js'
import { formatAgo } from '../../parts/format-dates.js'
import { initialsOf } from '../../parts/presenters.js'
import { Face } from '../person-face.js'
import { InlineError } from '../state-patterns.js'
import { Skeleton } from '../ui/skeleton.js'
import { mayStartDiscussion } from './authority.js'
import type { ConsultationViewer } from './authority.js'

export function DiscussionList({
  folderId,
  viewer,
  personOf,
  onOpen,
  onStarted,
}: {
  readonly folderId: string
  readonly viewer: ConsultationViewer | null
  readonly personOf: PersonResolver
  readonly onOpen: (discussionId: string) => void
  readonly onStarted: (discussionId: string) => void
}): React.JSX.Element {
  const list = useDiscussions(folderId, 'all', '')
  const [showClosed, setShowClosed] = useState(false)
  const discussions = list.data?.pages.flatMap((page) => page.discussions) ?? []
  const open = discussions.filter((d) => d.state === 'open')
  const closed = discussions.filter((d) => d.state !== 'open')
  const mayStart = viewer !== null && mayStartDiscussion(viewer)
  const now = Date.now()

  if (list.isPending) return <ListSkeleton />
  if (list.isError) return <InlineError onRetry={() => void list.refetch()} />

  return (
    <div className="min-w-0">
      <ul className="divide-y divide-border" aria-label="Threads">
        {open.map((d) => (
          <ThreadRow key={d.id} discussion={d} now={now} personOf={personOf} onOpen={onOpen} />
        ))}
        {mayStart ? (
          <li>
            <NewThread folderId={folderId} onStarted={onStarted} />
          </li>
        ) : null}
      </ul>

      {open.length === 0 && !mayStart ? (
        <p className="py-4 text-sm text-muted-foreground">No open threads.</p>
      ) : null}

      {closed.length > 0 ? (
        <div className="mt-4">
          <button
            type="button"
            aria-expanded={showClosed}
            className="flex items-center gap-1 rounded-sm py-1 text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => { setShowClosed((value) => !value) }}
          >
            {showClosed ? (
              <ChevronDown className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
            ) : (
              <ChevronRight className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
            )}
            Closed ({closed.length})
          </button>
          {showClosed ? (
            <ul className="divide-y divide-border" aria-label="Closed threads">
              {closed.map((d) => (
                <ThreadRow key={d.id} discussion={d} now={now} personOf={personOf} onOpen={onOpen} />
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {list.hasNextPage ? (
        <button
          type="button"
          className="mt-2 rounded-sm py-1 text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          disabled={list.isFetchingNextPage}
          onClick={() => void list.fetchNextPage()}
        >
          Show older threads
        </button>
      ) : null}
    </div>
  )
}

function ThreadRow({
  discussion: d,
  now,
  personOf,
  onOpen,
}: {
  readonly discussion: Discussion
  readonly now: number
  readonly personOf: PersonResolver
  readonly onOpen: (discussionId: string) => void
}): React.JSX.Element {
  const last = d.last_post ?? null
  const decided = d.state !== 'open' ? d.current_outcome?.statement ?? null : null
  const preview =
    decided !== null
      ? `Decided: ${decided}`
      : last !== null
        ? `${personOf(last.author_id).name}: ${last.preview === '' ? 'shared a file' : last.preview}`
        : d.context !== null && d.context.trim() !== ''
          ? d.context
          : 'No posts yet'
  const faces = (d.participant_ids ?? []).slice(0, 3)
  const count = d.post_count ?? 0
  return (
    <li className="min-w-0">
      <button
        type="button"
        className="-mx-2 flex w-[calc(100%+1rem)] min-w-0 items-center gap-3 rounded-md px-2 py-2.5 text-left outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => { onOpen(d.id) }}
      >
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-baseline gap-2">
            <span className="min-w-0 truncate text-sm font-medium text-foreground">{d.title}</span>
            {d.is_general && d.title !== GENERAL_DISCUSSION_TITLE ? <span className="shrink-0 text-xs text-muted-foreground">General</span> : null}
          </span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">{preview}</span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          <span className="text-xs whitespace-nowrap text-muted-foreground">
            {formatAgo(last?.created_at ?? d.last_activity_at, now)}
          </span>
          <span className="flex items-center gap-2">
            {faces.length > 0 ? (
              <span className="flex -space-x-1" aria-label={faces.map((id) => personOf(id).name).join(', ')}>
                {faces.map((id) => {
                  const person = personOf(id)
                  return (
                    <Face
                      key={id}
                      dense
                      className="ring-2 ring-background"
                      person={{ initials: initialsOf(person.name), name: person.name, ...(person.image === undefined ? {} : { image: person.image }) }}
                    />
                  )
                })}
              </span>
            ) : null}
            {count > 0 ? (
              <span className="flex items-center gap-0.5 text-xs text-muted-foreground tabular-nums" aria-label={`${String(count)} post${count === 1 ? '' : 's'}`}>
                <MessageSquare className="size-3" strokeWidth={1.75} aria-hidden="true" />
                {count}
              </span>
            ) : null}
          </span>
        </span>
      </button>
    </li>
  )
}

/** The list's last row: "New thread", then a title, then Enter. */
function NewThread({
  folderId,
  onStarted,
}: {
  readonly folderId: string
  readonly onStarted: (discussionId: string) => void
}): React.JSX.Element {
  const create = useCreateDiscussion()
  const [typing, setTyping] = useState(false)
  const [title, setTitle] = useState('')

  if (!typing) {
    return (
      <button
        type="button"
        className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-2 rounded-md px-2 py-2.5 text-left text-sm text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => { setTyping(true) }}
      >
        <Plus className="size-4" strokeWidth={1.75} aria-hidden="true" />
        New thread
      </button>
    )
  }

  const cancel = (): void => {
    setTyping(false)
    setTitle('')
  }
  return (
    <form
      className="flex items-center gap-2 py-2"
      onSubmit={(event) => {
        event.preventDefault()
        const trimmed = title.trim()
        if (trimmed === '' || create.isPending) return
        create.mutate(
          { folderId, body: { title: trimmed } },
          {
            onSuccess: (discussion) => {
              cancel()
              onStarted(discussion.id)
            },
          },
        )
      }}
    >
      <Plus className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
      <input
        aria-label="New thread title"
        placeholder="Thread title, then Enter"
        autoFocus
        value={title}
        maxLength={DISCUSSION_TITLE_MAX}
        disabled={create.isPending}
        className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
        onChange={(event) => { setTitle(event.target.value) }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            cancel()
          }
        }}
        onBlur={() => { if (title.trim() === '') cancel() }}
      />
    </form>
  )
}

function ListSkeleton(): React.JSX.Element {
  return (
    <div className="divide-y divide-border" aria-label="Loading threads" aria-busy="true">
      {[0, 1, 2].map((row) => (
        <div key={row} className="space-y-1.5 py-2.5">
          <Skeleton className={row === 1 ? 'h-3.5 w-2/5' : 'h-3.5 w-3/5'} />
          <Skeleton className="h-3 w-4/5" />
        </div>
      ))}
    </div>
  )
}
