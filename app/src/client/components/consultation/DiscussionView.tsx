/*
One thread, as its own page (W-C; #212, #320; r4, r9). The top bar's
breadcrumb names it and its page crumb returns to the list, and the page's
own head and tabs step aside. Its head is the page head's: the status (an
outline bubble while open, the accent check once resolved) and the 28px
title on the left; "Resolve" or "Reopen" and the "…" menu (Rename, Move to
Trash) on the right. It says nothing the posts already show.

The thread fills the window: the posts sit at the bottom just above the
composer, the history scrolls in its own region, and the composer stays at
the window's foot. "Resolve" puts one optional line, "What was decided?",
where the composer was (empty resolves without a decision, Wave 2 decision
3). A resolved or trashed thread takes no writes (the server answers 409
`discussion_frozen`), so its composer becomes one quiet line: "Resolved
<date> by <name>.", the decision if any, and Reopen. Move to Trash asks
nothing: the thread goes back to the list at once and the undo bar brings it
back. Server state names are unchanged (`resolved`).

Near-live: the posts re-read every few seconds and the thread's own row every
fifteen (`api/consultation.ts`). Opening the thread, and every new post seen
while it is on screen, marks it read for this person on every device. It
opens at the first post from someone else since the last read, else at the
end.

Which acts are drawn is `discussionPowers`; none of it is authorization. The
General discussion is never offered Move to Trash here (the route decides).
*/
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import {
  useDiscussionThread,
  useMarkDiscussionRead,
  useOpenDiscussion,
  usePostDiscussionComment,
  useReopenDiscussion,
  useResolveDiscussion,
  useRestoreDiscussion,
  useTrashFromThread,
  useUpdateDiscussion,
} from '../../api/consultation.js'
import { ApiError } from '../../api/http.js'
import { formatDate } from '../../lib/dates.js'
import { folderGates } from '../../lib/folder-authority.js'
import { MoreHorizontal } from '../../lib/icons.js'
import type { PersonResolver, ThreadAuthority } from '../../lib/thread.js'
import { pushUndo, undoLabel } from '../../shell/undo.js'
import { DISCUSSION_TITLE_MAX, OUTCOME_STATEMENT_MAX } from '../../../shared/consultation.js'
import type { Discussion } from '../../../shared/consultation.js'
import { InlineError, SkeletonList } from '../state-patterns.js'
import { localDay } from '../thread/grouping.js'
import { ThreadPosts } from '../thread/ThreadPosts.js'
import { Button } from '../ui/button.js'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu.js'
import type { ConsultationViewer } from './authority.js'
import { discussionPowers } from './authority.js'

const NO_POWERS = { edit: false, resolve: false, reopen: false, trash: false, comment: false } as const
export function DiscussionView(props: {
  readonly discussionId: string
  readonly folderId: string
  readonly viewer: ConsultationViewer | null
  readonly personOf: PersonResolver
  readonly justStarted: boolean
  readonly onBack: () => void
}): React.JSX.Element {
  const { discussionId } = props
  const discussion = useOpenDiscussion(discussionId)

  if (discussion.isPending) {
    return (
      <SkeletonList />
    )
  }
  if (discussion.isError) {
    const gone = discussion.error instanceof ApiError && discussion.error.status === 404
    return (
      gone ? (
        <p className="text-sm text-muted-foreground">This thread is in Trash or no longer exists.</p>
      ) : (
        <InlineError onRetry={() => void discussion.refetch()} />
      )
    )
  }
  return <ThreadBody {...props} discussion={discussion.data} onRefused={() => void discussion.refetch()} />
}

