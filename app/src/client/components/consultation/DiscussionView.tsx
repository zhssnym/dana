/*
One Discussion (#212, #320): its title and context, its Outcome when resolved,
its structured-input rounds, and its conversation, with the acts this viewer
may take on it.

The conversation is the Folder page's thread exactly (useConceptThread +
applyThreadChange + CommentsThread), read from and posted to the Discussion's
own routes. A resolved or trashed Discussion's thread is frozen: the server
refuses writes with 409 `discussion_frozen`, and this view draws it read-only
so nobody is offered a control that would be refused.

Which acts are drawn is `discussionPowers`; none of it is authorization. The
General discussion is the folder's own conversation, so it is never offered
Move to Trash here (the route still decides).
*/
import { useMemo, useState } from 'react'

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
import { useDiscussion, useInputRounds } from '../../api/queries.js'
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
    <button
      type="button"
      onClick={onBack}
      className="rounded-sm text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
    >
      Back to discussions
    </button>
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
          <p className="text-sm text-muted-foreground">
            This discussion is in Trash or no longer exists.
          </p>
        ) : (
          <InlineError onRetry={() => void discussion.refetch()} />
        )}
      </div>
    )
  }
  return (
    <DiscussionBody
      {...props}
      discussion={discussion.data}
      onRefused={() => void discussion.refetch()}
    />
  )
}

function DiscussionBody(props: {
  discussion: Discussion
  folderId: string
  viewer: ConsultationViewer | null
  personOf: PersonResolver
  focusOutcomeId: string | null
  onBack: () => void
  /* A write the server refused (403, or 409 frozen): the Discussion changed
     under us, so read it again. Only the thread is polled. */
  onRefused: () => void
}): React.JSX.Element {
  const { discussion: d, folderId, viewer, personOf, focusOutcomeId, onBack, onRefused } = props
  const thread = useDiscussionThread(d.id)
  const outcomes = useDiscussionOutcomes(d.id)
  const update = useUpdateDiscussion()
  const reopen = useReopenDiscussion()
  const trash = useTrashDiscussion()
  const postComment = usePostDiscussionComment()
  const patchComment = usePatchComment()
  const deleteComment = useDeleteComment()
  const setLike = useSetCommentLike()
  const rounds = useInputRounds(d.id)

  const [editing, setEditing] = useState(false)
  const [draftTitle, setDraftTitle] = useState('')
  const [draftContext, setDraftContext] = useState('')
  const [resolving, setResolving] = useState(false)
  const [confirmTrash, setConfirmTrash] = useState(false)
  const [asking, setAsking] = useState(false)

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
  const trashable = powers.trash && !d.is_general
  /* One round open at a time: the button waits until the rounds are read. */
  const mayAsk =
    powers.openRound &&
    !frozen &&
    !asking &&
    rounds.data !== undefined &&
    !rounds.data.input_rounds.some((r) => r.state === 'open')

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
    <div className="min-w-0 space-y-6">
      <BackButton onBack={onBack} />

      <header className="space-y-1">
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
            <h2 className="min-w-0 text-base font-semibold break-words text-foreground">
              {d.title}
            </h2>
            {d.is_general ? (
              <p className="text-xs text-muted-foreground">
                This holds the folder&apos;s own conversation.
              </p>
            ) : null}
            <p className="text-xs text-muted-foreground">
              {d.trashed_at !== null ? 'In Trash · ' : d.state === 'resolved' ? 'Resolved · ' : ''}
              Started by {personOf(d.created_by).name} · {formatAgo(d.created_at, now)}
            </p>
            {d.context !== null && d.context !== '' ? (
              <p className="pt-1 text-sm break-words whitespace-pre-wrap text-foreground">
                {d.context}
              </p>
            ) : null}
          </>
        )}

        {!editing && (powers.edit || powers.resolve || powers.reopen || trashable || mayAsk) ? (
          <div className="-ml-2 flex flex-wrap items-center gap-1 pt-2">
            {powers.resolve ? (
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={() => {
                  setResolving(true)
                }}
              >
                Resolve
              </Button>
            ) : null}
            {powers.reopen ? (
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                disabled={reopen.isPending}
                onClick={() => {
                  reopen.mutate(d.id)
                }}
              >
                Reopen
              </Button>
            ) : null}
            {powers.edit ? (
              <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={startEdit}>
                Edit
              </Button>
            ) : null}
            {mayAsk ? (
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={() => {
                  setAsking(true)
                }}
              >
                Ask for input
              </Button>
            ) : null}
            {trashable ? (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
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
          className="border-l-2 border-border py-1 pl-4"
        >
          <h3 className="mb-1 text-xs font-medium text-muted-foreground">Outcome</h3>
          <p className="text-sm break-words whitespace-pre-wrap text-foreground">
            {outcome.statement}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Recorded by {personOf(outcome.actor_id).name} · {formatAgo(outcome.created_at, now)}
            {outcome.source_comment_id !== null ? ' · From a comment' : ''}
          </p>
        </section>
      ) : null}

      {/* One Outcome is the one above; the history earns its place at two. */}
      {(outcomes.data?.outcomes.length ?? 0) >= 2 ? (
        <OutcomeHistory discussionId={d.id} personOf={personOf} focusOutcomeId={focusOutcomeId} />
      ) : null}

      <InputRoundsPanel
        discussionId={d.id}
        frozen={frozen}
        canOpen={powers.openRound}
        asking={asking}
        onAskingChange={setAsking}
      />

      <section aria-label="Conversation" className="space-y-2">
        {thread.isError ? (
          <InlineError onRetry={() => void thread.refetch()} />
        ) : thread.isPending ? (
          <SkeletonList />
        ) : (
          <CommentsThread
            comments={conversation}
            canComment={mayConverse.createComment}
            closedReason={
              !frozen
                ? undefined
                : d.trashed_at !== null
                  ? 'This discussion is in Trash, so its conversation is closed.'
                  : powers.reopen
                    ? 'This conversation is closed. Reopen it to continue.'
                    : 'This conversation is closed.'
            }
            onChange={(next) => {
              /* A post (or the upload before it) that fails rejects this, and
                 the composer gets its text back. */
              let posting = false
              let settle: { ok: () => void; fail: (e: unknown) => void } | null = null
              const posted = new Promise<void>((ok, fail) => {
                settle = { ok, fail }
              })
              const refused = (error: unknown): void => {
                if (
                  error instanceof ApiError &&
                  (error.status === 403 || error.status === 409)
                ) {
                  onRefused()
                }
              }
              applyThreadChange(conversation, next, {
                post: (body) => {
                  posting = true
                  postComment.mutate(
                    { discussionId: d.id, body },
                    {
                      onSuccess: () => settle?.ok(),
                      onError: (error) => {
                        refused(error)
                        settle?.fail(error)
                      },
                    },
                  )
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
                upload: (file) => {
                  posting = true
                  return uploadFile(commentFileKind(file), folderId, file).then(
                    (stored) => stored.id,
                    (error: unknown) => {
                      settle?.fail(error)
                      throw error
                    },
                  )
                },
              })
              return posting ? posted : undefined
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
          message="Move this discussion to Trash? It can be restored from Trash."
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
