/*
The Discussion tab's threads, as a calm index (W-C; r4 discuss): one row per
thread, most recent activity first as the server orders them (#212, #320).

`Open` / `Closed` above it, then one row per thread: the title, and under it a
muted line — who is talking, how many posts, when it last moved, and for a
closed thread its decision. A thread that moved since the viewer last opened
it carries a heavier title; nothing else marks it. The Open view's last row is
"New thread": click, type a title, Enter — the thread opens with its composer
focused; Escape lets it go.
*/
import { useState } from 'react'

import { useCreateDiscussion, useDiscussions } from '../../api/consultation.js'
import type { Discussion } from '../../../shared/consultation.js'
import { DISCUSSION_TITLE_MAX } from '../../../shared/consultation.js'
import { isDiscussionNew, markDiscussionSeen } from '../../lib/discussion-seen.js'
import { Plus } from '../../lib/icons.js'
import type { PersonResolver } from '../../lib/thread.js'
import { formatAgo } from '../../parts/format-dates.js'
import { InlineError } from '../state-patterns.js'
import { Skeleton } from '../ui/skeleton.js'
import { cn } from '../ui/utils.js'
import { mayStartDiscussion } from './authority.js'
import type { ConsultationViewer } from './authority.js'

type View = 'open' | 'closed'

const TOGGLE =
  'rounded-sm px-1 py-0.5 text-sm outline-none transition-colors duration-[var(--duration-fast)] focus-visible:ring-2 focus-visible:ring-ring'

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
  const [view, setView] = useState<View>('open')
  const discussions = list.data?.pages.flatMap((page) => page.discussions) ?? []
  const open = discussions.filter((d) => d.state === 'open')
  const closed = discussions.filter((d) => d.state !== 'open')
  const mayStart = viewer !== null && mayStartDiscussion(viewer)
  const shown = view === 'open' ? open : closed
  const now = Date.now()
  const viewerId = viewer?.viewerId ?? null
  const openThread = (id: string): void => {
    markDiscussionSeen(id)
    onOpen(id)
  }

  if (list.isPending) return <ListSkeleton />
  if (list.isError) return <InlineError onRetry={() => void list.refetch()} />

  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-center gap-3" role="group" aria-label="Show">
        {(['open', 'closed'] as const).map((which) => {
          const active = view === which
          return (
            <button
              key={which}
              type="button"
              aria-pressed={active}
              className={cn(TOGGLE, active ? 'font-medium text-foreground' : 'text-muted-foreground hover:text-foreground')}
              onClick={() => { setView(which) }}
            >
              {which === 'open' ? 'Open' : 'Closed'}
            </button>
          )
        })}
      </div>

      <ul className="flex flex-col gap-0.5" aria-label={view === 'open' ? 'Open threads' : 'Closed threads'}>
        {shown.map((d) => (
          <li key={d.id}>
            <ThreadRow discussion={d} now={now} personOf={personOf} fresh={isDiscussionNew(d, viewerId)} onOpen={openThread} />
          </li>
        ))}
        {view === 'open' && mayStart ? (
          <li>
            <NewThread folderId={folderId} onStarted={onStarted} />
          </li>
        ) : null}
      </ul>

      {shown.length === 0 && !(view === 'open' && mayStart) ? (
        <p className="px-2 py-3 text-sm text-muted-foreground">{view === 'open' ? 'No open threads.' : 'No closed threads.'}</p>
      ) : null}

      {list.hasNextPage ? (
        <button
          type="button"
          className="mt-2 rounded-sm px-2 py-1 text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
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
  fresh,
  onOpen,
}: {
  readonly discussion: Discussion
  readonly now: number
  readonly personOf: PersonResolver
  readonly fresh: boolean
  readonly onOpen: (discussionId: string) => void
}): React.JSX.Element {
  const decided = d.state !== 'open' ? d.current_outcome?.statement ?? '' : ''
  const ids = (d.participant_ids ?? []).slice(0, 3)
  const people = (ids.length > 0 ? ids : [d.created_by]).map((id) => personOf(id).name).join(', ')
  const count = d.post_count ?? 0
  const when = formatAgo(d.last_post?.created_at ?? d.last_activity_at, now)
  return (
    <button
      type="button"
      className="block w-full min-w-0 rounded-md px-2 py-1.5 text-left outline-none transition-colors duration-[var(--duration-fast)] hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
      onClick={() => { onOpen(d.id) }}
    >
      <span className={cn('block truncate text-sm text-foreground', fresh ? 'font-semibold' : 'font-normal')}>{d.title}</span>
      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
        {people} · {count} post{count === 1 ? '' : 's'} · {when}
        {decided !== '' ? ` · ${decided}` : null}
      </span>
    </button>
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
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground outline-none transition-colors duration-[var(--duration-fast)] hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
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
      className="flex items-center gap-2 px-2 py-2"
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
        <div key={row} className="py-3">
          <Skeleton className={row === 1 ? 'h-3.5 w-2/5' : 'h-3.5 w-3/5'} />
        </div>
      ))}
    </div>
  )
}
