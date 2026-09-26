/*
The Discussion tab's threads, laid out as Today lays out tasks (r9-dlist): an
"Open" group ending in "New thread", then a "Resolved" group; no tabs, no
column headers. Most recent activity first, as the server orders them.

Each thread is one row at the task row's height. Where a task has its
checkbox a thread has its status mark, in a shape a task never has: an
outline speech bubble while open, a filled check circle once resolved.
Pressing the mark resolves (the thread view's close without a decision) or
reopens the thread, with Undo. The title carries the row; an unread one (a
post from someone else since this person last read it, the server's
`read_at`) is heavier and nothing else marks it. On the right: an open
thread's last post ("Bilal: How about Tuesday?", wide screens only) after its
title, its other participants and when it last moved ("12 min"); a resolved
one's "Resolved 15 Sep". No post counts (M4 §4.7): the last post and its
time already say whether a thread is alive.

The keyboard path is the task lists' (`row-keys.ts`): arrows move, Enter
opens, Space resolves or reopens. An old `?threads=closed` link still loads;
the parameter is ignored since both groups are always shown.

The list re-reads every twenty seconds while the tab is visible
(`useDiscussions`), so new activity arrives without a reload.
*/
import { useEffect, useState } from 'react'
import { Link } from 'react-router'

import {
  useCreateDiscussion,
  useDiscussions,
  useReopenDiscussion,
  useResolveDiscussion,
} from '../../api/consultation.js'
import type { Discussion } from '../../../shared/consultation.js'
import { DISCUSSION_TITLE_MAX } from '../../../shared/consultation.js'
import { MessageCircle, Plus, ResolvedMark } from '../../lib/icons.js'
import type { PersonResolver } from '../../lib/thread.js'
import { formatAgo, formatCompactDate } from '../../parts/format-dates.js'
import { initialsOf, presenterToday } from '../../parts/presenters.js'
import { pushUndo, undoLabel } from '../../shell/undo.js'
import { Face } from '../person-face.js'
import { StateMark, taskState } from '../thread/timeline/state.js'
import { paths } from '../../routes.js'
import { useRowKeys } from '../row-keys.js'
import { InlineError } from '../state-patterns.js'
import { Skeleton } from '../ui/skeleton.js'
import { cn } from '../ui/utils.js'
import { discussionPowers, mayStartDiscussion } from './authority.js'
import type { ConsultationViewer } from './authority.js'

type State = 'open' | 'resolved'

/** Someone else posted since this person last read the thread. */
export function isUnread(d: Discussion, viewerId: string | null): boolean {
  const last = d.last_post
  if (last === null || last === undefined || last.author_id === viewerId) return false
  if (d.read_at === null || d.read_at === undefined) return true
  return Date.parse(last.created_at) > Date.parse(d.read_at)
}

/* The task row's grid: the mark sits where a task's checkbox does. */
const ROW =
  'grid h-[var(--row-height)] w-full grid-cols-[var(--control-height)_minmax(0,1fr)_auto] items-center rounded-sm pr-1.5 text-sm transition-colors duration-[var(--duration-fast)]'

