/*
A Discussion thread's posts and its composer (W-C; r3 discuss; m12; chat feed).

A chat feed, kept quiet. Every post runs oldest first (`created_at`, then id)
in one flat timeline (`grouping.ts`); a reply is not moved under the post it
answers but quotes it at the top of its bubble (author and its first two
lines), and pressing the quote brings that post into view, briefly tinted.
The reader's own posts sit at the right on a filled surface, everyone else's
at the left on the page with a hairline. No faces: a run's first bubble from
someone else carries their name, in their roster tint, and a tighter corner on
their side; consecutive posts by one author within ten minutes on one day
form a run, tight together, with more room before the next run. Each day
opens with a centred day line ("Today", "Yesterday", else the date).

Inside each bubble, after the text (on its last line when there is room):
up to three reaction chips (emoji and count, the reader's own tinted, the
rest as "+N"), "edited" if it was, and the clock time. A chip's title names
who left it; pressing it leaves or takes back the reader's reaction of that
kind. A reaction is never a post.

A thread opens at its first post from someone else since the reader last
read it (`openAt`), with one "New" line above it for the visit, otherwise at
its end. A resolved thread ends with one centred line saying who resolved it
and when, and the decision if one was given (`resolution`).

Live (r7): a post sent here shows at once, muted until the server has it,
and sends go out in order. Only the history scrolls, its posts anchored to
its foot. While the reader is within about 150px of the end (or wrote the
post), new posts keep the end in view; further up, one quiet "New posts"
line appears above the composer instead, and nothing moves on its own.

What each post offers is `ThreadAuthority` (lib/thread.ts), which the caller
has already multiplied by the thread's own state (a closed Discussion offers
nothing): React (the six emoji in one row), Reply and "…" (Edit, Delete) sit
in a small bar beside the bubble, shown on hover or focus, never over a
neighbour; on a touch screen a tapped post shows the bar under its bubble.
Edit opens the editor in place; Delete asks first. Reply names the post over
the composer and puts the cursor there.
*/
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'

import { REACTIONS, REACTION_KEYS, postFileIds, postPlainText } from '../../../shared/comments.js'
import type { CommentFile, CommentLine, PostCommentBody, PostContent, ReactionKey } from '../../../shared/comments.js'
import { useDeleteComment, usePatchComment, useSetCommentReaction } from '../../api/mutations.js'
import { formatDay } from '../../lib/dates.js'
import { ArrowDown, CheckCircle2, MoreHorizontal, Reply, SmilePlus } from '../../lib/icons.js'
import type { PersonResolver, ThreadAuthority } from '../../lib/thread.js'
import { formatTime, useTimeFormat } from '../../lib/time-format.js'
import { personNameInk } from '../../parts/person-tint.js'
import { usePersonTint } from '../default-avatar.js'
import { InlineError, SkeletonList } from '../state-patterns.js'
import { ConfirmDialog } from '../ui/ConfirmDialog.js'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu.js'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover.js'
import { TRY_AGAIN } from '../ui/copy.js'
import { cn } from '../ui/utils.js'
import { localClock, localDay, placePosts } from './grouping.js'
import type { PlacedPost } from './grouping.js'
import { PostView } from './PostView.js'
import { Composer } from './Composer.js'

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
/* Beside the bubble, level with its top, in the room the bubble's maximum
   width leaves: never over a neighbour. A touch screen has no hover: the
   tapped post's bar is a row under its bubble. */
const BAR_PLACE =
  'absolute top-0 z-10 pointer-coarse:static pointer-coarse:mt-1 pointer-coarse:hidden pointer-coarse:w-fit pointer-coarse:opacity-100 pointer-coarse:group-focus-within/post:flex pointer-coarse:group-focus/post:flex'
/* Small words inside a bubble (time, "edited", a quote): the page's ink at
   three quarters, which keeps 4.5:1 on both bubbles in both themes (the
   muted grey drops under it on the filled one). */
const META = 'text-xs text-foreground/75'
/* How many kinds of reaction a bubble shows before "+N". */
const CHIPS = 3
/* "Near the end": a new post keeps the end in view within this distance. */
const NEAR_END_PX = 150

