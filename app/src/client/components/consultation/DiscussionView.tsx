/*
One Discussion (#212, #320): its title and context, its Outcome when resolved,
its structured-input rounds, and its conversation, with the acts this viewer
may take on it.

The conversation is the Folder page's thread exactly (useConceptThread +
applyThreadChange + CommentsThread), read from and posted to the Discussion's
own routes. A resolved or trashed Discussion's thread is frozen: the server
refuses writes with 409 `discussion_frozen`, and this view draws it read-only
so nobody is offered a control that would be refused.

Which acts are drawn is `discussionPowers`; none of it is authorization.
*/
import { useMemo, useState } from 'react'
import { ArrowLeft, CheckCircle2, Lock } from 'lucide-react'

import {
  useDiscussionOutcomes,
  useDiscussionThread,
  usePostDiscussionComment,
  useReopenDiscussion,
  useTrashDiscussion,
  useUpdateDiscussion,
} from '../../api/consultation.js'
import { ApiError, uploadFile } from '../../api/http.js'
import { useDeleteComment, usePatchComment, useSetCommentLike } from '../../api/mutations.js'
import { useDiscussion } from '../../api/queries.js'
import { folderGates } from '../../lib/folder-authority.js'
import { applyThreadChange, commentFileKind, useConceptThread } from '../../lib/thread.js'
import type { PersonResolver, ThreadAuthority } from '../../lib/thread.js'
import { formatAgo } from '../../parts/format-dates.js'
import {
  DISCUSSION_CONTEXT_MAX,
  DISCUSSION_TITLE_MAX,
} from '../../../shared/consultation.js'
import type { Discussion, UpdateDiscussionBody } from '../../../shared/consultation.js'
import { CommentsThread } from '../comments.js'
import { InlineError, SkeletonList } from '../state-patterns.js'
import { Badge } from '../ui/badge.js'
import { Button } from '../ui/button.js'
import { ConfirmDialog } from '../ui/ConfirmDialog.js'
import { Input } from '../ui/input.js'
import { Textarea } from '../ui/textarea.js'
import type { ConsultationViewer } from './authority.js'
import { discussionPowers } from './authority.js'
import { InputRoundsPanel } from './InputRoundsPanel.js'
import { OutcomeHistory } from './OutcomeHistory.js'
import { ResolveDiscussionDialog } from './ResolveDiscussionDialog.js'

const NO_POWERS = {
  edit: false,
  resolve: false,
  reopen: false,
  trash: false,
  comment: false,
  openRound: false,
} as const

function BackButton({ onBack }: { onBack: () => void }): React.JSX.Element {
  return (
    <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2">
      <ArrowLeft data-icon="inline-start" strokeWidth={1.75} aria-hidden="true" />
      Back to discussions
    </Button>
  )
}

export function DiscussionView(props: {
  discussionId: string
  folderId: string
  viewer: ConsultationViewer | null
  personOf: PersonResolver
  focusOutcomeId: string | null
  onBack: () => void
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
          <p className="rounded-lg border border-border bg-card p-4 text-sm text-[var(--color-graphite-600)]">
            This discussion is in Trash or no longer exists.
          </p>
        ) : (
          <InlineError onRetry={() => void discussion.refetch()} />
        )}
      </div>
    )
  }
  return <DiscussionBody {...props} discussion={discussion.data} />
}

