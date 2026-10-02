/*
One thread, as its own page (W-C; #212, #320; r4, r9). The top bar's
breadcrumb names it and its page crumb returns to the list, and the page's
own head and tabs step aside. There is no title row: the thread's acts sit
at the top bar's right end while it is open, "Resolve" (or "Reopen") and
the "…" menu ("Turn into a task", Rename, Move to Trash). On a phone the top
bar's left end is back, the title, and "<Page> · Discussion" under it.

"Turn into a task" (issue #495) opens a compact create-or-link picker,
drawn under the "…" menu: the page's open tasks show at once, typing
searches them, and the last line creates a new task from the same input,
titled as the thread when nothing is typed, at the end of the Work of the
thread's own folder. Choosing one links it (`POST
/discussions/:id/tasks`); a thread may be about several tasks, so the act
stays offered after the first. The linked tasks sit above the posts, one
slim row each with its state mark, name and state; Unlink on a row (hover or
focus) removes only the link. A task made whose link then fails stays
standing and the picker offers to retry that link, never a second task. The
General discussion is never linked: it is the page's catch-all, not one
subject.

The thread fills the window: the posts read from the top, the history
scrolls in its own region, and the composer stays at the window's foot. "Resolve" puts one optional line, "What was decided?",
where the composer was (empty resolves without a decision, Wave 2 decision
3). A resolved or trashed thread takes no writes (the server answers 409
`discussion_frozen`), so it has no composer; the feed ends with who
resolved it, and Reopen is in the top bar. Move to Trash asks
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
import { useFolder } from '../../api/queries.js'
import { folderGates, mayDraw } from '../../lib/folder-authority.js'
import { ArrowLeft, Check, MoreHorizontal } from '../../lib/icons.js'
import type { PersonResolver, ThreadAuthority } from '../../lib/thread.js'
import { pushUndo, undoLabel } from '../../shell/undo.js'
import { DISCUSSION_TITLE_MAX, OUTCOME_STATEMENT_MAX } from '../../../shared/consultation.js'
import type { Discussion } from '../../../shared/consultation.js'
import { InlineError, SkeletonList } from '../state-patterns.js'
import { ThreadPosts } from '../thread/ThreadPosts.js'
import { Button } from '../ui/button.js'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu.js'
import { WindowBarActions, WindowBarLead } from '../window-bar.js'
import { cn } from '../ui/utils.js'
import { DiscussionLinkedTasks, DiscussionTaskPicker } from '../discussion-task-links.js'
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
  /* A phone's way back is drawn while the thread loads or fails too. */
  const lead = <ThreadLead title={discussion.data?.title ?? ''} folderId={props.folderId} onBack={props.onBack} />

  if (discussion.isPending) {
    return (
      <>
        {lead}
        <SkeletonList />
      </>
    )
  }
  if (discussion.isError) {
    const gone = discussion.error instanceof ApiError && discussion.error.status === 404
    return (
      <>
        {lead}
        {gone ? (
          <p className="text-sm text-muted-foreground">This thread is in Trash or no longer exists.</p>
        ) : (
          <InlineError onRetry={() => void discussion.refetch()} />
        )}
      </>
    )
  }
  return (
    <>
      {lead}
      <ThreadBody {...props} discussion={discussion.data} onRefused={() => void discussion.refetch()} />
    </>
  )
}

