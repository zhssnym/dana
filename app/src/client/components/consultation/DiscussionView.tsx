/*
One thread (W-C; #212, #320; r4, r5): one quiet line on top — the title, a
"Closed" label only when it applies, and a "…" menu for the rare acts
(Rename, Close thread…, Move to Trash) — then the posts, then the reply
composer. The top bar's breadcrumb leads back to the list, so the thread
draws no back button of its own.

"Close thread…" puts one optional line, "What was decided?", where the
composer was, which is where the decision will show: empty closes the thread
without a decision (Wave 2 decision 3). A closed or trashed thread takes no
writes (the server answers 409 `discussion_frozen`), so its composer becomes
one short note — who closed it, when, the decision if any, and the one
Reopen. Move to Trash asks nothing: the thread goes back to the list at once
and the undo bar brings it back (Trash keeps it besides).

Near-live: the posts re-read every few seconds and the thread's own row every
fifteen (`api/consultation.ts`). Reading is the server's: opening the thread,
and every new post seen while it is on screen, marks it read for this person
on every device, and clears its post notifications. It opens at the first
post from someone else since the last read, else at the end.

Which acts are drawn is `discussionPowers`; none of it is authorization. The
General discussion is the folder's own conversation, so it is never offered
Move to Trash here (the route still decides).
*/
import { useEffect, useMemo, useState } from 'react'

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
import { folderGates } from '../../lib/folder-authority.js'
import { MoreHorizontal } from '../../lib/icons.js'
import type { PersonResolver, ThreadAuthority } from '../../lib/thread.js'
import { formatAgo } from '../../parts/format-dates.js'
import { pushUndo, undoLabel } from '../../shell/undo.js'
import { DISCUSSION_TITLE_MAX, OUTCOME_STATEMENT_MAX } from '../../../shared/consultation.js'
import type { Discussion } from '../../../shared/consultation.js'
import { InlineError, SkeletonList } from '../state-patterns.js'
import { ThreadPosts } from '../thread/ThreadPosts.js'
import { Button } from '../ui/button.js'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu.js'
import { Input } from '../ui/input.js'
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

  const now = Date.now()
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

  const closedNote = (
    <p className="text-sm text-muted-foreground">
      {trashed
        ? 'This thread is in Trash.'
        : `Closed${closedBy !== null ? ` by ${personOf(closedBy).name}` : ''}${closedAt !== null ? ` ${formatAgo(closedAt, now)}` : ''}`}
      {!trashed && outcome !== null && outcome.statement !== '' ? (
        <span className="text-foreground"> — {outcome.statement}</span>
      ) : null}
      {powers.reopen && !trashed ? (
        <>
          {' · '}
          <button
            type="button"
            className="rounded-sm text-sm text-muted-foreground underline-offset-2 outline-none hover:text-foreground hover:underline"
            disabled={reopen.isPending}
            onClick={() => { reopen.mutate(d.id) }}
          >
            Reopen
          </button>
        </>
      ) : null}
    </p>
  )

  return (
    <div className="min-w-0 space-y-4">
      <header className="flex min-h-[var(--control-height)] min-w-0 items-center gap-2">
        {renaming ? (
          <Rename discussion={d} onDone={() => { setRenaming(false) }} />
        ) : (
          <h2 className="min-w-0 truncate text-base font-title break-words text-foreground">{d.title}</h2>
        )}
        {trashed || d.state === 'resolved' ? (
          <span className="shrink-0 text-xs text-muted-foreground">{trashed ? 'In Trash' : 'Closed'}</span>
        ) : null}
        {(powers.edit && !frozen) || resolvable || trashable ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  aria-label="Thread actions"
                  className="ml-auto flex size-[var(--control-height)] shrink-0 items-center justify-center rounded-sm text-muted-foreground outline-none hover:bg-accent hover:text-foreground"
                />
              }
            >
              <MoreHorizontal className="size-4" strokeWidth={1.75} aria-hidden="true" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {powers.edit && !frozen ? (
                <DropdownMenuItem onClick={() => { setRenaming(true) }}>Rename</DropdownMenuItem>
              ) : null}
              {resolvable ? (
                <DropdownMenuItem onClick={() => { setClosing(true) }}>Close thread…</DropdownMenuItem>
              ) : null}
              {trashable ? (
                <DropdownMenuItem variant="destructive" onClick={moveToTrash}>
                  Move to Trash
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </header>
      {d.context !== null && d.context !== '' ? (
        <p className="-mt-2 text-sm break-words whitespace-pre-wrap text-muted-foreground">{d.context}</p>
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
      className="min-w-0 flex-1 bg-transparent text-base font-title text-foreground outline-none"
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

/** "Close thread…": one optional line in the composer's place, then Enter. Escape leaves it open. */
function CloseThread({ discussion: d, onDone }: { readonly discussion: Discussion; readonly onDone: () => void }): React.JSX.Element {
  const resolve = useResolveDiscussion()
  const [statement, setStatement] = useState('')
  return (
    <form
      className="flex min-w-0 items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        const decided = statement.trim()
        resolve.mutate({ id: d.id, body: decided === '' ? {} : { statement: decided } }, { onSuccess: onDone })
      }}
    >
      <Input
        aria-label="What was decided?"
        placeholder="What was decided? (optional)"
        autoFocus
        value={statement}
        maxLength={OUTCOME_STATEMENT_MAX}
        className="min-w-0 flex-1 text-sm md:text-sm"
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
      <Button type="submit" disabled={resolve.isPending}>
        Close thread
      </Button>
    </form>
  )
}