function EditorFallback(): React.JSX.Element {
  return <div className="h-20 rounded-lg border border-border bg-background" aria-busy="true" />
}

/** What the reply line quotes of the post it answers. */
function gist(line: CommentLine): string {
  const text = (line.body ?? '').replace(/\s+/g, ' ').trim()
  if (text !== '') return text
  return line.files.length > 0 ? 'an attachment' : ''
}

/** A post written to be read rather than glanced at: a few lines of words,
 * or more than a couple of blocks. It takes the thread's whole width, as a
 * letter would, instead of a chat bubble's. */
function isLong(line: CommentLine): boolean {
  return (line.body ?? '').length > 280 || (line.content?.blocks.length ?? 0) > 2
}

/** What a reply's quote shows of the post it answers: its words with their
 * line breaks (two lines are drawn), else that it was an attachment. */
function quoteOf(line: CommentLine): string {
  const text = (line.body ?? '').trim()
  if (text !== '') return text
  return line.files.length > 0 ? 'An attachment' : ''
}

/** What a screen reader says for each glyph. */
const REACTION_NAMES: Record<ReactionKey, string> = {
  thumbs_up: 'Thumbs up',
  heart: 'Heart',
  laugh: 'Laugh',
  party: 'Party',
  surprised: 'Surprised',
  thanks: 'Thanks',
}