function ThreadBody(props: {
  readonly discussion: Discussion
  readonly viewer: ConsultationViewer | null
  readonly personOf: PersonResolver
  readonly justStarted: boolean
  readonly onBack: () => void
  /* A write the server refused (403, or 409 frozen): the thread changed
     under us, so read it again. */
  readonly onRefused: () => void
}): React.JSX.Element {
  const { discussion: d, viewer, personOf, justStarted, onBack, onRefused } = props
  const thread = useDiscussionThread(d.id)
  const reopen = useReopenDiscussion()
  const trash = useTrashFromThread()
  const restore = useRestoreDiscussion()
  const postComment = usePostDiscussionComment()
  const markRead = useMarkDiscussionRead()
  /* "Turn into a task" opens its picker under the "…" button. */
  const [picking, setPicking] = useState(false)
  const menuRef = useRef<HTMLButtonElement>(null)
  /* "Resolve" put its line in the composer's place. Once it resolves, the
     focus goes to Reopen, which takes Resolve's place in the top bar. */
  const [closing, setClosing] = useState(false)
  const landOnReopen = useRef(false)
  const reopenRef = useRef<HTMLButtonElement>(null)
  const [box, height] = useFillHeight()
  const [renaming, setRenaming] = useState(false)
  const [pointer] = useState(() => globalThis.matchMedia?.('(pointer: fine)').matches ?? false)
  /* Where the reading starts: the last read as it stood when the thread
     opened, before this visit marks it. */
  const [openAt] = useState<string | null>(() => d.read_at ?? null)

  /* On the document, so an Escape with nothing focused (after a click on the
     page) leaves too, as does one from the thread's own acts in the top bar;
     one aimed elsewhere (the sidebar, a dialog) does not. */
  useEffect(() => {
    const leave = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement
      if (target !== document.body && !box.current?.contains(target) && target.closest('[data-thread-bar]') === null) return
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

  const trashed = d.trashed_at !== null
  const trashable = powers.trash && !d.is_general
  const resolvable = powers.resolve && d.state === 'open' && !trashed
  /* The picker edits the thread's links, so it follows the thread's edit
     authority; creating a task there is a second capability, offered inside
     the picker only to someone who has it. */
  const relatable = d.state === 'open' && !trashed && powers.edit && !d.is_general
  const canCreateTask = viewer !== null && mayDraw(viewer.facts, 'task.create')

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

  const resolved = d.state === 'resolved'
  const hasMenu = relatable || (powers.edit && !frozen) || trashable
  const reopenable = resolved && powers.reopen && !trashed
  useEffect(() => {
    if (!resolved || !landOnReopen.current) return
    landOnReopen.current = false
    reopenRef.current?.focus()
  }, [resolved])

  /* The thread's acts sit at the right end of the top bar, only while it is
     open here. A laptop reads "Resolve" (or "Reopen"); a phone draws Resolve
     as its check alone, 44px like every touch target there. */
  const acts = (
    <div data-thread-bar="" className="flex shrink-0 items-center gap-1">
      {resolvable && !closing ? (
        <>
          <Button type="button" variant="ghost" className="text-muted-foreground hover:text-foreground max-md:hidden" onClick={() => { setClosing(true) }}>
            <Check className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
            Resolve
          </Button>
          <Button type="button" variant="ghost" aria-label="Resolve" className="size-11 text-muted-foreground md:hidden" onClick={() => { setClosing(true) }}>
            <Check className="!size-5" strokeWidth={1.75} aria-hidden="true" />
          </Button>
        </>
      ) : null}
      {reopenable ? (
        <Button ref={reopenRef} type="button" variant="ghost" className="text-muted-foreground hover:text-foreground max-md:h-11" disabled={reopen.isPending} onClick={() => { reopen.mutate(d.id) }}>
          Reopen
        </Button>
      ) : null}
      {hasMenu ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                ref={menuRef}
                type="button"
                aria-label="Thread actions"
                className="flex size-[var(--control-height)] shrink-0 items-center justify-center rounded-sm text-muted-foreground outline-none hover:bg-accent hover:text-foreground max-md:size-11"
              />
            }
          >
            <MoreHorizontal className="size-4 max-md:size-5" strokeWidth={1.75} aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {relatable ? (
              <DropdownMenuItem onClick={() => { setPicking(true) }}>{canCreateTask ? 'Turn into a task' : 'Link a task'}</DropdownMenuItem>
            ) : null}
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
  )

  return (
    <div
      ref={box}
      className="flex min-w-0 flex-col"
      style={height === null ? undefined : { height }}
    >
      <WindowBarActions order={2}>{acts}</WindowBarActions>
      {/* The topic heads the thread, so it reads as a discussion of one thing.
          On a phone the top bar already names it, so it is drawn only for a
          screen reader there; Rename takes its place while open. */}
      <h1
        data-page-title={d.title}
        className={cn(
          'line-clamp-2 min-w-0 pt-4 pb-2 font-title text-[length:var(--text-h1-size)] leading-[var(--text-h1-line)] wrap-anywhere text-foreground max-md:sr-only',
          renaming && 'sr-only',
        )}
      >
        {d.title}
      </h1>
      {renaming ? <Rename discussion={d} onDone={() => { setRenaming(false) }} /> : null}
      {relatable ? (
        <DiscussionTaskPicker
          discussion={d}
          folderId={d.folder_id}
          canCreate={canCreateTask}
          open={picking}
          onOpenChange={setPicking}
          anchor={menuRef}
        />
      ) : null}
      <DiscussionLinkedTasks discussion={d} canUnlink={relatable} />
      {trashed ? <p className="shrink-0 py-1.5 text-sm text-muted-foreground">This thread is in Trash.</p> : null}
      {d.context !== null && d.context !== '' ? (
        <p className="shrink-0 py-1.5 text-sm break-words whitespace-pre-wrap text-muted-foreground">{d.context}</p>
      ) : null}

      <ThreadPosts
        /* Attachments are stored in the thread's own folder, which the
           server checks `file_ids` against; the tab's id is refused (422). */
        folderId={d.folder_id}
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
        post={(body) => postComment.mutateAsync({ discussionId: d.id, body, taskIds: d.linked_tasks.map((task) => task.id) })}
        resolution={
          d.state === 'resolved'
            ? {
                by: d.current_outcome?.actor_id ?? d.resolved_by,
                at: d.current_outcome?.created_at ?? d.resolved_at,
                statement: d.current_outcome?.statement ?? null,
              }
            : null
        }
        {...(frozen
          ? { closed: null }
          : closing
            ? {
                closed: (
                  <CloseThread
                    discussion={d}
                    onDone={(done) => {
                      landOnReopen.current = done
                      setClosing(false)
                    }}
                  />
                ),
              }
            : {})}
      />
    </div>
  )
}

/* A phone's top bar while a thread is open: back to the list, then the
   thread's title on one line over "<Page> · Discussion". A laptop's top bar
   keeps the breadcrumb, which says the same. */
function ThreadLead({ title, folderId, onBack }: { readonly title: string; readonly folderId: string; readonly onBack: () => void }): React.JSX.Element {
  const folder = useFolder(folderId)
  const names = folder.data === undefined ? [] : [...(folder.data.ancestors ?? []).slice(-1), folder.data].map((f) => f.name)
  return (
    <WindowBarLead>
      <div data-thread-bar="" className="flex min-w-0 flex-1 items-center gap-1 md:hidden">
        <Button type="button" variant="ghost" aria-label="Back to threads" className="size-11 shrink-0 text-muted-foreground" onClick={onBack}>
          <ArrowLeft className="!size-5" strokeWidth={1.75} aria-hidden="true" />
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-foreground" title={title}>{title}</p>
          {names.length > 0 ? <p className="truncate text-xs text-muted-foreground">{names.join(' · ')}</p> : null}
        </div>
      </div>
    </WindowBarLead>
  )
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

/** Rename, from the "…" menu: the title as a field in a slim row above the
 * posts; Enter or leaving it saves, Escape leaves it unchanged. */
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
      className="mb-2 h-10 w-full min-w-0 shrink-0 rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-ring max-md:h-11"
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
function CloseThread({ discussion: d, onDone }: { readonly discussion: Discussion; readonly onDone: (resolved: boolean) => void }): React.JSX.Element {
  const resolve = useResolveDiscussion()
  const [statement, setStatement] = useState('')
  return (
    <form
      className="flex min-h-10 min-w-0 items-center gap-1 rounded-lg border border-border bg-background pr-1 pl-3 focus-within:border-ring"
      onSubmit={(event) => {
        event.preventDefault()
        const decided = statement.trim()
        resolve.mutate({ id: d.id, body: decided === '' ? {} : { statement: decided } }, { onSuccess: () => { onDone(true) } })
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
            onDone(false)
          }
        }}
      />
      <Button type="button" variant="ghost" className="max-md:h-11" onClick={() => { onDone(false) }}>
        Cancel
      </Button>
      <Button type="submit" variant="ghost" className="max-md:h-11" disabled={resolve.isPending}>
        Resolve
      </Button>
    </form>
  )
}