export function DiscussionList({
  folderId,
  viewer,
  personOf,
  returnTo = null,
  onOpen,
  onStarted,
}: {
  readonly folderId: string
  readonly viewer: ConsultationViewer | null
  readonly personOf: PersonResolver
  /** The thread just left by Escape or Back: its row takes focus once drawn. */
  readonly returnTo?: string | null
  readonly onOpen: (discussionId: string) => void
  readonly onStarted: (discussionId: string) => void
}): React.JSX.Element {
  const list = useDiscussions(folderId, 'all', '')
  const resolve = useResolveDiscussion()
  const reopen = useReopenDiscussion()
  const keys = useRowKeys<HTMLDivElement>()
  /* A pressed mark moves its row at once; the refetch then agrees. */
  const [moved, setMoved] = useState<ReadonlyMap<string, State>>(new Map())
  const move = (id: string, to: State | null): void => {
    setMoved((current) => {
      const next = new Map(current)
      if (to === null) next.delete(id)
      else next.set(id, to)
      return next
    })
  }

  const discussions = list.data?.pages.flatMap((page) => page.discussions) ?? []
  const landed = list.data !== undefined
  useEffect(() => {
    if (returnTo === null || !landed) return
    keys.current?.querySelector<HTMLElement>(`[data-task-id="${CSS.escape(returnTo)}"]`)?.focus()
  }, [returnTo, landed, keys])
  const stateOf = (d: Discussion): State => moved.get(d.id) ?? (d.state === 'open' ? 'open' : 'resolved')
  const may = (d: Discussion): boolean => {
    if (viewer === null) return false
    const powers = discussionPowers(viewer, d, false)
    return stateOf(d) === 'open' ? powers.resolve : powers.reopen
  }
  const open = discussions.filter((d) => stateOf(d) === 'open')
  const resolved = discussions.filter((d) => stateOf(d) === 'resolved')
  const mayStart = viewer !== null && mayStartDiscussion(viewer)
  const now = Date.now()
  const today = presenterToday()
  const viewerId = viewer?.viewerId ?? null

  const toggle = (d: Discussion): void => {
    if (!may(d)) return
    const settled = (): void => { move(d.id, null) }
    if (stateOf(d) === 'open') {
      move(d.id, 'resolved')
      resolve.mutate(
        { id: d.id, body: {} },
        {
          onSettled: settled,
          onSuccess: () => {
            pushUndo(undoLabel('Resolved', d.title), () => { reopen.mutate(d.id) })
          },
        },
      )
    } else {
      move(d.id, 'open')
      reopen.mutate(d.id, {
        onSettled: settled,
        onSuccess: () => {
          pushUndo(undoLabel('Reopened', d.title), () => { resolve.mutate({ id: d.id, body: {} }) })
        },
      })
    }
  }

  /* The keyboard path's scope mounts once, loading or not: `useRowKeys`
     attaches to it on the first render only. */
  if (list.isPending || list.isError) {
    return (
      <div ref={keys} className="-mx-1.5 min-w-0">
        {list.isPending ? <ListSkeleton /> : <InlineError onRetry={() => void list.refetch()} />}
      </div>
    )
  }

  const row = (d: Discussion): React.JSX.Element => (
    <li key={d.id}>
      <ThreadRow
        discussion={d}
        state={stateOf(d)}
        may={may(d)}
        now={now}
        today={today}
        personOf={personOf}
        viewerId={viewerId}
        onOpen={onOpen}
        onToggle={() => { toggle(d) }}
      />
    </li>
  )

  return (
    <div ref={keys} className="-mx-1.5 min-w-0">
      <div className="space-y-[var(--space-group)]">
        <section aria-label="Open">
          <h2 className="mb-1 px-1.5 text-sm font-section text-foreground">Open</h2>
          <ul className="flex flex-col">
            {open.map(row)}
            {mayStart ? (
              <li>
                <NewThread folderId={folderId} onStarted={onStarted} />
              </li>
            ) : null}
          </ul>
          {open.length === 0 && !mayStart ? (
            <p className="px-1.5 py-1 text-sm text-muted-foreground">No open threads.</p>
          ) : null}
        </section>

        {resolved.length === 0 ? null : (
          <section aria-label="Resolved">
            <h2 className="mb-1 px-1.5 text-sm font-section text-foreground">Resolved</h2>
            <ul className="flex flex-col">{resolved.map(row)}</ul>
          </section>
        )}

        {list.hasNextPage ? (
          <button
            type="button"
            className="h-[var(--control-height)] rounded-sm px-1.5 text-xs text-muted-foreground outline-none hover:text-foreground"
            disabled={list.isFetchingNextPage}
            onClick={() => void list.fetchNextPage()}
          >
            Show older threads
          </button>
        ) : null}
      </div>
    </div>
  )
}

