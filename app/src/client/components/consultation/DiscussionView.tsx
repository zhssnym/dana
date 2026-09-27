/*
One thread, as its own page (W-C; #212, #320; r4, r9). The top bar's
breadcrumb names it and its page crumb returns to the list, and the page's
own head and tabs step aside. Its head reads like a letter's: the 28px
title on the left; "Turn into a task", "Resolve" and the "…" menu (Rename,
Move to Trash) on the right; a rule under it. It says nothing the posts
already show.

"Turn into a task" is an open thread's main act (M4 §4.4): talk that has
found its task ends there. One press creates the task, titled as the thread,
at the foot of the page's Work (`POST /tasks` appends a folder's new task to
its composed page) and links the thread to it (`PATCH` `task_id`, M5). The
thread stays open: from then on it is the task's conversation, where anyone
who may comment keeps talking about the task (a resolved thread takes no
posts). A thread about a task (made by "Discuss" on the task, or linked
here) shows the task under its title, one plain row with its state mark,
name and state, and is not offered the act again. The
two are separate writes, in that order, because each has its own route: a
failure of the link leaves the task standing, unlinked, and says so ("The
task was made. The thread was not linked to it."), never the generic
"Nothing was saved". The task is filed into the section the foot of
Work belongs to, so it folds and moves with the heading it sits under. There is no Undo of the
whole act: the task's own delete undoes it, and a deleted task stops showing
under the thread. A retry after a failed
step goes on from that step (the view remembers the task it made), so it
never makes a second task. The General discussion is never converted: it is the page's
catch-all, not one subject.

The thread fills the window: the posts read from the top, the history
scrolls in its own region, and the composer stays at the window's foot. "Resolve" puts one optional line, "What was decided?",
where the composer was (empty resolves without a decision, Wave 2 decision
3). A resolved or trashed thread takes no writes (the server answers 409
`discussion_frozen`), so it has no composer: a short block under the title
says "Resolved <date> by <name>" and the decision if any, with Reopen. Move to Trash asks
nothing: the thread goes back to the list at once and the undo bar brings it
back. Server state names are unchanged (`resolved`).

On a desktop the cursor lands in the composer, as Slack's does; a phone's
keyboard is not opened uninvited. Escape, from anywhere but a field holding
writing or an open menu, goes back to the list, which puts its focus back on
this thread's row.

Near-live: the posts re-read every few seconds and the thread's own row every
fifteen (`api/consultation.ts`). Opening the thread, and every new post seen
while it is on screen, marks it read for this person on every device. It
opens at the first post from someone else since the last read, else at the
end.

Which acts are drawn is `discussionPowers`; none of it is authorization. The
General discussion is never offered Move to Trash here (the route decides).
*/
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router'
import type { QueryClient } from '@tanstack/react-query'

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
import { useCreateTask } from '../../api/mutations.js'
import { ApiError, getPlain, mutateApi, OfflineError } from '../../api/http.js'
import { queryKeys } from '../../api/keys.js'
import { writeFailureMessage } from '../../api/queryClient.js'
import { showToast } from '../../state/toasts.js'
import { formatDate } from '../../lib/dates.js'
import { folderGates, mayDraw } from '../../lib/folder-authority.js'
import { Check, MoreHorizontal } from '../../lib/icons.js'
import type { PersonResolver, ThreadAuthority } from '../../lib/thread.js'
import { pushUndo, undoLabel } from '../../shell/undo.js'
import { DISCUSSION_TITLE_MAX, discussionSchema, OUTCOME_STATEMENT_MAX } from '../../../shared/consultation.js'
import type { Discussion } from '../../../shared/consultation.js'
import { paths } from '../../routes.js'
import { STATE_WORD, StateMark, taskState } from '../thread/timeline/state.js'
import { getPageResponse } from '../../../shared/pages.js'
import { TASK_TITLE_LIMIT } from '../../../shared/tasks.js'
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
  const createTask = useCreateTask()
  const client = useQueryClient()
  const [turning, setTurning] = useState(false)
  /* What a conversion has already done in this view, so a retry after a
     failed step goes on from that step instead of making a second task. */
  const made = useRef<{ taskId: string } | null>(null)
  /* After a conversion resolves the thread its button is gone; the focus
     goes to Reopen, which takes its place. */
  const [closing, setClosing] = useState(false)
  const [box, height] = useFillHeight()
  const [renaming, setRenaming] = useState(false)
  const [pointer] = useState(() => globalThis.matchMedia?.('(pointer: fine)').matches ?? false)
  /* Where the reading starts: the last read as it stood when the thread
     opened, before this visit marks it. */
  const [openAt] = useState<string | null>(() => d.read_at ?? null)

  /* On the document, so an Escape with nothing focused (after a click on the
     page) leaves too; one aimed elsewhere (the sidebar, a dialog) does not. */
  useEffect(() => {
    const leave = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement
      if (target !== document.body && !box.current?.contains(target)) return
      if (leavesThread(event)) onBack()
    }
    document.addEventListener('keydown', leave)
    return () => { document.removeEventListener('keydown', leave) }
  }, [box, onBack])

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
  /* It writes two things, so it is drawn only for someone who may do both:
     create a task here and link this thread to it. A thread already linked
     to a task is not offered it, even while that task is in Trash (the link
     is set once). */
  const convertible =
    d.state === 'open' && !trashed && powers.edit && !d.is_general && d.task_id === null && viewer !== null && mayDraw(viewer.facts, 'task.create')

  const refused = (error: unknown): void => {
    if (error instanceof ApiError && (error.status === 403 || error.status === 409)) onRefused()
  }

  const turnIntoTask = async (): Promise<void> => {
    if (turning) return
    setTurning(true)
    try {
      if (made.current === null) {
        const section = await footSection(client, folderId)
        const task = await createTask.mutateAsync({
          title: d.title.slice(0, TASK_TITLE_LIMIT),
          folder_id: folderId,
          ...(section === null ? {} : { section_block_id: section }),
        })
        made.current = { taskId: task.id }
      }
    } catch (error) {
      /* Nothing was made: the mutation cache's own toast says so, truly. */
      refused(error)
      setTurning(false)
      return
    }
    /* A task now exists, so the generic "Nothing was saved" would be false:
       the link is a plain write that speaks for itself when it fails. The
       link is the thread's own `task_id`, drawn under its title and on the
       task page, both ways. The thread stays open: it is now the task's
       conversation, and a resolved thread takes no posts (M5). */
    try {
      await mutateApi(discussionSchema, {
        method: 'PATCH',
        path: `/discussions/${d.id}`,
        body: { task_id: made.current.taskId },
      })
      made.current = null
    } catch (error) {
      refused(error)
      showToast(
        error instanceof ApiError && (error.status === 403 || error.status === 409)
          ? writeFailureMessage(error)
          : error instanceof OfflineError
            ? "The task was made. The thread was not linked to it: you're offline."
            : 'The task was made. The thread was not linked to it. Try again.',
      )
    } finally {
      void client.invalidateQueries()
      setTurning(false)
    }
  }

  const moveToTrash = (): void => {
    /* Back to the list first, so nothing on screen reads the thread it just
       sent away; the undo bar restores it. */
    onBack()
    trash(d.id)
    pushUndo(undoLabel('Moved to Trash', d.title), () => { restore.mutate(d.id) })
  }

  const today = localDay(new Date().toISOString())
  const resolved = d.state === 'resolved'
  /* Closed: a short block under the title says how it ended (and the
     decision, if one was given), with Reopen beside it. */
  const closedNote = frozen ? (
    <div className="mt-4 flex min-w-0 shrink-0 items-start gap-3 rounded-md border border-border px-3 py-2">
      <div className="min-w-0 flex-1 text-sm">
        <p className="text-muted-foreground">
          {trashed
            ? 'This thread is in Trash.'
            : `Resolved${closedAt !== null ? ` ${formatDate(localDay(closedAt), today)}` : ''}${closedBy !== null ? ` by ${personOf(closedBy).name}` : ''}`}
        </p>
        {!trashed && outcome !== null && outcome.statement !== '' ? (
          <p className="mt-0.5 break-words whitespace-pre-wrap text-foreground">{outcome.statement}</p>
        ) : null}
      </div>
      {resolved && powers.reopen && !trashed ? (
        <Button type="button" variant="ghost" size="sm" className="-my-0.5 shrink-0" disabled={reopen.isPending} onClick={() => { reopen.mutate(d.id) }}>
          Reopen
        </Button>
      ) : null}
    </div>
  ) : null

  const hasMenu = (powers.edit && !frozen) || trashable
  return (
    <div
      ref={box}
      className="flex min-w-0 flex-col"
      style={height === null ? undefined : { height }}
    >
      {/* A letter's head: the 28px title on the left, the acts on the right. */}
      <header className="flex min-w-0 shrink-0 items-start gap-2 pt-4 max-md:flex-wrap max-md:pt-2">
        {renaming ? (
          <Rename discussion={d} onDone={() => { setRenaming(false) }} />
        ) : (
          <h1 data-page-title="" className="line-clamp-2 min-w-0 flex-1 break-words text-[length:var(--text-title-size)] leading-[var(--text-title-line)] font-title text-foreground">{d.title}</h1>
        )}
        {/* On a phone the acts take their own line under the title, so the
            title is never squeezed to a few letters. */}
        <div className="mt-1 ml-auto flex shrink-0 items-center gap-2 max-md:ml-0 max-md:w-full">
          {convertible && !closing ? (
            <Button type="button" disabled={turning} onClick={() => void turnIntoTask()}>Turn into a task</Button>
          ) : null}
          {resolvable && !closing ? (
            <Button type="button" variant="outline" disabled={turning} onClick={() => { setClosing(true) }}>
              <Check className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
              Resolve
            </Button>
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
      {d.task !== null ? (
        /* The task it is about: one plain row, its mark, name and state. */
        <p className="mt-3.5 shrink-0 text-sm">
          <Link
            to={paths.task(d.task.id)}
            className="-mx-2.5 flex max-w-full min-w-0 items-center gap-2.5 rounded-md px-2.5 py-2 outline-none hover:bg-accent"
          >
            <StateMark state={taskState(d.task)} className="size-4 shrink-0" />
            <span className="min-w-0 truncate font-medium text-foreground">{d.task.title}</span>
            <span className="shrink-0 text-muted-foreground">{STATE_WORD[taskState(d.task)]}</span>
          </Link>
        </p>
      ) : null}
      {closedNote}
      {d.context !== null && d.context !== '' ? (
        <p className="mt-2 shrink-0 text-sm break-words whitespace-pre-wrap text-muted-foreground">{d.context}</p>
      ) : null}
      {/* The rule under the head, as a letter's. */}
      <div aria-hidden="true" className="mt-6 mb-2 h-px shrink-0 bg-border" />

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
        focusOnLand={pointer}
        openAt={justStarted ? undefined : openAt}
        onRefused={refused}
        post={(body) => postComment.mutateAsync({ discussionId: d.id, body, taskId: d.task_id })}
        {...(frozen
          ? { closed: null }
          : closing
            ? { closed: <CloseThread discussion={d} onDone={() => { setClosing(false) }} /> }
            : {})}
      />
    </div>
  )
}

/* The section the foot of Work belongs to, so a task added there is filed
   into it (as a task typed at the end of a section is) rather than drawn
   under the last heading while belonging to none: the last item's own
   section, or the last item itself when it is a section heading. */
async function footSection(client: QueryClient, folderId: string): Promise<string | null> {
  const page = await client.fetchQuery({
    queryKey: queryKeys.folderPage(folderId),
    queryFn: () => getPlain(getPageResponse, `/folders/${folderId}/page`),
  })
  const last = page.items.at(-1)
  if (last === undefined) return null
  if (last.kind === 'task') return page.task_placements?.find((t) => t.id === last.id)?.section_block_id ?? null
  const block = page.blocks.find((b) => b.id === last.id)
  if (block === undefined) return null
  return block.kind === 'section' ? block.id : block.section_block_id
}

/** Escape goes back to the list unless something nearer wants it: a field's
 * own Escape (rename, resolve, an edit), an open menu or dialog, or a
 * composer that holds writing. */
function leavesThread(event: KeyboardEvent): boolean {
  if (event.key !== 'Escape') return false
  if (document.querySelector('[role="menu"], [role="dialog"], [role="alertdialog"], .bn-suggestion-menu, .bn-formatting-toolbar') !== null) return false
  const target = event.target as HTMLElement
  if (target.closest('input, textarea, select') !== null) return false
  const editor = target.closest<HTMLElement>('[data-post-editor]')
  /* The editor spends every Escape itself (it prevents the default), so
     only a new post that holds nothing gives it up. */
  if (editor === null) return !event.defaultPrevented
  if (editor.dataset.postEditor !== 'new') return false
  const text = editor.textContent?.trim() ?? ''
  return text === '' && editor.querySelector('img, video, audio, [data-content-type="file"]') === null
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
      className="min-w-0 flex-1 bg-transparent text-[length:var(--text-title-size)] leading-8 font-title text-foreground outline-none"
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
