/*
A thread's posts and its composer (W-C), for a Discussion and for a Task's
Discussion tab alike.

Posts are listed flat, oldest first (`created_at`, then id), each wearing its
author's face, name and time and a thin stripe in a colour of their own. A
reply is a post with a small "in reply to <name>" line; replying always
points at the top-level post (7.14 keeps one level). The composer is always at
the bottom; Reply moves the cursor there.

What each post offers is `ThreadAuthority` (lib/thread.ts), which the caller
has already multiplied by the thread's own state (a closed Discussion offers
nothing). Edit opens the editor in place; Delete asks first. A like stays one
quiet thumb that shows its count only when someone has pressed it.
*/
import { Suspense, lazy, useMemo, useState } from 'react'

import { postFileIds } from '../../../shared/comments.js'
import type { CommentFile, CommentLine, PostCommentBody, PostContent } from '../../../shared/comments.js'
import { useDeleteComment, usePatchComment, useSetCommentLike } from '../../api/mutations.js'
import { MoreHorizontal, ThumbsUp } from '../../lib/icons.js'
import type { PersonResolver, ThreadAuthority } from '../../lib/thread.js'
import { formatAgo } from '../../parts/format-dates.js'
import { IDENTITY_COLORS, SHUFFLE_COLORS } from '../../parts/identity-colors.js'
import { initialsOf } from '../../parts/presenters.js'
import { Face } from '../person-face.js'
import { InlineError, SkeletonList } from '../state-patterns.js'
import { ConfirmDialog } from '../ui/ConfirmDialog.js'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu.js'
import { cn } from '../ui/utils.js'
import { PostView } from './PostView.js'

const PostEditor = lazy(() => import('./PostEditor.js'))

/* Every palette colour but the grey, so a stripe always reads as someone. */
const STRIPES: readonly string[] = [...IDENTITY_COLORS.slice(1).map(([, hex]) => hex), ...SHUFFLE_COLORS]

/** A person's stripe: stable per id, the same on every screen. */
export function personStripe(id: string): string {
  let hash = 0
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return STRIPES[hash % STRIPES.length] ?? STRIPES[0]!
}

/** The attachments an edit keeps: every file the new writing places, then the
 * old attachments the writing never placed (a comment from before posts). A
 * file the old writing placed and the new one removed is dropped. */
function editedFileIds(next: PostContent, previous: PostContent | null | undefined, files: readonly CommentFile[]): string[] {
  const placedBefore = new Set(previous ? postFileIds(previous) : [])
  const ids = postFileIds(next)
  for (const file of files) if (!placedBefore.has(file.id)) ids.push(file.id)
  return [...new Set(ids)]
}

/* Quiet until the post is pointed at or focused; always shown on touch. */
const HOVER_ONLY = 'group-focus-within:opacity-100 pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100'

function EditorFallback(): React.JSX.Element {
  return <div className="h-10 rounded-md border border-border bg-background" aria-busy="true" />
}

