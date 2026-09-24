/*
A thread's posts and its composer (W-C; r3 discuss), for a Discussion and for
a Task's Discussion tab alike.

Slack's stream, calm: posts oldest first (`created_at`, then id), grouped by
`grouping.ts` — a group's first post wears its author's face, name and time;
the posts that follow within five minutes are just their text, their time
showing in the face's gutter when the post is pointed at or tapped. A new day
draws a divider. A reply carries one small line naming the post it answers
(7.14 keeps one level), which scrolls there; a reply always starts a group.

What each post offers is `ThreadAuthority` (lib/thread.ts), which the caller
has already multiplied by the thread's own state (a closed Discussion offers
nothing): Like, Reply and "…" (Edit, Delete) sit in a small bar at the post's
top right, shown on hover or focus. A like that someone pressed stays as a
chip under the text. Edit opens the editor in place; Delete asks first. The
composer is always at the bottom; Reply moves the cursor there.
*/
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'

import { postFileIds } from '../../../shared/comments.js'
import type { CommentFile, CommentLine, PostCommentBody, PostContent } from '../../../shared/comments.js'
import { useDeleteComment, usePatchComment, useSetCommentLike } from '../../api/mutations.js'
import { formatDayHeading } from '../../lib/dates.js'
import { MoreHorizontal, Reply, ThumbsUp } from '../../lib/icons.js'
import type { PersonResolver, ThreadAuthority } from '../../lib/thread.js'
import { formatTime, useTimeFormat } from '../../lib/time-format.js'
import { initialsOf } from '../../parts/presenters.js'
import { Face } from '../person-face.js'
import { InlineError, SkeletonList } from '../state-patterns.js'
import { ConfirmDialog } from '../ui/ConfirmDialog.js'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu.js'
import { cn } from '../ui/utils.js'
import { localClock, localDay, placePosts } from './grouping.js'
import { PostView } from './PostView.js'

const PostEditor = lazy(() => import('./PostEditor.js'))

/** The attachments an edit keeps: every file the new writing places, then the
 * old attachments the writing never placed (a comment from before posts). A
 * file the old writing placed and the new one removed is dropped. */
function editedFileIds(next: PostContent, previous: PostContent | null | undefined, files: readonly CommentFile[]): string[] {
  const placedBefore = new Set(previous ? postFileIds(previous) : [])
  const ids = postFileIds(next)
  for (const file of files) if (!placedBefore.has(file.id)) ids.push(file.id)
  return [...new Set(ids)]
}

/* Shown while the post is pointed at or holds focus (a tap focuses it on touch). */
const ON_POST =
  'opacity-0 transition-opacity duration-[var(--duration-fast)] group-hover:opacity-100 group-focus-within:opacity-100 group-focus:opacity-100'
const BAR_BUTTON =
  'flex size-7 items-center justify-center rounded-sm text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring'

function EditorFallback(): React.JSX.Element {
  return <div className="h-10 rounded-lg border border-border bg-background" aria-busy="true" />
}

