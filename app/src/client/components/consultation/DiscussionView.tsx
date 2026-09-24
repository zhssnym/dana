/*
One thread (W-C; #212, #320): its title, its posts, and the reply composer
always at the bottom.

"Close thread" asks one optional line, "What was decided?": empty closes the
thread without a decision (Wave 2 decision 3), words record it, and the
decision sits under the header as "Decided", with who and when. A closed or
trashed thread takes no writes (the server answers 409 `discussion_frozen`),
so its composer becomes a quiet "Closed by X · when · Reopen" line and no post
offers anything.

Which acts are drawn is `discussionPowers`; none of it is authorization. The
General discussion is the folder's own conversation, so it is never offered
Move to Trash here (the route still decides).
*/
import { useMemo, useState } from 'react'

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
import { folderGates } from '../../lib/folder-authority.js'
import { ArrowLeft, MoreHorizontal } from '../../lib/icons.js'
import type { PersonResolver, ThreadAuthority } from '../../lib/thread.js'
import { formatAgo } from '../../parts/format-dates.js'
import { DISCUSSION_TITLE_MAX, OUTCOME_STATEMENT_MAX } from '../../../shared/consultation.js'
import type { Discussion } from '../../../shared/consultation.js'
import { InlineError, SkeletonList } from '../state-patterns.js'
import { ThreadPosts } from '../thread/ThreadPosts.js'
import { Button } from '../ui/button.js'
import { ConfirmDialog } from '../ui/ConfirmDialog.js'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu.js'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover.js'
import type { ConsultationViewer } from './authority.js'
import { discussionPowers } from './authority.js'

const NO_POWERS = { edit: false, resolve: false, reopen: false, trash: false, comment: false } as const
const QUIET =
  'rounded-sm text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring'

function BackButton({ onBack }: { readonly onBack: () => void }): React.JSX.Element {
  return (
    <button type="button" onClick={onBack} className={`${QUIET} inline-flex items-center gap-1`}>
      <ArrowLeft className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
      Threads
    </button>
  )
}

export function DiscussionView(props: {
  readonly discussionId: string
  readonly folderId: string
  readonly viewer: ConsultationViewer | null
  readonly personOf: PersonResolver
  readonly justStarted: boolean
  readonly onBack: () => void
}): React.JSX.Element {
  const { discussionId, onBack } = props
  const discussion = useDiscussion(discussionId)

  if (discussion.isPending) {
    return (
      <div className="space-y-3">
        <BackButton onBack={onBack} />
        <SkeletonList />
      </div>
    )
  }
  if (discussion.isError) {
    const gone = discussion.error instanceof ApiError && discussion.error.status === 404
    return (
      <div className="space-y-3">
        <BackButton onBack={onBack} />
        {gone ? (
          <p className="text-sm text-muted-foreground">This thread is in Trash or no longer exists.</p>
        ) : (
          <InlineError onRetry={() => void discussion.refetch()} />
        )}
      </div>
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
      <BackButton onBack={onBack} />

      <header className="space-y-1">
        <div className="flex min-w-0 items-start gap-2">
          <Title discussion={d} editable={powers.edit} />
          {powers.resolve || trashable ? (
            <div className="ml-auto flex shrink-0 items-center gap-1">
              {powers.resolve ? <CloseThread discussion={d} /> : null}
              {trashable ? (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <button
                        type="button"
                        aria-label="Thread actions"
                        className="flex size-7 items-center justify-center rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                      />
                    }
                  >
                    <MoreHorizontal className="size-4" strokeWidth={1.75} aria-hidden="true" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem variant="destructive" onClick={() => { setConfirmTrash(true) }}>
                      Move to Trash
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </div>
          ) : null}
        </div>
        {/* Inline flow, not a wrapping flex row: on a phone the words wrap
            after the pill instead of the pill sitting alone on its line. */}
        <p className="min-w-0 text-sm text-muted-foreground">
          <StatePill trashed={trashed} closed={d.state === 'resolved'} />
          <span>
            {d.is_general
              ? 'This page’s own conversation'
              : `${personOf(d.created_by).name} started this ${formatAgo(d.created_at, now)}`}
            {comments !== undefined ? ` · ${String(comments.length)} ${comments.length === 1 ? 'post' : 'posts'}` : ''}
          </span>
        </p>
        {d.context !== null && d.context !== '' ? (
          <p className="pt-1 text-sm break-words whitespace-pre-wrap text-muted-foreground">{d.context}</p>
        ) : null}
      </header>

      {outcome !== null ? (
        <section aria-label="Decision" className="space-y-0.5 border-l-2 border-success-600 pl-3">
          <p className="text-xs font-medium text-muted-foreground">Decided</p>
          <p className="text-sm break-words whitespace-pre-wrap text-foreground">{outcome.statement}</p>
          <p className="text-xs text-muted-foreground">
            {personOf(outcome.actor_id).name} · {formatAgo(outcome.created_at, now)}
          </p>
        </section>
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
        onRefused={refused}
        post={(body) => postComment.mutateAsync({ discussionId: d.id, body })}
        {...(frozen
          ? {
              closed: (
                <p className="border-t border-border pt-3 text-sm text-muted-foreground">
                  {trashed
                    ? 'In Trash'
                    : `Closed${closedBy !== null ? ` by ${personOf(closedBy).name}` : ''}${closedAt !== null ? ` · ${formatAgo(closedAt, now)}` : ''}`}
                  {powers.reopen ? (
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

/** Open, Closed or In Trash, as GitHub marks an issue. */
function StatePill({ trashed, closed }: { readonly trashed: boolean; readonly closed: boolean }): React.JSX.Element {
  const tone = trashed || closed ? 'bg-muted text-muted-foreground' : 'bg-success-100 text-success-700'
  return (
    <span className={`mr-2 inline-block rounded-full px-2 align-middle text-xs font-medium whitespace-nowrap ${tone}`}>
      {trashed ? 'In Trash' : closed ? 'Closed' : 'Open'}
    </span>
  )
}

/** The title; those who may edit it click it to rename (Enter saves, Escape leaves). */
function Title({ discussion: d, editable }: { readonly discussion: Discussion; readonly editable: boolean }): React.JSX.Element {
  const update = useUpdateDiscussion()
  const [draft, setDraft] = useState<string | null>(null)
  const heading = 'min-w-0 flex-1 text-xl font-semibold break-words text-foreground'

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
      className="min-w-0 flex-1 rounded-sm bg-transparent text-xl font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
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

/** "Close thread": one optional line, then Close. */
function CloseThread({ discussion: d }: { readonly discussion: Discussion }): React.JSX.Element {
  const resolve = useResolveDiscussion()
  const [open, setOpen] = useState(false)
  const [statement, setStatement] = useState('')
  const close = (): void => {
    const decided = statement.trim()
    resolve.mutate(
      { id: d.id, body: decided === '' ? {} : { statement: decided } },
      {
        onSuccess: () => {
          setOpen(false)
          setStatement('')
        },
      },
    )
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button type="button" variant="ghost" size="sm" className="text-muted-foreground" />}>
        Close thread
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-2 p-3">
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault()
            close()
          }}
        >
          <input
            aria-label="What was decided?"
            placeholder="What was decided? (optional)"
            autoFocus
            value={statement}
            maxLength={OUTCOME_STATEMENT_MAX}
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring"
            onChange={(event) => { setStatement(event.target.value) }}
          />
          <div className="flex justify-end">
            <Button type="submit" variant="commit" size="sm" disabled={resolve.isPending}>
              Close
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  )
}