export function ThreadPosts({
  folderId,
  comments,
  loading,
  failed,
  onRetry,
  viewerId,
  personOf,
  may,
  closed,
  autoFocus = false,
  post,
  onRefused,
}: {
  readonly folderId: string | null
  readonly comments: readonly CommentLine[] | undefined
  readonly loading: boolean
  readonly failed: boolean
  readonly onRetry: () => void
  readonly viewerId: string | null
  readonly personOf: PersonResolver
  /** Already false everywhere when the thread takes no writes. */
  readonly may: ThreadAuthority
  /** Drawn instead of the composer (a closed thread). */
  readonly closed?: React.ReactNode
  readonly autoFocus?: boolean
  readonly post: (body: PostCommentBody) => Promise<unknown>
  /** A write the server refused (403/409): the thread changed under us. */
  readonly onRefused?: (error: unknown) => void
}): React.JSX.Element {
  const patch = usePatchComment()
  const remove = useDeleteComment()
  const like = useSetCommentLike()
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [focus, setFocus] = useState(0)
  const [editing, setEditing] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  const posts = useMemo(
    () =>
      [...(comments ?? [])].sort((a, b) =>
        a.created_at === b.created_at ? (a.id < b.id ? -1 : 1) : a.created_at < b.created_at ? -1 : 1,
      ),
    [comments],
  )
  const byId = useMemo(() => new Map(posts.map((line) => [line.id, line])), [posts])
  const now = Date.now()
  const replyTarget = replyTo === null ? undefined : byId.get(replyTo)

  if (failed) return <InlineError onRetry={onRetry} />
  if (loading) return <SkeletonList />

  return (
    <div className="min-w-0 space-y-4">
      {posts.length > 0 ? (
        <ol className="space-y-4" aria-label="Posts">
          {posts.map((line) => {
            const author = personOf(line.author_id)
            const mine = line.author_id === viewerId
            const parent = line.parent_id === null ? undefined : byId.get(line.parent_id)
            const editable = mine && may.mutateOwnComment
            const deletable = (mine && may.mutateOwnComment) || may.moderate
            return (
              <li key={line.id} id={`post-${line.id}`} className="group relative min-w-0 pl-3">
                <span
                  aria-hidden="true"
                  className="absolute inset-y-0 left-0 w-0.5 rounded-full"
                  style={{ backgroundColor: personStripe(line.author_id) }}
                />
                <div className="flex min-w-0 items-center gap-2">
                  <Face person={{ initials: initialsOf(author.name), name: author.name, ...(author.image === undefined ? {} : { image: author.image }) }} />
                  <span className="min-w-0 truncate text-sm font-medium text-foreground">{author.name}</span>
                  <time dateTime={line.created_at} title={new Date(line.created_at).toLocaleString()} className="shrink-0 text-xs text-muted-foreground">
                    {formatAgo(line.created_at, now)}
                    {line.edited_at !== null ? ' · edited' : ''}
                  </time>
                  {line.likes > 0 || may.likeComment ? (
                    <button
                      type="button"
                      aria-pressed={line.liked}
                      aria-label={line.liked ? 'Remove like' : 'Like'}
                      disabled={!may.likeComment}
                      className={cn(
                        'ml-auto inline-flex shrink-0 items-center gap-1 rounded-sm px-1 py-0.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        line.liked ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                        line.likes === 0 && HOVER_ONLY,
                      )}
                      onClick={() => { like.mutate({ id: line.id, liked: !line.liked }) }}
                    >
                      <ThumbsUp className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
                      {line.likes > 0 ? <span className="tabular-nums">{line.likes}</span> : null}
                    </button>
                  ) : null}
                  <div className={cn('flex shrink-0 items-center gap-0.5', !(line.likes > 0 || may.likeComment) && 'ml-auto', HOVER_ONLY)}>
                    {may.createComment ? (
                      <button
                        type="button"
                        className="rounded-sm px-1.5 py-0.5 text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={() => {
                          setReplyTo(line.parent_id ?? line.id)
                          setFocus((value) => value + 1)
                        }}
                      >
                        Reply
                      </button>
                    ) : null}
                    {editable || deletable ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <button
                              type="button"
                              aria-label="Post actions"
                              className="flex size-6 items-center justify-center rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                            />
                          }
                        >
                          <MoreHorizontal className="size-4" strokeWidth={1.75} aria-hidden="true" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {editable ? (
                            <DropdownMenuItem onClick={() => { setEditing(line.id) }}>Edit</DropdownMenuItem>
                          ) : null}
                          {deletable ? (
                            <DropdownMenuItem variant="destructive" onClick={() => { setDeleting(line.id) }}>Delete</DropdownMenuItem>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : null}
                  </div>
                </div>
                {parent !== undefined ? (
                  <a href={`#post-${parent.id}`} className="mt-0.5 block truncate text-xs text-muted-foreground hover:text-foreground">
                    in reply to {personOf(parent.author_id).name}
                  </a>
                ) : null}
                <div className="mt-1 min-w-0">
                  {editing === line.id && folderId !== null ? (
                    <Suspense fallback={<EditorFallback />}>
                      <PostEditor
                        folderId={folderId}
                        initial={{ content: line.content, body: line.body, files: line.files }}
                        submitLabel="Save"
                        autoFocus
                        label="Edit post"
                        onCancel={() => { setEditing(null) }}
                        onSubmit={(content) =>
                          patch
                            .mutateAsync({ id: line.id, body: { content, file_ids: editedFileIds(content, line.content, line.files) } })
                            .then(() => { setEditing(null) }, (error: unknown) => { onRefused?.(error); throw error })
                        }
                      />
                    </Suspense>
                  ) : (
                    <PostView content={line.content} body={line.body} files={line.files} />
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      ) : null}

      {closed !== undefined ? (
        closed
      ) : may.createComment && folderId !== null ? (
        <div className="space-y-1">
          {replyTarget !== undefined ? (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              Replying to {personOf(replyTarget.author_id).name}
              <button
                type="button"
                className="rounded-sm underline-offset-2 outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => { setReplyTo(null) }}
              >
                Cancel
              </button>
            </p>
          ) : null}
          <Suspense fallback={<EditorFallback />}>
            <PostEditor
              folderId={folderId}
              placeholder={posts.length === 0 ? 'Write the first post…' : 'Write a reply…'}
              autoFocus={autoFocus}
              focusSignal={focus}
              onSubmit={(content) =>
                post({
                  content,
                  ...(replyTarget === undefined ? {} : { parent_id: replyTarget.id }),
                  ...(postFileIds(content).length > 0 ? { file_ids: [...new Set(postFileIds(content))] } : {}),
                }).then(
                  () => { setReplyTo(null) },
                  (error: unknown) => { onRefused?.(error); throw error },
                )
              }
            />
          </Suspense>
        </div>
      ) : posts.length === 0 ? (
        <p className="text-sm text-muted-foreground">No posts yet.</p>
      ) : null}

      {deleting !== null ? (
        <ConfirmDialog
          message="Delete this post? This cannot be undone."
          confirmLabel="Delete"
          cancelLabel="Keep it"
          onCancel={() => { setDeleting(null) }}
          onContinue={() => {
            const id = deleting
            setDeleting(null)
            remove.mutate(id, { onError: (error) => onRefused?.(error) })
          }}
        />
      ) : null}
    </div>
  )
}
