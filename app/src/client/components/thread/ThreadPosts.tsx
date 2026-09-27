/*
A Discussion thread's posts and its composer (W-C; r3 discuss; m12).

Slack's stream, calm and compact: the posts that answer nothing run oldest
first (`created_at`, then id), each with its replies under it as one indented,
quieter run (7.14 keeps one level; `grouping.ts`). A group's first post wears
its author's small face, name and time; the posts that follow within five
minutes are just their text, their time showing in the gutter when the post
is pointed at or tapped. The time beside a name is the clock for today, else
the day and the clock ("Yesterday 14:05", "Mon 14:05", "24 Sep 14:05"), so no
day dividers are drawn. A thread opens at its first post from someone else
since the reader last read it (`openAt`), with one "New" line above it for the
visit, otherwise at its end.

Live (r7): a post sent here shows at once, muted until the server has it,
and sends go out in order. While the reader is at the end, new posts keep
the end in view; scrolled up, one quiet "New posts" line appears above the
composer instead, and nothing moves on its own.

What each post offers is `ThreadAuthority` (lib/thread.ts), which the caller
has already multiplied by the thread's own state (a closed Discussion offers
nothing): Like, Reply and "…" (Edit, Delete) sit in a small bar at the right
of the post's own row, shown on hover or focus, never over the post above. A
liked post keeps one small chip under its text naming who liked it ("You",
"Lucía and You"), never a count; pressing it likes or unlikes. Edit opens the
editor in place; Delete asks first. The composer is one box pinned at the
bottom; Reply moves the cursor there and names the post above it.
*/
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'

import { postFileIds, postPlainText } from '../../../shared/comments.js'
import type { CommentFile, CommentLine, PostCommentBody, PostContent } from '../../../shared/comments.js'
import { useDeleteComment, usePatchComment, useSetCommentLike } from '../../api/mutations.js'
import { formatDay } from '../../lib/dates.js'
import { ArrowDown, MoreHorizontal, Reply, ThumbsUp } from '../../lib/icons.js'
import type { PersonResolver, ThreadAuthority } from '../../lib/thread.js'
import { formatTime, useTimeFormat } from '../../lib/time-format.js'
import { initialsOf } from '../../parts/presenters.js'
import { Face } from '../person-face.js'
import { InlineError, SkeletonList } from '../state-patterns.js'
import { ConfirmDialog } from '../ui/ConfirmDialog.js'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu.js'
import { TRY_AGAIN } from '../ui/copy.js'
import { cn } from '../ui/utils.js'
import { localClock, localDay, placePosts } from './grouping.js'
import type { PlacedPost } from './grouping.js'
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
  'opacity-0 transition-opacity duration-[var(--duration-fast)] group-hover/post:opacity-100 group-focus-within/post:opacity-100 group-focus/post:opacity-100'
const BAR_BUTTON =
  'flex size-5.5 items-center justify-center rounded-sm text-muted-foreground outline-none hover:bg-accent hover:text-foreground'
/* Inside the post's own row, at its top right: a collapsed one-line row is
   exactly the bar's height, so it never reaches the post above. A touch
   screen has no hover: the tapped post's bar is a row under its text. */
const BAR_PLACE =
  'absolute top-0 right-1 z-10 pointer-coarse:static pointer-coarse:mt-1 pointer-coarse:hidden pointer-coarse:w-fit pointer-coarse:opacity-100 pointer-coarse:group-focus-within/post:flex pointer-coarse:group-focus/post:flex'

function EditorFallback(): React.JSX.Element {
  return <div className="h-20 rounded-lg border border-border bg-background" aria-busy="true" />
}

/** What the reply line quotes of the post it answers. */
function gist(line: CommentLine): string {
  const text = (line.body ?? '').replace(/\s+/g, ' ').trim()
  if (text !== '') return text
  return line.files.length > 0 ? 'an attachment' : ''
}

