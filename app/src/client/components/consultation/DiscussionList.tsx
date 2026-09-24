/*
A Folder's Consultation facet: its Discussions, most recent activity first as
the server orders them (#212, #320). A state filter (Open by default), a
debounced title/context search, keyset "Load more", and a Start button for
viewers who may start one. The Start button has one home at a time: the
header row while there are discussions to list, the empty state otherwise.

"No discussions yet" is only said when the Folder truly has none: an empty
Open list asks the unfiltered list once (`NothingOpen`) before choosing
between "No discussions yet" and "No open discussions".
*/
import { useEffect, useState } from 'react'

import { useDiscussions } from '../../api/consultation.js'
import type { Discussion, DiscussionListState } from '../../../shared/consultation.js'
import { formatAgo } from '../../parts/format-dates.js'
import { Plus, Search } from '../../lib/icons.js'
import { InlineError } from '../state-patterns.js'
import { Button } from '../ui/button.js'
import { Input } from '../ui/input.js'
import { Skeleton } from '../ui/skeleton.js'
import { mayStartDiscussion } from './authority.js'
import type { ConsultationViewer } from './authority.js'
import { Choice } from './Choice.js'
import { StartDiscussionDialog } from './StartDiscussionDialog.js'

const FILTERS: ReadonlyArray<{ value: DiscussionListState; label: string }> = [
  { value: 'open', label: 'Open' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'all', label: 'All' },
]

const SEARCH_DEBOUNCE_MS = 250

/* Search is offered once there are more discussions than fit at a glance. */
const SEARCH_FROM = 9

const WHAT_A_DISCUSSION_IS =
  'A discussion is one question for this folder. People talk it through, then someone records the outcome so the decision stays findable.'