function DiscussionBody(props: {
  discussion: Discussion
  folderId: string
  viewer: ConsultationViewer | null
  personOf: PersonResolver
  focusOutcomeId: string | null
  onBack: () => void
}): React.JSX.Element {
  const { discussion: d, folderId, viewer, personOf, focusOutcomeId, onBack } = props
  const thread = useDiscussionThread(d.id)
  const outcomes = useDiscussionOutcomes(d.id)
  const update = useUpdateDiscussion()
  const reopen = useReopenDiscussion()
  const trash = useTrashDiscussion()
  const postComment = usePostDiscussionComment()
  const patchComment = usePatchComment()
  const deleteComment = useDeleteComment()
  const setLike = useSetCommentLike()

  const [editing, setEditing] = useState(false)
  const [draftTitle, setDraftTitle] = useState('')
  const [draftContext, setDraftContext] = useState('')
  const [resolving, setResolving] = useState(false)
  const [confirmTrash, setConfirmTrash] = useState(false)

  const comments = thread.data?.comments
  /* Unshared: every comment is the creator's and there has never been an
     Outcome. Unknown (still loading) counts as shared, the safe direction. */
  const unshared =
    comments !== undefined &&
    outcomes.data !== undefined &&
    comments.every((c) => c.author_id === d.created_by) &&
    outcomes.data.outcomes.length === 0
  const powers = viewer === null ? NO_POWERS : discussionPowers(viewer, d, unshared)
  const frozen = d.state === 'resolved' || d.trashed_at !== null

  const gates = viewer === null ? null : folderGates(viewer.facts)
  const live = gates !== null && !frozen
  const mayConverse: ThreadAuthority = useMemo(
    () => ({
      moderate: live && gates.moderate,
      mutateOwnComment: live && gates.mutateOwnComment,
      likeComment: live && gates.likeComment,
      createComment: live && gates.createComment,
    }),
    [live, gates?.moderate, gates?.mutateOwnComment, gates?.likeComment, gates?.createComment],
  )
  const conversation = useConceptThread(
    comments,
    viewer?.viewerId ?? null,
    personOf,
    mayConverse,
  )

  const now = Date.now()
  const outcome = d.current_outcome

  const startEdit = (): void => {
    setDraftTitle(d.title)
    setDraftContext(d.context ?? '')
    setEditing(true)
  }
  const saveEdit = (): void => {
    const title = draftTitle.trim()
    const context = draftContext.trim() === '' ? null : draftContext
    const body: UpdateDiscussionBody = {}
    if (title !== d.title) body.title = title
    if (context !== d.context) body.context = context
    if (body.title === undefined && body.context === undefined) {
      setEditing(false)
      return
    }
    update.mutate(
      { id: d.id, body },
      {
        onSuccess: () => {
          setEditing(false)
        },
      },
    )
  }
  const titleValid = draftTitle.trim().length > 0 && draftTitle.trim().length <= DISCUSSION_TITLE_MAX

  return (
    <div className="min-w-0 space-y-5">
      <BackButton onBack={onBack} />

      <header className="space-y-2">
        {editing ? (
          <form
            className="space-y-2"
            onSubmit={(event) => {
              event.preventDefault()
              if (titleValid) saveEdit()
            }}
          >
            <Input
              aria-label="Title"
              value={draftTitle}
              maxLength={DISCUSSION_TITLE_MAX}
              autoFocus
              onChange={(event) => {
                setDraftTitle(event.target.value)
              }}
            />
            <Textarea
              aria-label="Context"
              value={draftContext}
              maxLength={DISCUSSION_CONTEXT_MAX}
              rows={4}
              className="min-h-20"
              placeholder="Background, the question, what a good outcome looks like (optional)"
              onChange={(event) => {
                setDraftContext(event.target.value)
              }}
            />
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setEditing(false)
                }}
              >
                Cancel
              </Button>
              <Button type="submit" variant="commit" disabled={!titleValid || update.isPending}>
                Save
              </Button>
            </div>
          </form>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="min-w-0 text-lg font-semibold break-words text-[var(--color-graphite-900)]">
                {d.title}
              </h2>
              {d.is_general ? <Badge variant="outline">General discussion</Badge> : null}
              {d.trashed_at !== null ? (
                <Badge variant="destructive">In Trash</Badge>
              ) : d.state === 'resolved' ? (
                <Badge className="bg-[var(--color-success-100)] text-[var(--color-success-700)]">
                  Resolved
                </Badge>
              ) : (
                <Badge variant="secondary">Open</Badge>
              )}
            </div>
            {d.is_general ? (
              <p className="text-xs text-[var(--color-graphite-500)]">
                This holds the folder&apos;s own conversation.
              </p>
            ) : null}
            <p className="text-xs text-[var(--color-graphite-500)]">
              Started by {personOf(d.created_by).name} · {formatAgo(d.created_at, now)}
            </p>
            {d.context !== null && d.context !== '' ? (
              <p className="text-sm break-words whitespace-pre-wrap text-[var(--color-graphite-700)]">
                {d.context}
              </p>
            ) : null}
          </>
        )}

        {!editing && (powers.edit || powers.resolve || powers.reopen || powers.trash) ? (
          <div className="flex flex-wrap gap-2 pt-1">
            {powers.resolve ? (
              <Button
                variant="commit"
                size="sm"
                onClick={() => {
                  setResolving(true)
                }}
              >
                Resolve
              </Button>
            ) : null}
            {powers.reopen ? (
              <Button
                variant="outline"
                size="sm"
                disabled={reopen.isPending}
                onClick={() => {
                  reopen.mutate(d.id)
                }}
              >
                Reopen
              </Button>
            ) : null}
            {powers.edit ? (
              <Button variant="outline" size="sm" onClick={startEdit}>
                Edit
              </Button>
            ) : null}
            {powers.trash ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setConfirmTrash(true)
                }}
              >
                Move to Trash
              </Button>
            ) : null}
          </div>
        ) : null}
      </header>

      {d.state === 'resolved' && outcome !== null ? (
        <section
          aria-label="Outcome"
          className="rounded-lg border border-[var(--color-success-200)] bg-[var(--color-success-100)]/40 p-4"
        >
          <h3 className="mb-1 flex items-center gap-1.5 text-[13px] font-semibold text-[var(--color-success-700)]">
            <CheckCircle2 className="size-4" strokeWidth={1.75} aria-hidden="true" />
            Outcome
          </h3>
          <p className="text-sm break-words whitespace-pre-wrap text-[var(--color-graphite-900)]">
            {outcome.statement}
          </p>
          <p className="mt-2 text-xs text-[var(--color-graphite-600)]">
            Recorded by {personOf(outcome.actor_id).name} · {formatAgo(outcome.created_at, now)}
            {outcome.source_comment_id !== null ? ' · From a comment' : ''}
          </p>
        </section>
      ) : null}

      <OutcomeHistory discussionId={d.id} personOf={personOf} focusOutcomeId={focusOutcomeId} />

      <InputRoundsPanel discussionId={d.id} frozen={frozen} canOpen={powers.openRound} />

      <section aria-label="Conversation" className="space-y-2">
        {frozen ? (
          <p
            role="note"
            className="flex items-start gap-2 rounded-md border border-[var(--color-warning-200)] bg-[var(--color-warning-100)] px-3 py-2 text-xs text-[var(--color-warning-700)]"
          >
            <Lock className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
            {d.trashed_at !== null
              ? 'This discussion is in Trash, so its conversation is closed.'
              : `This discussion is resolved, so its conversation is closed.${
                  powers.reopen ? ' Reopen it to continue.' : ''
                }`}
          </p>
        ) : null}
        {thread.isError ? (
          <InlineError onRetry={() => void thread.refetch()} />
        ) : thread.isPending ? (
          <SkeletonList />
        ) : (
          <CommentsThread
            comments={conversation}
            canComment={mayConverse.createComment}
            closedReason={frozen ? 'This conversation is closed.' : undefined}
            onChange={(next) => {
              applyThreadChange(conversation, next, {
                post: (body) => {
                  postComment.mutate({ discussionId: d.id, body })
                },
                edit: (commentId, body) => {
                  patchComment.mutate({ id: commentId, body: { body } })
                },
                remove: (commentId) => {
                  deleteComment.mutate(commentId)
                },
                like: (commentId, liked) => {
                  setLike.mutate({ id: commentId, liked })
                },
                upload: (file) =>
                  uploadFile(commentFileKind(file), folderId, file).then((stored) => stored.id),
              })
            }}
          />
        )}
      </section>

      {resolving ? (
        <ResolveDiscussionDialog
          discussion={d}
          comments={comments ?? []}
          personOf={personOf}
          onClose={() => {
            setResolving(false)
          }}
        />
      ) : null}
      {confirmTrash ? (
        <ConfirmDialog
          message={
            d.is_general
              ? "Move the General discussion to Trash? The folder's conversation goes with it until it is restored."
              : 'Move this discussion to Trash? It can be restored from Trash.'
          }
          confirmLabel="Move to Trash"
          cancelLabel="Keep it"
          onCancel={() => {
            setConfirmTrash(false)
          }}
          onContinue={() => {
            setConfirmTrash(false)
            trash.mutate(d.id, {
              onSuccess: () => {
                onBack()
              },
            })
          }}
        />
      ) : null}
    </div>
  )
}