/** "You", "Lucía and You", "Sam, Lucía and You": everyone, by name. */
function namesOf(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1) ?? ''}`
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
  focusOnLand = false,
  openAt,
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
  /** Drawn instead of the composer (a closed thread; null draws nothing). */
  readonly closed?: React.ReactNode
  readonly autoFocus?: boolean
  /** Put the cursor in the composer once the thread has landed at its end. */
  readonly focusOnLand?: boolean
  /** Where the thread opens: after this instant (the reader's last read),
   * at the first post by someone else; null opens at the end. Absent, the
   * thread does not move. */
  readonly openAt?: string | null
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
  /* Sent, not yet stored: drawn muted until the server answers. */
  const [pending, setPending] = useState<readonly CommentLine[]>([])
  const sending = useRef<Promise<unknown>>(Promise.resolve())
  /* Where "New" goes this visit, fixed when the thread lands. */
  const [newFrom, setNewFrom] = useState<string | null>(null)
  /* Posts from others that arrived while the reader was scrolled up. */
  const [unseen, setUnseen] = useState<string | null>(null)

  const posts = useMemo(
    () =>
      [...(comments ?? [])].sort((a, b) =>
        a.created_at === b.created_at ? (a.id < b.id ? -1 : 1) : a.created_at < b.created_at ? -1 : 1,
      ),
    [comments],
  )
  const shown = useMemo(() => (pending.length === 0 ? posts : [...posts, ...pending]), [posts, pending])
  const placed = useMemo(() => placePosts(shown), [shown])
  const byId = useMemo(() => new Map(posts.map((line) => [line.id, line])), [posts])
  const today = localDay(new Date().toISOString())
  /* The post clicked, whose words the line over the composer quotes; the
     reply joins its thread's one level (7.14), so it is sent under that
     post's parent. */
  const replyTarget = replyTo === null ? undefined : byId.get(replyTo)

  const timeOf = (instant: string): string => formatTime(localClock(instant), clock) ?? ''
  /* Beside a name: the clock today, else the day too. */
  const stampOf = (instant: string): string => {
    const day = localDay(instant)
    return day === today ? timeOf(instant) : `${formatDay(day, today)} ${timeOf(instant)}`
  }
  /* The gutter's time: Slack drops the AM/PM there. */
  const shortTimeOf = (instant: string): string => timeOf(instant).replace(/\s?[AP]M$/, '')

  const goTo = (id: string): void => {
    /* A script's `smooth` ignores the stylesheet's reduced-motion rule. */
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    document.getElementById(`post-${id}`)?.scrollIntoView({ block: 'center', behavior: still ? 'auto' : 'smooth' })
    setFlash(id)
    window.clearTimeout(flashTimer.current)
    flashTimer.current = window.setTimeout(() => { setFlash(null) }, 1600)
  }

  /* Arriving at `#post-<id>` (a notification about that post) brings it into
     view once. */
  const arrived = useRef(false)
  useEffect(() => {
    if (arrived.current) return
    const wanted = /^#post-(.+)$/.exec(window.location.hash)?.[1]
    if (wanted === undefined || !byId.has(wanted)) return
    arrived.current = true
    goTo(wanted)
  })

  /* Opening a thread lands where the reading starts, as Slack's does: the
     first post someone else wrote since the last read, else the end. Once,
     and never over a `#post-` arrival. */
  const end = useRef<HTMLDivElement>(null)
  const landed = useRef(false)
  useEffect(() => {
    if (landed.current || openAt === undefined || comments === undefined) return
    landed.current = true
    if (/^#post-/.test(window.location.hash)) return
    const since = openAt === null ? Number.NaN : Date.parse(openAt)
    const first = posts.find((line) => line.author_id !== viewerId && Date.parse(line.created_at) > since)
    if (first !== undefined) {
      if (openAt !== null) setNewFrom(first.id)
      document.getElementById(`post-${first.id}`)?.scrollIntoView({ block: 'center' })
    } else {
      end.current?.scrollIntoView({ block: 'end' })
      if (focusOnLand) setFocus((value) => value + 1)
    }
  })

  /* Whether the end of the thread is on screen, as of the last frame. */
  const atEnd = useRef(true)
  useEffect(() => {
    const marker = end.current
    if (marker === null || typeof IntersectionObserver === 'undefined') return
    const watch = new IntersectionObserver(([entry]) => {
      atEnd.current = entry?.isIntersecting ?? false
      if (atEnd.current) setUnseen(null)
    })
    watch.observe(marker)
    return () => { watch.disconnect() }
  })

  /* A post that arrives after the landing: stay at the end if the reader was
     there (or wrote it); otherwise say so once, quietly. */
  const lastId = shown.at(-1)?.id ?? null
  const seenLast = useRef<string | null>(null)
  useEffect(() => {
    const previous = seenLast.current
    seenLast.current = lastId
    if (previous === null || lastId === null || lastId === previous) return
    const last = shown.at(-1)
    const mine = last?.author_id === viewerId
    if (atEnd.current || mine) {
      /* A reply lands under its parent, not at the end: show it where it is. */
      const at = last === undefined || last.parent_id === null ? null : document.getElementById(`post-${last.id}`)
      if (at) at.scrollIntoView({ block: 'nearest' })
      else end.current?.scrollIntoView({ block: 'end' })
      return
    }
    const firstNew = shown.findIndex((line) => line.id === previous) + 1
    const arrivedLine = shown[firstNew]
    if (arrivedLine !== undefined) setUnseen((current) => current ?? arrivedLine.id)
  }, [lastId, shown, viewerId])

  const send = (body: PostCommentBody): Promise<unknown> => {
    /* Words only: a post with files waits for the server, which names them. */
    const draft: CommentLine | null =
      viewerId !== null && folderId !== null && (body.file_ids ?? []).length === 0
        ? {
            id: `pending-${String(Date.now())}-${String(Math.random()).slice(2, 8)}`,
            folder_id: folderId,
            task_id: null,
            parent_id: body.parent_id ?? null,
            author_id: viewerId,
            body: body.content === undefined ? null : postPlainText(body.content),
            content: body.content,
            likes: 0,
            liked: false,
            liked_by: [],
            files: [],
            created_at: new Date().toISOString(),
            edited_at: null,
          }
        : null
    if (draft !== null) setPending((list) => [...list, draft])
    /* One at a time, in the order they were sent. */
    const run = sending.current.then(() => post(body))
    sending.current = run.catch(() => undefined)
    return run.finally(() => {
      if (draft !== null) setPending((list) => list.filter((line) => line.id !== draft.id))
    })
  }

  /* Only a first read that fails or waits replaces the thread. A later poll
     that fails keeps what was read, the draft and the composer's actions,
     and says so in one line above the composer. */
  if (comments === undefined && failed) return <InlineError onRetry={onRetry} />
  if (comments === undefined && loading) return <SkeletonList />
  const stale = failed

  const newLine = (id: string): React.ReactNode =>
    newFrom === id ? (
      <div className="flex items-center gap-2 py-1 pl-2" role="separator" aria-label="New">
        <span className="text-xs font-medium text-primary" aria-hidden="true">New</span>
        <span className="h-px flex-1 bg-primary opacity-40" aria-hidden="true" />
      </div>
    ) : null

  /** One row: a post of the spine, or a reply (smaller face, same rhythm). */
  const row = ({ line, head }: PlacedPost, reply: boolean): React.ReactNode => {
    const author = personOf(line.author_id)
    const mine = line.author_id === viewerId
    const sent = line.id.startsWith('pending-')
    const editable = mine && may.mutateOwnComment
    const deletable = (mine && may.mutateOwnComment) || may.moderate
    const fullDate = new Date(line.created_at).toLocaleString()
    const hasBar = !sent && (may.likeComment || may.createComment || editable || deletable)
    const likers = (line.liked_by ?? (line.liked && viewerId !== null ? [viewerId] : []))
    /* The reader last, as "… and You". */
    const likerNames = [
      ...likers.filter((id) => id !== viewerId).map((id) => personOf(id).name),
      ...(line.liked ? ['You'] : []),
    ]
    const likedBy = namesOf(likerNames)
    return (
      <article
        id={sent ? undefined : `post-${line.id}`}
        aria-busy={sent || undefined}
        tabIndex={-1}
        aria-label={`${author.name}, ${fullDate}`}
        className={cn(
          'group/post relative flex min-w-0 gap-2 rounded-md px-2 py-0.5 outline-none transition-colors duration-[var(--duration-base)]',
          /* The post being edited has the editor's own frame; a tint too is a double frame. */
          editing !== line.id && 'hover:bg-accent focus:bg-accent',
          head && 'mt-1.5',
          sent && 'opacity-60',
          flash === line.id && 'bg-selected hover:bg-selected focus:bg-selected',
        )}
      >
        <div className={cn('flex shrink-0 justify-center', reply ? 'w-7' : 'w-8')}>
          {head ? (
            <Face
              className={cn('mt-0.5', reply ? 'size-5 data-[size=sm]:size-5' : 'size-6 data-[size=sm]:size-6')}
              person={{ id: line.author_id, initials: initialsOf(author.name), name: author.name, ...(author.image === undefined ? {} : { image: author.image }) }}
            />
          ) : (
            <time
              dateTime={line.created_at}
              title={fullDate}
              className={cn('text-xs leading-5 whitespace-nowrap text-muted-foreground tabular-nums', ON_POST)}
            >
              {shortTimeOf(line.created_at)}
            </time>
          )}
        </div>

        <div className="min-w-0 flex-1">
          {head ? (
            <div className="flex min-w-0 items-baseline gap-2">
              <span className="min-w-0 truncate text-sm font-medium text-foreground">{author.name}</span>
              <time dateTime={line.created_at} title={fullDate} className="shrink-0 text-xs text-muted-foreground">
                {stampOf(line.created_at)}
              </time>
            </div>
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
              aria-label={`${likedBy === '' ? 'Liked' : `Liked by ${likedBy}`}. ${line.liked ? 'Remove like' : 'Like'}`}
              title={likedBy === '' ? undefined : `Liked by ${likedBy}`}
              disabled={!may.likeComment}
              className={cn(
                'mt-0.5 mb-0.5 inline-flex h-5 max-w-full min-w-0 items-center gap-1 rounded-full px-1.5 text-xs outline-none transition-colors duration-[var(--duration-fast)]',
                line.liked
                  ? 'bg-selected text-foreground'
                  : 'border border-border text-muted-foreground hover:text-foreground',
              )}
              onClick={() => { like.mutate({ id: line.id, liked: !line.liked }) }}
            >
              <ThumbsUp className="size-3 shrink-0" strokeWidth={1.75} aria-hidden="true" />
              {likedBy === '' ? null : <span className="min-w-0 truncate">{likedBy}</span>}
            </button>
          ) : null}

          {hasBar && editing !== line.id ? (
            <div className={cn('flex items-center rounded-md border border-border bg-background', ON_POST, BAR_PLACE)}>
              {may.likeComment ? (
                <button
                  type="button"
                  aria-pressed={line.liked}
                  aria-label={line.liked ? 'Remove like' : 'Like'}
                  title={line.liked ? 'Remove like' : 'Like'}
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
                    setReplyTo(line.id)
                    setFocus((value) => value + 1)
                  }}
                >
                  <Reply className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
                </button>
              ) : null}
              {editable || deletable ? (
                <DropdownMenu>
                  <DropdownMenuTrigger render={<button type="button" aria-label="Post actions" title="More" className={BAR_BUTTON} />}>
                    <MoreHorizontal className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
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
        </div>
      </article>
    )
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {/* The history scrolls in its own region when the caller gives the
          thread a height (a Discussion fills the screen); it reads from the
          top, like a letter, and the composer stays at the foot. */}
      <div data-thread-history className="-mx-2 min-h-0 flex-1 overflow-y-auto px-2">
        <div className="pt-2 pb-3">
          {placed.length > 0 ? (
            <ol className="-mx-2 min-w-0" aria-label="Posts">
              {placed.map((root) => (
                <li key={root.line.id} className="min-w-0 list-none">
                  {newLine(root.line.id)}
                  {row(root, false)}
                  {root.replies.length > 0 ? (
                    <ol className="mt-0.5 mb-1 ml-6 min-w-0 border-l border-border pl-1" aria-label={`Replies to ${personOf(root.line.author_id).name}`}>
                      {root.replies.map((reply) => (
                        <li key={reply.line.id} className="min-w-0 list-none">
                          {newLine(reply.line.id)}
                          {row(reply, true)}
                        </li>
                      ))}
                    </ol>
                  ) : null}
                </li>
              ))}
            </ol>
          ) : null}
          <div ref={end} aria-hidden="true" className="h-px scroll-mb-24" />
        </div>
      </div>

      {/* The composer stays at the bottom of the screen while the history scrolls. */}
      <div className="sticky bottom-0 z-10 shrink-0 bg-background pt-2 pb-3">
        {unseen !== null ? (
          <button
            type="button"
            className="absolute -top-5 left-1/2 z-10 flex w-fit -translate-x-1/2 items-center gap-1 rounded-md border border-border bg-background px-2 py-0.5 text-xs text-muted-foreground outline-none hover:text-foreground"
            onClick={() => {
              const id = unseen
              setUnseen(null)
              document.getElementById(`post-${id}`)?.scrollIntoView({ block: 'start' })
            }}
          >
            New posts
            <ArrowDown className="size-3" strokeWidth={1.75} aria-hidden="true" />
          </button>
        ) : null}

        {stale ? (
          <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
            Couldn't refresh the thread.
            <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={onRetry}>
              {TRY_AGAIN}
            </button>
          </p>
        ) : null}

        {closed !== undefined ? (
          closed
        ) : may.createComment && folderId !== null ? (
          <div className="space-y-1">
            {replyTarget !== undefined ? (
              <p className="flex min-w-0 items-center gap-2 px-1 text-xs text-muted-foreground">
                <Reply className="size-3 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                <span className="min-w-0 truncate">
                  Replying to {personOf(replyTarget.author_id).name}: {gist(replyTarget)}
                </span>
                <button
                  type="button"
                  className="shrink-0 rounded-sm underline-offset-2 outline-none hover:text-foreground hover:underline"
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
                submitLabel="Send"
                autoFocus={autoFocus}
                focusSignal={focus}
                onSubmit={(content) => {
                  /* The reply line goes with the words that leave the composer;
                     a refusal brings both back. */
                  const target = replyTarget
                  setReplyTo(null)
                  return send({
                    content,
                    ...(target === undefined ? {} : { parent_id: target.parent_id ?? target.id }),
                    ...(postFileIds(content).length > 0 ? { file_ids: [...new Set(postFileIds(content))] } : {}),
                  }).catch((error: unknown) => {
                    if (target !== undefined) setReplyTo(target.id)
                    onRefused?.(error)
                    throw error
                  })
                }}
              />
            </Suspense>
          </div>
        ) : posts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No posts yet.</p>
        ) : null}
      </div>

      {deleting !== null ? (
        <ConfirmDialog
          message="Delete this post?"
          description="This cannot be undone."
          confirmLabel="Delete"
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
