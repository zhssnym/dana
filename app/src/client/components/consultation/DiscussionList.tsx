/*
The Discussion tab's threads as one list, like an issues list: no groups, no
column headers, most recent activity first as the server orders them.

The list reads like an issues list: one bordered box, hairlines between rows,
and a tinted head row with two filters on the left, "Open" (the default) and
"Resolved", with no counts, and a small "New thread" button on the right. The
filter lives in this component only; there is no storage key.
Each thread is one compact line with one leading mark: a thread linked to one
or more Tasks shows the first linked Task's state mark (linking to that Task);
any other shows an outline speech bubble while open, a filled check once
resolved, and pressing it resolves (without a decision) or reopens, with Undo.
Then the title, at medium weight and cut short before the meta; an unread one
(a post from someone else since this person last read it, the server's
`read_at`) is heavier and nothing else marks it. On the right, small muted
meta: the last poster and when ("Lucía Ortega · 4 days ago"), or
"Resolved · Sep 18" once resolved. A resolved thread is the same row, muted.
No preview, no face, no post counts (M4 §4.7).

The keyboard path is the task lists' (`row-keys.ts`): arrows move, Enter
opens, Space resolves or reopens. An old `?threads=closed` link still loads;
the parameter is ignored.

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
import { Button } from '../ui/button.js'
import { MessageCircle, Plus, ResolvedMark } from '../../lib/icons.js'
import type { PersonResolver } from '../../lib/thread.js'
import { formatAgo } from '../../parts/format-dates.js'
import { pushUndo, undoLabel } from '../../shell/undo.js'
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

/* One compact line: mark, title (truncating), meta on the right. */
const ROW =
  'grid h-9 w-full grid-cols-[var(--control-height)_minmax(0,1fr)_auto] items-center gap-x-1 pr-3 pl-1.5 text-sm transition-colors duration-[var(--duration-fast)]'

const MARK = 'flex size-[var(--control-height)] items-center justify-center rounded-sm'

/* The Discussion sidebar's row (#546). Two lines, no rule between rows. */
const DOCKED_ROW =
  'grid w-full grid-cols-[var(--control-height)_minmax(0,1fr)_auto] items-center gap-x-1 rounded-md py-1.5 pr-2 pl-0.5 text-sm transition-colors duration-[var(--duration-fast)]'