function ThreadBody(props: {
  readonly discussion: Discussion
  readonly folderId: string
  readonly viewer: ConsultationViewer | null
  readonly personOf: PersonResolver
  readonly justStarted: boolean
  readonly onBack: () => void
  /* A write the server refused (403, or 409 frozen): the thread changed
     under us, so read it again. */
  readonly onRefused: () => void
}): React.JSX.Element {
  const { discussion: d, folderId, viewer, personOf, justStarted, onBack, onRefused } = props
  const thread = useDiscussionThread(d.id)
  const reopen = useReopenDiscussion()
  const trash = useTrashFromThread()
  const restore = useRestoreDiscussion()
  const postComment = usePostDiscussionComment()
  const markRead = useMarkDiscussionRead()
  const [closing, setClosing] = useState(false)
  const [box, height] = useFillHeight()
  const [renaming, setRenaming] = useState(false)
  /* Where the reading starts: the last read as it stood when the thread
     opened, before this visit marks it. */
  const [openAt] = useState<string | null>(() => d.read_at ?? null)

  const comments = thread.data?.comments
  const newest = comments?.reduce<string>((latest, c) => (c.created_at > latest ? c.created_at : latest), '') ?? null
  /* Read on open, and again for every new post seen while the thread is on
     screen; a post that arrives in a hidden tab is read when it is shown. */
  useEffect(() => {
    if (newest === null) return
    const mark = (): void => {
      if (document.visibilityState === 'visible') markRead(d.id)
    }
    mark()
    document.addEventListener('visibilitychange', mark)
    return () => { document.removeEventListener('visibilitychange', mark) }
  }, [d.id, newest, markRead])

  /* Unshared: every post is the creator's and it has never been decided.
     Unknown (still loading) counts as shared, the safe direction. */
  const unshared =
    comments !== undefined && comments.every((c) => c.author_id === d.created_by) && d.current_outcome_id === null
  const powers = viewer === null ? NO_POWERS : discussionPowers(viewer, d, unshared)
  const frozen = d.state === 'resolved' || d.trashed_at !== null

  const gates = viewer === null ? null : folderGates(viewer.facts)
  const live = gates !== null && !frozen
  const may: ThreadAuthority = useMemo(
    () => ({
      moderate: live && gates.moderate,
      mutateOwnComment: live && gates.mutateOwnComment,
      likeComment: live && gates.likeComment,
      createComment: live && gates.createComment,
    }),
    [live, gates?.moderate, gates?.mutateOwnComment, gates?.likeComment, gates?.createComment],
  )

  const outcome = d.state === 'resolved' ? d.current_outcome : null
  const closedBy = outcome?.actor_id ?? d.resolved_by
  const closedAt = outcome?.created_at ?? d.resolved_at
  const trashed = d.trashed_at !== null
  const trashable = powers.trash && !d.is_general
  const resolvable = powers.resolve && d.state === 'open' && !trashed

  const refused = (error: unknown): void => {
    if (error instanceof ApiError && (error.status === 403 || error.status === 409)) onRefused()
  }

  const moveToTrash = (): void => {
    /* Back to the list first, so nothing on screen reads the thread it just
       sent away; the undo bar restores it. */
    onBack()
    trash(d.id)
    pushUndo(undoLabel('Moved to Trash', d.title), () => { restore.mutate(d.id) })
  }

  const today = localDay(new Date().toISOString())
  /* Resolved: one quiet line where the composer was, with the one Reopen. */
  const closedNote = (
    <p className="py-2 text-sm text-muted-foreground">
      {trashed
        ? 'This thread is in Trash.'
        : `Resolved${closedAt !== null ? ` ${formatDate(localDay(closedAt), today)}` : ''}${closedBy !== null ? ` by ${personOf(closedBy).name}` : ''}`}
      {!trashed && outcome !== null && outcome.statement !== '' ? (
        <>{': '}<span className="text-foreground">{outcome.statement}</span></>
      ) : null}
      {powers.reopen && !trashed ? (
        <>
          {' · '}
          <button
            type="button"
            className="rounded-sm text-sm text-foreground underline-offset-2 outline-none hover:underline"
            disabled={reopen.isPending}
            onClick={() => { reopen.mutate(d.id) }}
          >
            Reopen
          </button>
        </>
      ) : null}
    </p>
  )

  const resolved = d.state === 'resolved'
  const hasMenu = (powers.edit && !frozen) || trashable
  return (
    <div ref={box} className="flex min-w-0 flex-col" style={height === null ? undefined : { height }}>
      {/* The page head's geometry: the status where a page's mark sits, the
          28px title beside it, the acts on the right. */}
      <header className="flex min-w-0 shrink-0 items-center gap-1 pt-4 max-md:pt-2">
        <span role="img" aria-label={trashed ? 'In Trash' : resolved ? 'Resolved' : 'Open'} className="flex size-8 shrink-0 items-center justify-center">
          {resolved ? <ResolvedMark /> : <OpenMark />}
        </span>
        {renaming ? (
          <Rename discussion={d} onDone={() => { setRenaming(false) }} />
        ) : (
          <h1 className="min-w-0 flex-1 truncate text-[length:var(--text-title-size)] leading-8 font-semibold text-foreground max-md:line-clamp-2 max-md:whitespace-normal">{d.title}</h1>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {resolvable && !closing ? (
            <Button type="button" variant="ghost" onClick={() => { setClosing(true) }}>Resolve</Button>
          ) : null}
          {resolved && powers.reopen && !trashed ? (
            <Button type="button" variant="ghost" disabled={reopen.isPending} onClick={() => { reopen.mutate(d.id) }}>Reopen</Button>
          ) : null}
          {hasMenu ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <button
                    type="button"
                    aria-label="Thread actions"
                    className="flex size-[var(--control-height)] shrink-0 items-center justify-center rounded-sm text-muted-foreground outline-none hover:bg-accent hover:text-foreground"
                  />
                }
              >
                <MoreHorizontal className="size-4" strokeWidth={1.75} aria-hidden="true" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {powers.edit && !frozen ? (
                  <DropdownMenuItem onClick={() => { setRenaming(true) }}>Rename</DropdownMenuItem>
                ) : null}
                {trashable ? (
                  <DropdownMenuItem variant="destructive" onClick={moveToTrash}>
                    Move to Trash
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </header>
      {d.context !== null && d.context !== '' ? (
        <p className="mt-2 shrink-0 pl-9 text-sm break-words whitespace-pre-wrap text-muted-foreground">{d.context}</p>
      ) : null}

      <ThreadPosts
        folderId={folderId}
        comments={comments}
        loading={thread.isPending}
        failed={thread.isError}
        onRetry={() => void thread.refetch()}
        viewerId={viewer?.viewerId ?? null}
        personOf={personOf}
        may={may}
        autoFocus={justStarted}
        openAt={justStarted ? undefined : openAt}
        onRefused={refused}
        post={(body) => postComment.mutateAsync({ discussionId: d.id, body })}
        {...(frozen
          ? { closed: closedNote }
          : closing
            ? { closed: <CloseThread discussion={d} onDone={() => { setClosing(false) }} /> }
            : {})}
      />
    </div>
  )
}

/** An open thread: an outline speech bubble. */
function OpenMark(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" className="size-6 text-muted-foreground" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
    </svg>
  )
}

/** A resolved thread: a filled accent circle with a check. */
function ResolvedMark(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" className="size-6" aria-hidden="true">
      <circle cx="12" cy="12" r="10" className="fill-primary" />
      <path d="m8 12 3 3 5-6" fill="none" className="stroke-primary-foreground" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** The thread fills the window below where it starts, so its history
 * scrolls in its own region and the composer sits at the window's foot. */
function useFillHeight(): [React.RefObject<HTMLDivElement | null>, number | null] {
  const box = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState<number | null>(null)
  useLayoutEffect(() => {
    const el = box.current
    const scroller = el?.closest<HTMLElement>('[data-shell-scroll]')
    if (!el || !scroller) return
    const measure = (): void => {
      const content = scroller.firstElementChild
      const pad = content === null ? 0 : parseFloat(getComputedStyle(content).paddingBottom) || 0
      const top = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop
      setHeight(Math.max(240, Math.floor(scroller.clientHeight - top - pad)))
    }
    measure()
    const watch = new ResizeObserver(measure)
    watch.observe(scroller)
    return () => { watch.disconnect() }
  }, [])
  return [box, height]
}

/** Rename, from the "…" menu: the title becomes its field; Enter saves, Escape leaves. */
function Rename({ discussion: d, onDone }: { readonly discussion: Discussion; readonly onDone: () => void }): React.JSX.Element {
  const update = useUpdateDiscussion()
  const [draft, setDraft] = useState(d.title)
  const save = (): void => {
    const title = draft.trim()
    if (title === '' || title === d.title) {
      onDone()
      return
    }
    update.mutate({ id: d.id, body: { title } }, { onSettled: onDone })
  }
  return (
    <input
      aria-label="Thread title"
      autoFocus
      value={draft}
      maxLength={DISCUSSION_TITLE_MAX}
      disabled={update.isPending}
      className="min-w-0 flex-1 bg-transparent text-[length:var(--text-title-size)] leading-8 font-semibold text-foreground outline-none"
      onFocus={(event) => { event.currentTarget.select() }}
      onChange={(event) => { setDraft(event.target.value) }}
      onBlur={save}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          save()
        } else if (event.key === 'Escape') {
          event.preventDefault()
          onDone()
        }
      }}
    />
  )
}

/** "Resolve": one optional line in the composer's place and in its
 * frame (the same 40px box, the act inline where Send was), then Enter.
 * Escape or Cancel leaves it open. */
function CloseThread({ discussion: d, onDone }: { readonly discussion: Discussion; readonly onDone: () => void }): React.JSX.Element {
  const resolve = useResolveDiscussion()
  const [statement, setStatement] = useState('')
  return (
    <form
      className="flex min-h-10 min-w-0 items-center gap-1 rounded-lg border border-border bg-background pr-1 pl-3 focus-within:border-ring"
      onSubmit={(event) => {
        event.preventDefault()
        const decided = statement.trim()
        resolve.mutate({ id: d.id, body: decided === '' ? {} : { statement: decided } }, { onSuccess: onDone })
      }}
    >
      <input
        aria-label="What was decided?"
        placeholder="What was decided? (optional)"
        autoFocus
        value={statement}
        maxLength={OUTCOME_STATEMENT_MAX}
        className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
        onChange={(event) => { setStatement(event.target.value) }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            onDone()
          }
        }}
      />
      <Button type="button" variant="ghost" onClick={onDone}>
        Cancel
      </Button>
      <Button type="submit" variant="ghost" disabled={resolve.isPending}>
        Resolve
      </Button>
    </form>
  )
}