/** "You", "Lucía and You", "Sam, Lucía and You": everyone, by name. */
function namesOf(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1) ?? ''}`
}

/** A name in its person's roster tint (the colour their face wears here). */
function AuthorName({ id, name, className }: { readonly id: string; readonly name: string; readonly className?: string }): React.JSX.Element {
  const tint = usePersonTint(id)
  return (
    <span className={cn('min-w-0 truncate font-section', className)} style={{ color: personNameInk(tint) }}>
      {name}
    </span>
  )
}

/** A centred quiet line between posts: a day, or how the thread ended. */
function SystemLine({ children, label }: { readonly children: React.ReactNode; readonly label?: string }): React.JSX.Element {
  return (
    <div role="separator" aria-label={label} className="my-4 flex justify-center px-4 text-center text-xs text-muted-foreground">
      {children}
    </div>
  )
}

/** How a resolved thread ended, drawn as the feed's last line. */
export interface ThreadResolution {
  /** Who resolved it; null when the record no longer says. */
  readonly by: string | null
  /** When (an instant); null when the record no longer says. */
  readonly at: string | null
  /** The decision written when it was resolved, if any. */
  readonly statement: string | null
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
  resolution = null,
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
  /** A resolved thread's ending, drawn as the feed's last line; null (an
   * open thread) draws nothing. */
  readonly resolution?: ThreadResolution | null
  readonly post: (body: PostCommentBody) => Promise<unknown>
  /** A write the server refused (403/409): the thread changed under us. */
  readonly onRefused?: (error: unknown) => void
}): React.JSX.Element {
  const patch = usePatchComment()
  const remove = useDeleteComment()
  const react = useSetCommentReaction()
  const clock = useTimeFormat()
  const [replyTo, setReplyTo] = useState<string | null>(null)
  /* The post whose emoji row is open. */
  const [picking, setPicking] = useState<string | null>(null)
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
  const nameOf = (id: string): string => (id === viewerId ? 'You' : personOf(id).name)

  /* Whether the reader is near the end, as of their last scroll (so a post
     that has just grown the history does not count against them). */
  const atEnd = useRef(true)

  const goTo = (id: string): void => {
    /* A script's `smooth` ignores the stylesheet's reduced-motion rule. */
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    /* A deliberate jump: the end no longer holds the reader (the scroll it
       causes measures again). */
    atEnd.current = false
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

  /* The history's own scroll region, and its end. */
  const scroller = useRef<HTMLDivElement>(null)
  const end = useRef<HTMLDivElement>(null)
  const toEnd = (): void => {
    const box = scroller.current
    if (box !== null && box.scrollHeight > box.clientHeight) box.scrollTop = box.scrollHeight
    else end.current?.scrollIntoView({ block: 'end' })
  }

  /* Opening a thread lands where the reading starts, as Slack's does: the
     first post someone else wrote since the last read, else the end. Once,
     and never over a `#post-` arrival. */
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
      onScroll()
    } else {
      toEnd()
      if (focusOnLand) setFocus((value) => value + 1)
    }
  })

  const onScroll = (): void => {
    const box = scroller.current
    if (box === null) return
    atEnd.current = box.scrollHeight - box.scrollTop - box.clientHeight < NEAR_END_PX
    if (atEnd.current) setUnseen(null)
  }

  /* A reader at the end stays there while the history changes size under
     them: the region settling its height, a picture or a task card loading,
     a reaction wrapping a footer onto its own line. */
  const content = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const box = scroller.current
    const inner = content.current
    if (box === null || inner === null || typeof ResizeObserver === 'undefined') return
    const watch = new ResizeObserver(() => { if (atEnd.current) toEnd() })
    watch.observe(box)
    watch.observe(inner)
    return () => { watch.disconnect() }
  })

  /* A post that arrives after the landing: stay at the end if the reader was
     near it (or wrote it); otherwise say so once, quietly. */
  const lastId = shown.at(-1)?.id ?? null
  const seenLast = useRef<string | null>(null)
  useEffect(() => {
    const previous = seenLast.current
    seenLast.current = lastId
    if (previous === null || lastId === null || lastId === previous) return
    const mine = shown.at(-1)?.author_id === viewerId
    if (atEnd.current || mine) {
      toEnd()
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
            reactions: [],
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
      <div className="my-2 flex items-center gap-3 px-1" role="separator" aria-label="New">
        <span className="text-xs font-medium text-primary" aria-hidden="true">New</span>
        <span className="h-px flex-1 bg-primary opacity-35" aria-hidden="true" />
      </div>
    ) : null

  const dayLine = (instant: string): React.ReactNode => {
    const label = formatDay(localDay(instant), today)
    return <SystemLine label={label}>{label}</SystemLine>
  }

  /** One post: its bubble, at the reader's side or the other. */
  const row = ({ line, head }: PlacedPost): React.ReactNode => {
    const author = personOf(line.author_id)
    const mine = line.author_id === viewerId
    const sent = line.id.startsWith('pending-')
    const editable = mine && may.mutateOwnComment
    const deletable = (mine && may.mutateOwnComment) || may.moderate
    const fullDate = new Date(line.created_at).toLocaleString()
    const hasBar = !sent && ((may.likeComment && viewerId !== null) || may.createComment || editable || deletable)
    const mayReact = may.likeComment && viewerId !== null
    const isMine = (key: ReactionKey): boolean =>
      viewerId !== null && line.reactions.some((r) => r.reaction === key && r.by.includes(viewerId))
    const toggle = (key: ReactionKey): void => {
      if (viewerId === null) return
      react.mutate({ id: line.id, reaction: key, on: !isMine(key), viewerId })
    }
    /* Who left a reaction, the reader last, as "… and You". */
    const whoLeft = (by: readonly string[]): string =>
      namesOf([...by.filter((id) => id !== viewerId).map((id) => personOf(id).name), ...(viewerId !== null && by.includes(viewerId) ? ['You'] : [])])
    const parent = line.parent_id === null ? undefined : byId.get(line.parent_id)
    const shownChips = line.reactions.slice(0, CHIPS)
    const moreChips = line.reactions.slice(CHIPS)

    const footer = (
      <span className="inline-flex max-w-full flex-wrap items-center justify-end gap-1 align-middle">
        {shownChips.map(({ reaction, by }) => {
          const own = viewerId !== null && by.includes(viewerId)
          const names = whoLeft(by)
          return (
            <button
              key={reaction}
              type="button"
              aria-pressed={own}
              aria-label={`${REACTION_NAMES[reaction]} from ${names}. ${own ? 'Remove your reaction' : `React with ${REACTION_NAMES[reaction]}`}`}
              title={names}
              disabled={!mayReact}
              className={cn(
                'inline-flex h-4.5 shrink-0 items-center gap-0.5 rounded-full px-1.5 text-xs leading-none tabular-nums outline-none',
                own ? 'bg-selected text-foreground' : mine ? 'bg-background text-foreground/75' : 'bg-secondary text-foreground/75',
                mayReact && 'hover:text-foreground',
              )}
              onClick={() => { toggle(reaction) }}
            >
              <span aria-hidden="true">{REACTIONS[reaction]}</span>
              <span>{by.length}</span>
            </button>
          )
        })}
        {moreChips.length > 0 ? (
          <span
            className={cn('px-0.5', META)}
            title={moreChips.map(({ reaction, by }) => `${REACTIONS[reaction]} ${whoLeft(by)}`).join('\n')}
          >
            +{moreChips.length}
          </span>
        ) : null}
        {line.edited_at !== null ? <span className={META}>edited</span> : null}
        <time dateTime={line.created_at} title={fullDate} className={cn('tabular-nums', META)}>
          {timeOf(line.created_at)}
        </time>
      </span>
    )

    return (
      <article
        id={sent ? undefined : `post-${line.id}`}
        aria-busy={sent || undefined}
        tabIndex={-1}
        aria-label={`${author.name}, ${fullDate}`}
        className={cn('group/post flex min-w-0 flex-col outline-none', mine ? 'items-end' : 'items-start', sent && 'opacity-60')}
      >
        {head && !mine ? <AuthorName id={line.author_id} name={author.name} className="mb-0.5 max-w-full px-1 text-xs" /> : null}
        <div
          className={cn(
            'relative flex min-w-0 flex-col',
            isLong(line) ? 'w-full' : 'max-w-[82%] md:max-w-[min(65%,var(--container-2xl))]',
            mine ? 'items-end' : 'items-start',
            editing === line.id && 'w-full',
          )}
        >
          <div
            className={cn(
              'max-w-full min-w-0 rounded-[var(--radius-card)] px-3 py-1.5 transition-colors duration-[var(--duration-base)]',
              mine ? 'bg-secondary' : 'border border-border bg-background',
              head && (mine ? 'rounded-tr-xs' : 'rounded-tl-xs'),
              (editing === line.id || isLong(line)) && 'w-full',
              flash === line.id && 'bg-selected',
            )}
          >
            {parent !== undefined ? (
              <button
                type="button"
                className="mb-1 block w-full min-w-0 border-l-2 border-quiet-foreground pl-2 text-left outline-none hover:border-muted-foreground"
                aria-label={`Replying to ${nameOf(parent.author_id)}: ${gist(parent)}. Show that post`}
                onClick={() => { goTo(parent.id) }}
              >
                <AuthorName id={parent.author_id} name={nameOf(parent.author_id)} className="block text-xs" />
                <span className={cn('line-clamp-2 wrap-anywhere whitespace-pre-line', META)}>{quoteOf(parent)}</span>
              </button>
            ) : null}
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
              <PostView key={line.edited_at ?? ''} content={line.content} body={line.body} files={line.files} footer={footer} />
            )}
          </div>

          {hasBar && editing !== line.id ? (
            <div
              className={cn(
                'flex items-center rounded-md border border-border bg-background',
                ON_POST,
                BAR_PLACE,
                mine ? 'right-full mr-1' : 'left-full ml-1',
                /* The emoji row hangs from the bar: it stays while the row is open. */
                picking === line.id && 'opacity-100 pointer-coarse:flex',
              )}
            >
              {mayReact ? (
                <Popover open={picking === line.id} onOpenChange={(open) => { setPicking(open ? line.id : null) }}>
                  <PopoverTrigger render={<button type="button" aria-label="Add reaction" title="Add reaction" className={BAR_BUTTON} />}>
                    <SmilePlus className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
                  </PopoverTrigger>
                  <PopoverContent align={mine ? 'end' : 'start'} className="flex w-auto gap-0.5 p-1" aria-label="Reactions">
                    {REACTION_KEYS.map((key) => (
                      <button
                        key={key}
                        type="button"
                        aria-pressed={isMine(key)}
                        aria-label={REACTION_NAMES[key]}
                        title={REACTION_NAMES[key]}
                        className={cn(
                          'flex size-8 items-center justify-center rounded-sm text-base outline-none hover:bg-accent focus-visible:bg-accent',
                          isMine(key) && 'bg-selected',
                        )}
                        onClick={() => {
                          toggle(key)
                          setPicking(null)
                        }}
                      >
                        <span aria-hidden="true">{REACTIONS[key]}</span>
                      </button>
                    ))}
                  </PopoverContent>
                </Popover>
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
                  <DropdownMenuContent align={mine ? 'end' : 'start'}>
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

  /* The ending, on its own day line when it fell on a later day than the last post. */
  const lastPost = shown.at(-1)
  const ending =
    resolution === null ? null : (
      <>
        {resolution.at !== null && (lastPost === undefined || localDay(lastPost.created_at) !== localDay(resolution.at))
          ? dayLine(resolution.at)
          : null}
        {/* What the discussion came to is what a reader opens it for, so it
            ends the thread as its one bordered block, not a passing line. */}
        <section aria-label="Decision" className="my-4 flex min-w-0 flex-col gap-1 rounded-[var(--radius-card)] border border-border px-4 py-3">
          <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            <CheckCircle2 className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
            <span className="min-w-0">
              {resolution.by === null ? 'Resolved' : `Resolved by ${nameOf(resolution.by)}`}
              {resolution.at === null ? null : (
                <>
                  {' · '}
                  <time dateTime={resolution.at} title={new Date(resolution.at).toLocaleString()}>{timeOf(resolution.at)}</time>
                </>
              )}
            </span>
          </p>
          {resolution.statement !== null && resolution.statement !== '' ? (
            <p className="text-sm wrap-anywhere whitespace-pre-wrap text-foreground [unicode-bidi:plaintext] text-start">{resolution.statement}</p>
          ) : null}
        </section>
      </>
    )

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {/* Only the history scrolls, when the caller gives the thread a height
          (a Discussion fills the screen). Its posts sit at its foot, the
          newest just over the composer: the region is a column and the list
          takes the room left above it (mt-auto, not justify-end, which would
          cut off the top of a long thread). */}
      <div
        ref={scroller}
        data-thread-history
        onScroll={onScroll}
        className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto px-1"
      >
        <div ref={content} className="mt-auto min-w-0 pb-2">
          {placed.length > 0 ? (
            <ol className="min-w-0" aria-label="Posts">
              {placed.map((placedPost) => (
                <li
                  key={placedPost.line.id}
                  className={cn('min-w-0 list-none', placedPost.newDay ? null : placedPost.head ? 'mt-4' : 'mt-0.5')}
                >
                  {placedPost.newDay ? dayLine(placedPost.line.created_at) : null}
                  {newLine(placedPost.line.id)}
                  {row(placedPost)}
                </li>
              ))}
            </ol>
          ) : null}
          {ending}
          <div ref={end} aria-hidden="true" className="h-px" />
        </div>
      </div>

      {/* Under the last post; at the bottom of the screen while the history scrolls. */}
      <div className="sticky bottom-0 z-10 shrink-0 bg-background pt-5 pb-3">
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
          <Composer
            folderId={folderId}
            autoFocus={autoFocus}
            focusSignal={focus}
            replyingTo={replyTarget === undefined ? null : { name: personOf(replyTarget.author_id).name, text: gist(replyTarget) }}
            onCancelReply={() => { setReplyTo(null) }}
            onSubmit={(content) => {
              /* The reply line goes with the words that leave the composer;
                 a refusal brings both back. */
              const target = replyTarget
              setReplyTo(null)
              return send({
                content,
                ...(target === undefined ? {} : { parent_id: target.id }),
                ...(postFileIds(content).length > 0 ? { file_ids: [...new Set(postFileIds(content))] } : {}),
              }).catch((error: unknown) => {
                if (target !== undefined) setReplyTo(target.id)
                onRefused?.(error)
                throw error
              })
            }}
          />
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
