/*
One thread (W-C; #212, #320; r4): one quiet line on top — the title, a
"Closed" label only when it applies, and a "…" menu for the rare acts — then
the posts, then the reply composer. The top bar's breadcrumb leads back to
the list, so the thread draws no back button of its own.

"Close thread…" asks one optional line, "What was decided?": empty closes the
thread without a decision (Wave 2 decision 3). A closed or trashed thread
takes no writes (the server answers 409 `discussion_frozen`), so its composer
becomes one short note — who closed it, when, the decision if any, Reopen.

Which acts are drawn is `discussionPowers`; none of it is authorization. The
General discussion is the folder's own conversation, so it is never offered
Move to Trash here (the route still decides).
*/
import { useEffect, useMemo, useState } from 'react'

import {
  useDiscussionThread,
  usePostDiscussionComment,
  useReopenDiscussion,
  useResolveDiscussion,
  useTrashDiscussion,
  useUpdateDiscussion,
} from '../../api/consultation.js'
import { ApiError } from '../../api/http.js'
import { useDiscussion } from '../../api/queries.js'
import { markDiscussionSeen } from '../../lib/discussion-seen.js'
import { folderGates } from '../../lib/folder-authority.js'
import { MoreHorizontal } from '../../lib/icons.js'
import type { PersonResolver, ThreadAuthority } from '../../lib/thread.js'
import { formatAgo } from '../../parts/format-dates.js'
import { DISCUSSION_TITLE_MAX, OUTCOME_STATEMENT_MAX } from '../../../shared/consultation.js'
import type { Discussion } from '../../../shared/consultation.js'
import { InlineError, SkeletonList } from '../state-patterns.js'
import { ThreadPosts } from '../thread/ThreadPosts.js'
import { Button } from '../ui/button.js'
import { ConfirmDialog } from '../ui/ConfirmDialog.js'
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
  const discussion = useDiscussion(discussionId)

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
  const trash = useTrashDiscussion()
  const postComment = usePostDiscussionComment()
  const [confirmTrash, setConfirmTrash] = useState(false)
  const [closing, setClosing] = useState(false)
  useEffect(() => { markDiscussionSeen(d.id) }, [d.id, d.last_activity_at])

  const comments = thread.data?.comments
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

  const refused = (error: unknown): void => {
    if (error instanceof ApiError && (error.status === 403 || error.status === 409)) onRefused()
  }

  return (
    <div className="min-w-0 space-y-4">
      <header className="flex min-w-0 items-center gap-2">
        <Title discussion={d} editable={powers.edit} />
        {trashed || d.state === 'resolved' ? (
          <span className="shrink-0 text-xs text-muted-foreground">{trashed ? 'In Trash' : 'Closed'}</span>
        ) : null}
        {powers.resolve || (powers.reopen && d.state === 'resolved') || trashable ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  aria-label="Thread actions"
                  className="ml-auto flex size-7 shrink-0 items-center justify-center rounded-sm text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                />
              }
            >
              <MoreHorizontal className="size-4" strokeWidth={1.75} aria-hidden="true" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {powers.resolve ? (
                <DropdownMenuItem onClick={() => { setClosing(true) }}>Close thread…</DropdownMenuItem>
              ) : null}
              {powers.reopen && d.state === 'resolved' ? (
                <DropdownMenuItem disabled={reopen.isPending} onClick={() => { reopen.mutate(d.id) }}>
                  Reopen thread
                </DropdownMenuItem>
              ) : null}
              {trashable ? (
                <DropdownMenuItem variant="destructive" onClick={() => { setConfirmTrash(true) }}>
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
      {closing ? <CloseThread discussion={d} onDone={() => { setClosing(false) }} /> : null}

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
        onRefused={refused}
        post={(body) => postComment.mutateAsync({ discussionId: d.id, body })}
        {...(frozen
          ? {
              closed: (
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
                        className="rounded-sm text-sm text-muted-foreground underline-offset-2 outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                        disabled={reopen.isPending}
                        onClick={() => { reopen.mutate(d.id) }}
                      >
                        Reopen
                      </button>
                    </>
                  ) : null}
                </p>
              ),
            }
          : {})}
      />

      {confirmTrash ? (
        <ConfirmDialog
          message="Move this thread to Trash? It can be restored from Trash."
          confirmLabel="Move to Trash"
          cancelLabel="Keep it"
          onCancel={() => { setConfirmTrash(false) }}
          onContinue={() => {
            setConfirmTrash(false)
            trash.mutate(d.id, { onSuccess: () => { onBack() } })
          }}
        />
      ) : null}
    </div>
  )
}

/** The title; those who may edit it click it to rename (Enter saves, Escape leaves). */
function Title({ discussion: d, editable }: { readonly discussion: Discussion; readonly editable: boolean }): React.JSX.Element {
  const update = useUpdateDiscussion()
  const [draft, setDraft] = useState<string | null>(null)
  const heading = 'min-w-0 truncate text-base font-semibold break-words text-foreground'

  if (draft === null) {
    return editable ? (
      <h2 className={heading}>
        <button
          type="button"
          title="Rename"
          className="rounded-sm text-left outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => { setDraft(d.title) }}
        >
          {d.title}
        </button>
      </h2>
    ) : (
      <h2 className={heading}>{d.title}</h2>
    )
  }

  const save = (): void => {
    const title = draft.trim()
    if (title === '' || title === d.title) {
      setDraft(null)
      return
    }
    update.mutate({ id: d.id, body: { title } }, { onSettled: () => { setDraft(null) } })
  }
  return (
    <input
      aria-label="Thread title"
      autoFocus
      value={draft}
      maxLength={DISCUSSION_TITLE_MAX}
      disabled={update.isPending}
      className="min-w-0 flex-1 rounded-sm bg-transparent text-base font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onChange={(event) => { setDraft(event.target.value) }}
      onBlur={save}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          save()
        } else if (event.key === 'Escape') {
          event.preventDefault()
          setDraft(null)
        }
      }}
    />
  )
}

/** "Close thread…": one optional line under the title, then Enter. Escape leaves it open. */
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
      <input
        aria-label="What was decided?"
        placeholder="What was decided? (optional)"
        autoFocus
        value={statement}
        maxLength={OUTCOME_STATEMENT_MAX}
        className="h-7 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring"
        onChange={(event) => { setStatement(event.target.value) }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            onDone()
          }
        }}
      />
      <Button type="button" variant="ghost" size="sm" onClick={onDone}>
        Cancel
      </Button>
      <Button type="submit" variant="outline" size="sm" disabled={resolve.isPending}>
        Close thread
      </Button>
    </form>
  )
}
