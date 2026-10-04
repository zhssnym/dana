/*
The Discussion surface is one flat thread list shared by full-screen and the
sidebar. The two presentations differ only where width requires it: full-screen
uses a one-line row with right-side meta, while the sidebar uses the same row
language compressed to two lines.

Open and Resolved are filters, not page tabs. They live in one compact segmented
control with a clear selected state, while "+ New thread" is the single creation
action beside them. The toolbar and rows sit directly on the Discussion surface:
no bordered card around another bordered card, no tinted table head, and no
extra empty-state frame.

Each thread has one leading mark. A thread linked to one or more Tasks shows the
first linked Task's state mark (linking to that Task); any other shows an outline
speech bubble while open, a filled check once resolved, and pressing it resolves
(without a decision) or reopens, with Undo. Unread titles are heavier. Resolved
threads are muted. The list re-reads every twenty seconds while visible.
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

export type DiscussionListFilter = 'open' | 'resolved'
type State = DiscussionListFilter

/** Someone else posted since this person last read the thread. */
export function isUnread(d: Discussion, viewerId: string | null): boolean {
  const last = d.last_post
  if (last === null || last === undefined || last.author_id === viewerId) return false
  if (d.read_at === null || d.read_at === undefined) return true
  return Date.parse(last.created_at) > Date.parse(d.read_at)
}

/* Full-screen: one compact line, with its meta on the right. */
const ROW =
  'grid min-h-10 w-full grid-cols-[var(--control-height)_minmax(0,1fr)_auto] items-center gap-x-1 rounded-sm pr-2 pl-1 text-sm transition-colors duration-[var(--duration-fast)]'

const MARK = 'flex size-[var(--control-height)] items-center justify-center rounded-sm'

/* Sidebar: the same thread hierarchy in two lines so the title can breathe. */
const DOCKED_ROW =
  'grid w-full grid-cols-[var(--control-height)_minmax(0,1fr)_auto] items-center gap-x-1 rounded-sm py-1.5 pr-2 pl-0.5 text-sm transition-colors duration-[var(--duration-fast)]'

export function DiscussionList({
  folderId,
  viewer,
  personOf,
  returnTo = null,
  onOpen,
  onStarted,
  docked = false,
  filter: controlledFilter,
  onFilterChange,
}: {
  readonly docked?: boolean
  readonly folderId: string
  readonly viewer: ConsultationViewer | null
  readonly personOf: PersonResolver
  /** The thread just left by Escape or Back: its row takes focus once drawn. */
  readonly returnTo?: string | null
  readonly onOpen: (discussionId: string) => void
  readonly onStarted: (discussionId: string) => void
  /** Controlled by the workspace tab when present; local for legacy callers. */
  readonly filter?: DiscussionListFilter
  readonly onFilterChange?: (filter: DiscussionListFilter) => void
}): React.JSX.Element {
  const list = useDiscussions(folderId, 'all', '')
  const resolve = useResolveDiscussion()
  const reopen = useReopenDiscussion()
  const keys = useRowKeys<HTMLDivElement>()
  const [localFilter, setLocalFilter] = useState<State>('open')
  const filter = controlledFilter ?? localFilter
  const setFilter = (next: State): void => {
    if (controlledFilter === undefined) setLocalFilter(next)
    onFilterChange?.(next)
  }
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
        'h-7 rounded-sm px-2 text-xs font-section outline-none transition-colors duration-[var(--duration-fast)]',
        filter === to
          ? 'bg-background text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground',
      )}
      onClick={() => { setFilter(to) }}
    >
      {label}
    </button>
  )

  return (
    <div ref={keys} className="min-w-0">
      <div className="flex min-h-10 items-center justify-between gap-3 border-b border-border pb-2 text-sm">
        <div
          role="group"
          aria-label="Show threads"
          className="inline-flex shrink-0 items-center gap-0.5 rounded-md bg-muted p-0.5"
        >
          {filterButton('open', 'Open')}
          {filterButton('resolved', 'Resolved')}
        </div>
        {mayStart ? (
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 text-muted-foreground hover:text-foreground"
            onClick={() => {
              setFilter('open')
              setStarting(true)
            }}
          >
            <Plus className="size-4" strokeWidth={1.75} aria-hidden="true" />
            New thread
          </Button>
        ) : null}
      </div>
      <ul className={cn('flex flex-col divide-y divide-border', docked && '-mx-2')}>
        {starting && mayStart ? (
          <li>
            <NewThread
              folderId={folderId}
              docked={docked}
              onDone={() => { setStarting(false) }}
              onStarted={onStarted}
            />
          </li>
        ) : null}
        {shown.map(row)}
        {shown.length === 0 && !starting ? (
          <li className="flex items-center px-2 py-8 text-sm text-muted-foreground">
            {filter === 'open' ? 'No open threads' : 'No resolved threads'}
          </li>
        ) : null}
      </ul>
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
  const meta = isOpen
    ? [
        last === null ? '' : last.author_id === viewerId ? 'You' : personOf(last.author_id).name,
        formatAgo(last?.created_at ?? d.last_activity_at, now),
      ]
        .filter((part) => part !== '')
        .join(' · ')
    : `Resolved · ${formatAgo(d.resolved_at ?? d.last_activity_at, now)}`
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
      className={cn(docked ? DOCKED_ROW : ROW, 'cursor-pointer hover:bg-hover')}
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

/** The row the "+ New thread" action opens at the top: a title, then Enter. */
function NewThread({
  folderId,
  docked,
  onDone,
  onStarted,
}: {
  readonly folderId: string
  readonly docked: boolean
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
      className={docked ? DOCKED_ROW : ROW}
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
  return (
    <div className="flex flex-col divide-y divide-border" aria-label="Loading threads" aria-busy="true">
      {[0, 1, 2].map((row) => (
        <div key={row} className="flex h-10 items-center px-2">
          <Skeleton className={row === 1 ? 'h-3.5 w-2/5' : 'h-3.5 w-3/5'} />
        </div>
      ))}
    </div>
  )
}
