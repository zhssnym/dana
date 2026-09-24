/*
The Discussion tab's threads, as a table (W-C; r3 discuss): one line per
thread, most recent activity first as the server orders them (#212, #320).

GitHub Issues' list, calmed down: `Open n` / `Closed n` above it, then a
quiet header and one row per thread — title, who started it, how many posts,
who is talking, when it last moved. A closed thread's row carries its decision
after the title. The Open view's last row is "New thread": click, type a
title, Enter — the thread opens with its composer focused; Escape lets it go.

The whole row opens the thread; the title is the row's one focusable button,
so the table reads as a table and a keyboard reaches each thread once. Below
`sm` the columns fold into one muted line under the title.
*/
import { useState } from 'react'

import { useCreateDiscussion, useDiscussions } from '../../api/consultation.js'
import type { Discussion } from '../../../shared/consultation.js'
import { DISCUSSION_TITLE_MAX } from '../../../shared/consultation.js'
import { Plus } from '../../lib/icons.js'
import type { PersonResolver } from '../../lib/thread.js'
import { formatAgo } from '../../parts/format-dates.js'
import { initialsOf } from '../../parts/presenters.js'
import { Face } from '../person-face.js'
import { InlineError } from '../state-patterns.js'
import { Skeleton } from '../ui/skeleton.js'
import { cn } from '../ui/utils.js'
import { mayStartDiscussion } from './authority.js'
import type { ConsultationViewer } from './authority.js'

type View = 'open' | 'closed'

const TOGGLE =
  'rounded-sm px-1 py-0.5 text-sm outline-none transition-colors duration-[var(--duration-fast)] focus-visible:ring-2 focus-visible:ring-ring'
const HEAD = 'py-1.5 text-left text-xs font-normal text-muted-foreground'

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

  if (list.isPending) return <ListSkeleton />
  if (list.isError) return <InlineError onRetry={() => void list.refetch()} />

  return (
    <div className="min-w-0">
      <div className="mb-1 flex items-center gap-3" role="group" aria-label="Show">
        {(['open', 'closed'] as const).map((which) => {
          const count = which === 'open' ? open.length : closed.length
          const active = view === which
          return (
            <button
              key={which}
              type="button"
              aria-pressed={active}
              className={cn(TOGGLE, active ? 'font-medium text-foreground' : 'text-muted-foreground hover:text-foreground')}
              onClick={() => { setView(which) }}
            >
              {which === 'open' ? 'Open' : 'Closed'} <span className="tabular-nums">{count}</span>
            </button>
          )
        })}
      </div>

      <table className="w-full table-fixed border-collapse max-sm:block" aria-label={view === 'open' ? 'Open threads' : 'Closed threads'}>
        <thead className="max-sm:hidden">
          <tr className="border-b border-border">
            <th scope="col" className={cn(HEAD, 'pl-2')}>Thread</th>
            <th scope="col" className={cn(HEAD, 'w-40 max-sm:hidden')}>Started by</th>
            <th scope="col" className={cn(HEAD, 'w-16 pr-4 text-right max-sm:hidden')}>Posts</th>
            <th scope="col" className={cn(HEAD, 'w-20 max-sm:hidden')}>People</th>
            <th scope="col" className={cn(HEAD, 'w-28 pr-2 text-right max-sm:hidden')}>Last activity</th>
          </tr>
        </thead>
        <tbody className="max-sm:block">
          {shown.map((d) => (
            <ThreadRow key={d.id} discussion={d} now={now} personOf={personOf} onOpen={onOpen} />
          ))}
          {view === 'open' && mayStart ? (
            <tr className="max-sm:block">
              <td colSpan={5} className="p-0 max-sm:block">
                <NewThread folderId={folderId} onStarted={onStarted} />
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>

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

function faceOf(personOf: PersonResolver, id: string): { id: string; initials: string; name: string; image?: string } {
  const person = personOf(id)
  return { id, initials: initialsOf(person.name), name: person.name, ...(person.image === undefined ? {} : { image: person.image }) }
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
  const decided = d.state !== 'open' ? d.current_outcome?.statement ?? null : null
  const people = (d.participant_ids ?? []).slice(0, 3)
  const count = d.post_count ?? 0
  const author = personOf(d.created_by).name
  const when = formatAgo(d.last_post?.created_at ?? d.last_activity_at, now)
  const cell = 'py-2.5 align-middle text-sm text-muted-foreground max-sm:hidden'
  return (
    <tr
      className="cursor-pointer border-b border-border transition-colors max-sm:block duration-[var(--duration-fast)] hover:bg-accent"
      onClick={() => { onOpen(d.id) }}
    >
      <td className="min-w-0 py-2.5 pr-3 pl-2 align-middle max-sm:block">
        <button
          type="button"
          className="block w-full min-w-0 truncate rounded-sm text-left text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={(event) => {
            event.stopPropagation()
            onOpen(d.id)
          }}
        >
          <span className="font-medium">{d.title}</span>
          {decided !== null && decided !== '' ? <span className="text-muted-foreground"> — {decided}</span> : null}
        </button>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground sm:hidden">
          {author} · {count} post{count === 1 ? '' : 's'} · {when}
        </span>
      </td>
      <td className={cn(cell, 'pr-3')}>
        <span className="flex min-w-0 items-center gap-1.5">
          <Face dense person={faceOf(personOf, d.created_by)} />
          <span className="min-w-0 truncate">{author}</span>
        </span>
      </td>
      <td className={cn(cell, 'pr-4 text-right tabular-nums')}>{count}</td>
      <td className={cell}>
        {people.length > 0 ? (
          <span className="flex -space-x-1" aria-label={people.map((id) => personOf(id).name).join(', ')}>
            {people.map((id) => (
              <Face key={id} dense className="ring-2 ring-background" person={faceOf(personOf, id)} />
            ))}
          </span>
        ) : null}
      </td>
      <td className={cn(cell, 'pr-2 text-right whitespace-nowrap')}>{when}</td>
    </tr>
  )
}

/** The table's last row: "New thread", then a title, then Enter. */
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
        className="flex w-full items-center gap-2 px-2 py-2.5 text-left text-sm text-muted-foreground outline-none transition-colors duration-[var(--duration-fast)] hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
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