export function DiscussionList({
  folderId,
  viewer,
  onOpen,
}: {
  folderId: string
  viewer: ConsultationViewer | null
  onOpen: (discussionId: string) => void
}): React.JSX.Element {
  const [state, setState] = useState<DiscussionListState>('open')
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [starting, setStarting] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(search), SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [search])

  const list = useDiscussions(folderId, state, query)
  const discussions = list.data?.pages.flatMap((page) => page.discussions) ?? []
  const mayStart = viewer !== null && mayStartDiscussion(viewer)
  const searching = query.trim() !== ''
  /* Once shown, the box stays while a search is typed, even if it narrows
     the list below the threshold. */
  const offerSearch =
    search !== '' || searching || discussions.length >= SEARCH_FROM || list.hasNextPage

  const startButton = mayStart ? (
    <Button type="button" variant="commit" className="shrink-0" onClick={() => setStarting(true)}>
      <Plus data-icon="inline-start" className="size-4" strokeWidth={1.75} aria-hidden="true" />
      Start a discussion
    </Button>
  ) : null

  /* An empty list carries its own Start button, so the header's steps aside. */
  const listed = !list.isPending && !list.isError && discussions.length > 0

  let body: React.JSX.Element
  if (list.isPending) {
    body = <ListSkeleton />
  } else if (list.isError) {
    body = <InlineError onRetry={() => void list.refetch()} />
  } else if (discussions.length === 0) {
    body =
      searching || state === 'resolved' ? (
        <NoMatch
          text={
            searching
              ? `No discussions match “${query.trim()}”.`
              : 'No resolved discussions yet.'
          }
          startButton={startButton}
        />
      ) : state === 'open' ? (
        <NothingOpen folderId={folderId} startButton={startButton} />
      ) : (
        <NoDiscussionsYet startButton={startButton} />
      )
  } else {
    const now = Date.now()
    body = (
      <div className="space-y-2">
        <ul className="divide-y divide-border">
          {discussions.map((discussion) => (
            <DiscussionRow
              key={discussion.id}
              discussion={discussion}
              now={now}
              onOpen={onOpen}
            />
          ))}
        </ul>
        {list.hasNextPage ? (
          <div className="flex justify-center">
            <Button
              type="button"
              variant="ghost"
              className="text-muted-foreground"
              disabled={list.isFetchingNextPage}
              onClick={() => void list.fetchNextPage()}
            >
              Load more
            </Button>
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="min-w-0 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Choice
          label="Filter discussions by state"
          value={state}
          options={FILTERS}
          onSelect={setState}
          className="shrink-0"
        />
        {offerSearch ? (
          <div className="relative min-w-40 flex-1">
            <Search
              className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            <Input
              type="search"
              aria-label="Search discussions"
              placeholder="Search discussions"
              value={search}
              maxLength={200}
              className="pl-7"
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        ) : (
          <div className="flex-1" />
        )}
        {listed ? startButton : null}
      </div>

      {body}

      {mayStart ? (
        <StartDiscussionDialog
          folderId={folderId}
          open={starting}
          onOpenChange={setStarting}
          onOpen={onOpen}
        />
      ) : null}
    </div>
  )
}

function DiscussionRow({
  discussion,
  now,
  onOpen,
}: {
  discussion: Discussion
  now: number
  onOpen: (discussionId: string) => void
}): React.JSX.Element {
  const resolved = discussion.state === 'resolved'
  const statement = discussion.current_outcome?.statement ?? null
  return (
    <li className="min-w-0 py-2">
      <div className="flex min-w-0 items-baseline gap-2">
        <button
          type="button"
          className="min-w-0 truncate text-left text-sm font-medium text-foreground underline-offset-2 outline-none hover:underline focus-visible:underline"
          onClick={() => onOpen(discussion.id)}
        >
          {discussion.title}
        </button>
        {discussion.is_general ? (
          <span className="shrink-0 text-xs text-muted-foreground">General</span>
        ) : null}
        {resolved ? (
          <span className="shrink-0 text-xs text-muted-foreground">Resolved</span>
        ) : null}
        <span className="ml-auto shrink-0 pl-2 text-xs whitespace-nowrap text-muted-foreground">
          Active {formatAgo(discussion.last_activity_at, now)}
        </span>
      </div>
      {resolved && statement !== null ? (
        <p className="mt-0.5 truncate text-xs text-foreground">
          <span className="font-medium">Outcome:</span> {statement}
        </p>
      ) : null}
      {discussion.context !== null && discussion.context.trim() !== '' ? (
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{discussion.context}</p>
      ) : null}
    </li>
  )
}

function ListSkeleton(): React.JSX.Element {
  return (
    <div
      className="divide-y divide-border"
      aria-label="Loading discussions"
      aria-busy="true"
    >
      {[0, 1, 2].map((row) => (
        <div key={row} className="space-y-1.5 py-2.5">
          <Skeleton className={row === 1 ? 'h-3.5 w-2/5' : 'h-3.5 w-3/5'} />
          <Skeleton className="h-3 w-4/5" />
        </div>
      ))}
    </div>
  )
}

function NoDiscussionsYet({
  startButton,
}: {
  startButton: React.JSX.Element | null
}): React.JSX.Element {
  return (
    <div className="flex flex-col items-start gap-1 py-6">
      <p className="text-sm font-medium text-foreground">No discussions yet</p>
      <p className="max-w-prose text-xs text-muted-foreground">{WHAT_A_DISCUSSION_IS}</p>
      {startButton !== null ? <div className="mt-2">{startButton}</div> : null}
    </div>
  )
}

function NoMatch({
  text,
  startButton,
}: {
  text: string
  startButton: React.JSX.Element | null
}): React.JSX.Element {
  return (
    <div className="flex flex-col items-start gap-2 py-6">
      <p className="text-xs text-muted-foreground">{text}</p>
      {startButton}
    </div>
  )
}

/** The Open list is empty: say "No discussions yet" only if All is empty too. */
function NothingOpen({
  folderId,
  startButton,
}: {
  folderId: string
  startButton: React.JSX.Element | null
}): React.JSX.Element {
  const all = useDiscussions(folderId, 'all', '')
  if (all.isPending) return <ListSkeleton />
  const any = (all.data?.pages[0]?.discussions.length ?? 0) > 0
  if (all.isError || any) return <NoMatch text="No open discussions." startButton={startButton} />
  return <NoDiscussionsYet startButton={startButton} />
}