export function DiscussionList({
  folderId,
  viewer,
  personOf,
  returnTo = null,
  onOpen,
  onStarted,
  docked = false,
}: {
  /** Drawn in the Discussion sidebar (#546), as a list of conversations:
   * no frame, two lines a row (title, then who said what last). */
  readonly docked?: boolean
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
  const [filter, setFilter] = useState<State>('open')
  const [starting, setStarting] = useState(false)
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
  const mayStart = viewer !== null && mayStartDiscussion(viewer)
  const now = Date.now()
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
      <div ref={keys} className="min-w-0">
        {list.isPending ? <ListSkeleton docked={docked} /> : <InlineError onRetry={() => void list.refetch()} />}
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
        personOf={personOf}
        viewerId={viewerId}
        docked={docked}
        onOpen={onOpen}
        onToggle={() => { toggle(d) }}
      />
    </li>
  )

  const shown = discussions.filter((d) => stateOf(d) === filter)
  const filterButton = (to: State, label: string): React.JSX.Element => (
    <button
      type="button"
      aria-pressed={filter === to}
      className={cn(
        'h-[var(--control-height)] rounded-sm px-1.5 outline-none',
        filter === to ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
      )}
      onClick={() => { setFilter(to) }}
    >
      {label}
    </button>
  )

  return (
    <div ref={keys} className="min-w-0">
      <div className={docked ? undefined : 'overflow-hidden rounded-md border border-border'}>
        <div
          className={cn(
            'flex items-center justify-between gap-3 text-sm',
            docked ? '-mx-1.5 h-9' : 'h-10 border-b border-border bg-muted pr-2 pl-1.5',
          )}
        >
          <div role="group" aria-label="Show threads" className="flex items-center gap-1">
            {filterButton('open', 'Open')}
            {filterButton('resolved', 'Resolved')}
          </div>
          {mayStart ? (
            <Button
              variant={docked ? 'ghost' : 'commit'}
              size="sm"
              className={docked ? 'text-muted-foreground' : undefined}
              onClick={() => {
                setFilter('open')
                setStarting(true)
              }}
            >
              {docked ? <Plus className="size-4" strokeWidth={1.75} aria-hidden="true" /> : null}
              New thread
            </Button>
          ) : null}
        </div>
        <ul className={docked ? '-mx-2 mt-1 flex flex-col gap-[var(--space-row)]' : 'flex flex-col divide-y divide-border'}>
          {starting && mayStart ? (
            <li>
              <NewThread
                folderId={folderId}
                onDone={() => { setStarting(false) }}
                onStarted={onStarted}
              />
            </li>
          ) : null}
          {shown.map(row)}
          {shown.length === 0 && !starting ? (
            <li className={cn('flex items-center px-3 text-sm text-muted-foreground', docked ? 'py-6' : 'h-9')}>
              {filter === 'open' ? 'No open threads' : 'No resolved threads'}
            </li>
          ) : null}
        </ul>
      </div>
      {list.hasNextPage ? (
        <button
          type="button"
          className="mt-1 h-[var(--control-height)] rounded-sm px-1.5 text-xs text-muted-foreground outline-none hover:text-foreground"
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
  state,
  may,
  now,
  personOf,
  viewerId,
  docked,
  onOpen,
  onToggle,
}: {
  readonly docked: boolean
  readonly discussion: Discussion
  readonly state: State
  readonly may: boolean
  readonly now: number
  readonly personOf: PersonResolver
  readonly viewerId: string | null
  readonly onOpen: (discussionId: string) => void
  readonly onToggle: () => void
}): React.JSX.Element {
  const isOpen = state === 'open'
  const fresh = isUnread(d, viewerId)
  const last = d.last_post ?? null
  const linkedTask = d.linked_tasks[0] ?? null
  /* "Lucía Ortega · 4 days ago", or "Resolved · Sep 18". */
  const meta = isOpen
    ? [
        last === null ? '' : last.author_id === viewerId ? 'You' : personOf(last.author_id).name,
        formatAgo(last?.created_at ?? d.last_activity_at, now),
      ]
        .filter((part) => part !== '')
        .join(' · ')
    : `Resolved · ${formatAgo(d.resolved_at ?? d.last_activity_at, now)}`
  /* The dock's second line: who spoke last and what they said. */
  const said = !isOpen
    ? 'Resolved'
    : last === null
      ? 'No messages yet'
      : `${last.author_id === viewerId ? 'You' : personOf(last.author_id).name}: ${last.preview === '' ? 'Picture' : last.preview}`
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
      className={cn(docked ? DOCKED_ROW : ROW, 'cursor-pointer', docked ? 'hover:bg-hover' : 'hover:bg-muted')}
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
      {linkedTask !== null ? (
        <Link
          to={paths.task(linkedTask.id)}
          title={d.linked_tasks.length === 1 ? `Task: ${linkedTask.title}` : `${d.linked_tasks.length} linked tasks · ${linkedTask.title}`}
          aria-label={d.linked_tasks.length === 1 ? `Task: ${linkedTask.title}` : `${d.linked_tasks.length} linked tasks; open ${linkedTask.title}`}
          className={cn(MARK, 'text-muted-foreground outline-none hover:text-foreground')}
        >
          <StateMark state={taskState(linkedTask)} className="size-3.5" />
        </Link>
      ) : may ? (
        <button
          type="button"
          aria-label={isOpen ? 'Resolve thread' : 'Reopen thread'}
          title={isOpen ? 'Resolve' : 'Reopen'}
          className={cn(MARK, 'active:scale-90')}
          onClick={(event) => {
            event.stopPropagation()
            onToggle()
          }}
        >
          {mark}
        </button>
      ) : (
        <span className={MARK}>{mark}</span>
      )}
      {docked ? (
        <>
          <span className="flex min-w-0 flex-col">
            <span
              title={d.title}
              className={cn(
                'truncate',
                isOpen ? 'text-foreground' : 'text-muted-foreground',
                fresh ? 'font-title' : 'font-section',
              )}
            >
              {d.title}
            </span>
            <span className="truncate text-xs text-muted-foreground">{said}</span>
          </span>
          <span className="flex flex-col items-end gap-1 self-start pt-0.5 pl-3">
            <span className="text-xs whitespace-nowrap text-muted-foreground">
              {formatAgo(isOpen ? (last?.created_at ?? d.last_activity_at) : (d.resolved_at ?? d.last_activity_at), now)}
            </span>
            {fresh ? (
              <span className="size-1.5 rounded-full bg-primary">
                <span className="sr-only">New messages</span>
              </span>
            ) : null}
          </span>
        </>
      ) : (
        <>
          <span
            title={d.title}
            className={cn(
              'min-w-0 truncate',
              isOpen ? 'text-foreground' : 'text-muted-foreground',
              fresh ? 'font-title' : 'font-section',
            )}
          >
            {d.title}
          </span>
          <span className="pl-3 text-xs whitespace-nowrap text-muted-foreground">{meta}</span>
        </>
      )}
    </div>
  )
}

/** The row the head's "New thread" opens at the top: a title, then Enter. */
function NewThread({
  folderId,
  onDone,
  onStarted,
}: {
  readonly folderId: string
  readonly onDone: () => void
  readonly onStarted: (discussionId: string) => void
}): React.JSX.Element {
  const create = useCreateDiscussion()
  const [title, setTitle] = useState('')

  const cancel = (): void => {
    setTitle('')
    onDone()
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

function ListSkeleton({ docked }: { readonly docked: boolean }): React.JSX.Element {
  /* The rows' own height, so the list does not jump when it lands. */
  return (
    <div
      className={docked ? 'flex flex-col' : 'flex flex-col divide-y divide-border rounded-md border border-border'}
      aria-label="Loading threads"
      aria-busy="true"
    >
      {[0, 1, 2].map((row) => (
        <div key={row} className="flex h-9 items-center px-3">
          <Skeleton className={row === 1 ? 'h-3.5 w-2/5' : 'h-3.5 w-3/5'} />
        </div>
      ))}
    </div>
  )
}