function ThreadRow({
  discussion: d,
  state,
  may,
  now,
  today,
  personOf,
  viewerId,
  onOpen,
  onToggle,
}: {
  readonly discussion: Discussion
  readonly state: State
  readonly may: boolean
  readonly now: number
  readonly today: string
  readonly personOf: PersonResolver
  readonly viewerId: string | null
  readonly onOpen: (discussionId: string) => void
  readonly onToggle: () => void
}): React.JSX.Element {
  const isOpen = state === 'open'
  const fresh = isUnread(d, viewerId)
  /* What was said last, so the list answers "does this need me?" unopened. */
  const last = d.last_post !== null && d.last_post !== undefined && d.last_post.preview !== '' ? d.last_post : null
  const mark = isOpen ? (
    <MessageCircle className="size-4 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
  ) : (
    <ResolvedMark className="text-primary" />
  )
  return (
    <div
      /* The keyboard path (`row-keys.ts`) keys rows by `data-task-id`. */
      data-row-key=""
      data-task-id={d.id}
      data-thread-state={state}
      role="link"
      aria-label={d.title}
      className={cn(ROW, 'cursor-pointer hover:bg-muted')}
      onClick={(event) => {
        if ((event.target as HTMLElement).closest('button, a')) return
        onOpen(d.id)
      }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return
        if (event.key === 'Enter') {
          event.preventDefault()
          onOpen(d.id)
        } else if (event.key === ' ') {
          event.preventDefault()
          onToggle()
        }
      }}
    >
      {may ? (
        <button
          type="button"
          aria-label={isOpen ? 'Resolve thread' : 'Reopen thread'}
          title={isOpen ? 'Resolve' : 'Reopen'}
          className="flex size-[var(--control-height)] items-center justify-center rounded-sm active:scale-90"
          onClick={(event) => {
            event.stopPropagation()
            onToggle()
          }}
        >
          {mark}
        </button>
      ) : (
        <span className="flex size-[var(--control-height)] items-center justify-center">{mark}</span>
      )}
      <span className="flex min-w-0 items-baseline gap-2">
        <span
          title={d.title}
          className={cn(
            'max-w-full min-w-0 shrink-0 truncate',
            isOpen ? 'text-foreground' : 'text-muted-foreground',
            fresh ? 'font-title' : 'font-normal',
          )}
        >
          {d.title}
        </span>
        {d.task !== null ? (
          /* The task this thread is about (M5): its state, linking to it. */
          <Link
            to={paths.task(d.task.id)}
            title={`Task: ${d.task.title}`}
            aria-label={`Task: ${d.task.title}`}
            className="flex shrink-0 self-center rounded-sm text-muted-foreground outline-none hover:text-foreground"
          >
            <StateMark state={taskState(d.task)} className="size-3.5" />
          </Link>
        ) : null}
        {isOpen && last !== null ? (
          <span className="min-w-0 flex-1 truncate text-muted-foreground max-md:hidden">
            {last.author_id === viewerId ? 'You' : personOf(last.author_id).name}: {last.preview}
          </span>
        ) : null}
      </span>
      <span className="flex items-center gap-2 pl-3 text-xs whitespace-nowrap text-muted-foreground">
        {isOpen ? (
          <>
            <Faces ids={(d.participant_ids ?? []).filter((id) => id !== viewerId).slice(0, 3)} personOf={personOf} />
            <span>{formatAgo(d.last_post?.created_at ?? d.last_activity_at, now)}</span>
          </>
        ) : d.resolved_at === null ? null : (
          <span>Resolved {formatCompactDate(d.resolved_at.slice(0, 10), today)}</span>
        )}
      </span>
    </div>
  )
}

/** Who else is talking, as small overlapping faces; the reader never shows. */
function Faces({
  ids,
  personOf,
}: {
  readonly ids: readonly string[]
  readonly personOf: PersonResolver
}): React.JSX.Element | null {
  if (ids.length === 0) return null
  return (
    <span className="flex -space-x-1" aria-label={ids.map((id) => personOf(id).name).join(', ')}>
      {ids.map((id) => {
        const person = personOf(id)
        return (
          <Face
            key={id}
            dense
            className="ring-2 ring-background"
            person={{ id, initials: initialsOf(person.name), name: person.name, ...(person.image === undefined ? {} : { image: person.image }) }}
          />
        )
      })}
    </span>
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
        className={cn(ROW, 'text-left text-muted-foreground outline-none hover:bg-muted hover:text-foreground')}
        onClick={() => { setTyping(true) }}
      >
        <span className="flex justify-center">
          <Plus className="size-4" strokeWidth={1.75} aria-hidden="true" />
        </span>
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
      className={ROW}
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
      <span className="flex justify-center">
        <Plus className="size-4 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
      </span>
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
  /* The rows' own height, so the list does not jump when it lands. */
  return (
    <div className="flex flex-col px-1.5" aria-label="Loading threads" aria-busy="true">
      {[0, 1, 2].map((row) => (
        <div key={row} className="flex h-[var(--row-height)] items-center">
          <Skeleton className={row === 1 ? 'h-3.5 w-2/5' : 'h-3.5 w-3/5'} />
        </div>
      ))}
    </div>
  )
}