/** What a reply line quotes of the post it answers. */
function gist(line: CommentLine): string {
  const text = (line.body ?? '').replace(/\s+/g, ' ').trim()
  if (text !== '') return text
  return line.files.length > 0 ? 'an attachment' : ''
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
  const clock = useTimeFormat()
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [focus, setFocus] = useState(0)
  const [editing, setEditing] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const flashTimer = useRef<number | undefined>(undefined)
  useEffect(() => () => { window.clearTimeout(flashTimer.current) }, [])

  const posts = useMemo(
    () =>
      [...(comments ?? [])].sort((a, b) =>
        a.created_at === b.created_at ? (a.id < b.id ? -1 : 1) : a.created_at < b.created_at ? -1 : 1,
      ),
    [comments],
  )
  const placed = useMemo(() => placePosts(posts), [posts])
  const byId = useMemo(() => new Map(posts.map((line) => [line.id, line])), [posts])
  const today = localDay(new Date().toISOString())
  const replyTarget = replyTo === null ? undefined : byId.get(replyTo)

  const timeOf = (instant: string): string => formatTime(localClock(instant), clock) ?? ''
  /* The gutter's time: Slack drops the AM/PM there. */
  const shortTimeOf = (instant: string): string => timeOf(instant).replace(/\s?[AP]M$/, '')

  const goTo = (id: string): void => {
    document.getElementById(`post-${id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    setFlash(id)
    window.clearTimeout(flashTimer.current)
    flashTimer.current = window.setTimeout(() => { setFlash(null) }, 1600)
  }

  if (failed) return <InlineError onRetry={onRetry} />
  if (loading) return <SkeletonList />

  return (
    <div className="min-w-0 space-y-3">
      {posts.length > 0 ? (
        <ol className="-mx-2 min-w-0" aria-label="Posts">
          {placed.map(({ line, head, day }) => {
            const author = personOf(line.author_id)
            const mine = line.author_id === viewerId
            const parent = line.parent_id === null ? undefined : byId.get(line.parent_id)
            const editable = mine && may.mutateOwnComment
            const deletable = (mine && may.mutateOwnComment) || may.moderate
            const fullDate = new Date(line.created_at).toLocaleString()
            const hasBar = may.likeComment || may.createComment || editable || deletable
            return (
              <li key={line.id} className="min-w-0 list-none">
                {day !== null ? (
                  <div className="flex items-center gap-3 px-2 pt-3 pb-1" role="separator" aria-label={formatDayHeading(day, today)}>
                    <span className="h-px flex-1 bg-border" aria-hidden="true" />
                    <span className="text-xs font-medium text-muted-foreground" aria-hidden="true">
                      {formatDayHeading(day, today)}
                    </span>
                    <span className="h-px flex-1 bg-border" aria-hidden="true" />
                  </div>
                ) : null}
                <article
                  id={`post-${line.id}`}
                  tabIndex={-1}
                  aria-label={`${author.name}, ${fullDate}`}
                  className={cn(
                    'group relative flex min-w-0 gap-2.5 rounded-md px-2 outline-none transition-colors duration-[var(--duration-base)] hover:bg-accent focus:bg-accent',
                    head ? 'mt-1 pt-1.5 pb-0.5' : 'py-0.5',
                    flash === line.id && 'bg-dana-accent-50',
                  )}
                >
                  <div className="flex w-8 shrink-0 justify-center">
                    {head ? (
                      <Face
                        className="mt-0.5 size-7 data-[size=sm]:size-7"
                        person={{ id: line.author_id, initials: initialsOf(author.name), name: author.name, ...(author.image === undefined ? {} : { image: author.image }) }}
                      />
                    ) : (
                      <time
                        dateTime={line.created_at}
                        title={fullDate}
                        className={cn('pt-0.5 text-xs leading-5 whitespace-nowrap text-muted-foreground tabular-nums', ON_POST)}
                      >
                        {shortTimeOf(line.created_at)}
                      </time>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    {head ? (
                      <div className="flex min-w-0 items-baseline gap-2">
                        <span className="min-w-0 truncate text-sm font-semibold text-foreground">{author.name}</span>
                        <time dateTime={line.created_at} title={fullDate} className="shrink-0 text-xs text-muted-foreground">
                          {timeOf(line.created_at)}
                        </time>
                      </div>
                    ) : null}
                    {line.parent_id !== null ? (
                      parent !== undefined ? (
                        <button
                          type="button"
                          className="flex max-w-full min-w-0 items-center gap-1 rounded-sm text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                          onClick={() => { goTo(parent.id) }}
                        >
                          <Reply className="size-3 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                          <span className="shrink-0">{personOf(parent.author_id).name}:</span>
                          <span className="min-w-0 truncate">{gist(parent)}</span>
                        </button>
                      ) : (
                        <p className="text-xs text-muted-foreground">Reply to a deleted post</p>
                      )
                    ) : null}
                    <div className="min-w-0">
                      {editing === line.id && folderId !== null ? (
                        <div className="py-1">
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
                        </div>
                      ) : (
                        <PostView content={line.content} body={line.body} files={line.files} edited={line.edited_at !== null} />
                      )}
                    </div>
                    {line.likes > 0 ? (
                      <button
                        type="button"
                        aria-pressed={line.liked}
                        aria-label={line.liked ? `Remove like (${String(line.likes)})` : `Like (${String(line.likes)})`}
                        disabled={!may.likeComment}
                        className={cn(
                          'mt-1 mb-0.5 inline-flex items-center gap-1 rounded-full border px-2 py-px text-xs tabular-nums outline-none transition-colors duration-[var(--duration-fast)] focus-visible:ring-2 focus-visible:ring-ring',
                          line.liked
                            ? 'border-dana-accent-300 bg-dana-accent-50 text-foreground'
                            : 'border-border text-muted-foreground hover:text-foreground',
                        )}
                        onClick={() => { like.mutate({ id: line.id, liked: !line.liked }) }}
                      >
                        <ThumbsUp className="size-3" strokeWidth={1.75} aria-hidden="true" />
                        {line.likes}
                      </button>
                    ) : null}
                  </div>

                  {hasBar && editing !== line.id ? (
                    <div className={cn('absolute -top-3 right-2 z-10 flex items-center rounded-md border border-border bg-background p-0.5', ON_POST)}>
                      {may.likeComment ? (
                        <button
                          type="button"
                          aria-pressed={line.liked}
                          aria-label={line.liked ? 'Remove like' : 'Like'}
                          className={cn(BAR_BUTTON, line.liked && 'text-foreground')}
                          onClick={() => { like.mutate({ id: line.id, liked: !line.liked }) }}
                        >
                          <ThumbsUp className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
                        </button>
                      ) : null}
                      {may.createComment ? (
                        <button
                          type="button"
                          aria-label="Reply"
                          title="Reply"
                          className={BAR_BUTTON}
                          onClick={() => {
                            setReplyTo(line.parent_id ?? line.id)
                            setFocus((value) => value + 1)
                          }}
                        >
                          <Reply className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
                        </button>
                      ) : null}
                      {editable || deletable ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger render={<button type="button" aria-label="Post actions" className={BAR_BUTTON} />}>
                            <MoreHorizontal className="size-4" strokeWidth={1.75} aria-hidden="true" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {editable ? (
                              <DropdownMenuItem onClick={() => { setEditing(line.id) }}>Edit</DropdownMenuItem>
                            ) : null}
                            {deletable ? (
                              <DropdownMenuItem variant="destructive" onClick={() => { setDeleting(line.id) }}>
                                Delete
                              </DropdownMenuItem>
                            ) : null}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : null}
                    </div>
                  ) : null}
                </article>
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
            <p className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
              <span className="min-w-0 truncate">Replying to {personOf(replyTarget.author_id).name}</span>
              <button
                type="button"
                className="shrink-0 rounded-sm underline-offset-2 outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring"
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
