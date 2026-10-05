// One open thread. A resolved or trashed thread takes no writes (409
// `discussion_frozen`), so it has no composer. Which acts are drawn is
// `discussionPowers`; none of it is authorization.
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
  /**
   * Drawn inside the Discussion sidebar: back, title and acts sit in one row and the
   * thread fills its container.
   */
  readonly docked?: boolean
}): React.JSX.Element {
  const { discussionId, docked = false } = props
  const discussion = useOpenDiscussion(discussionId)
  // A phone's way back is drawn while the thread loads or fails too.
  const lead = docked ? (
    discussion.data === undefined ? <DockedLead title="" onBack={props.onBack} /> : null
  ) : (
    <ThreadLead title={discussion.data?.title ?? ''} folderId={props.folderId} onBack={props.onBack} />
  )

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
  readonly docked?: boolean
  // A write the server refused (403, or 409 frozen): read the thread again.
  readonly onRefused: () => void
}): React.JSX.Element {
  const { discussion: d, viewer, personOf, justStarted, onBack, onRefused, docked = false } = props
  const thread = useDiscussionThread(d.id)
  const reopen = useReopenDiscussion()
  const trash = useTrashFromThread()
  const restore = useRestoreDiscussion()
  const postComment = usePostDiscussionComment()
  const markRead = useMarkDiscussionRead()
  const [picking, setPicking] = useState(false)
  const menuRef = useRef<HTMLButtonElement>(null)
  // Once resolved, focus goes to Reopen, which takes Resolve's place.
  const [closing, setClosing] = useState(false)
  const landOnReopen = useRef(false)
  const reopenRef = useRef<HTMLButtonElement>(null)
  const [box, height] = useFillHeight(!docked)
  const [renaming, setRenaming] = useState(false)
  const [pointer] = useState(() => globalThis.matchMedia?.('(pointer: fine)').matches ?? false)
  // The last read as it stood when the thread opened, before this visit marks it.
  const [openAt] = useState<string | null>(() => d.read_at ?? null)

  // On the document, so an Escape with nothing focused also leaves; one aimed at
  // the sidebar or a dialog does not.
  useEffect(() => {
    const leave = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement
      // In the dock an Escape with nothing focused belongs to the page.
      if (docked && !box.current?.contains(target)) return
      if (target !== document.body && !box.current?.contains(target) && target.closest('[data-thread-bar]') === null) return
      if (leavesThread(event)) onBack()
    }
    document.addEventListener('keydown', leave)
    return () => { document.removeEventListener('keydown', leave) }
  }, [box, onBack, docked])

  const comments = thread.data?.comments
  const newest = comments?.reduce<string>((latest, c) => (c.created_at > latest ? c.created_at : latest), '') ?? null
  // Mark read on open and for every new post seen; a hidden tab marks it when shown.
  useEffect(() => {
    if (newest === null) return
    const mark = (): void => {
      if (document.visibilityState === 'visible') markRead(d.id)
    }
    mark()
    document.addEventListener('visibilitychange', mark)
    return () => { document.removeEventListener('visibilitychange', mark) }
  }, [d.id, newest, markRead])

  // Unshared: every post is the creator's and nothing was decided. Unknown counts as
  // shared, the safe direction.
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
  // The picker follows edit authority; creating a task inside it is a separate capability.
  const relatable = d.state === 'open' && !trashed && powers.edit && !d.is_general
  const canCreateTask = viewer !== null && mayDraw(viewer.facts, 'task.create')

  const refused = (error: unknown): void => {
    if (error instanceof ApiError && (error.status === 403 || error.status === 409)) onRefused()
  }

  const moveToTrash = (): void => {
    // Back to the list first, so nothing on screen reads the trashed thread.
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

  // A phone draws Resolve as its check alone, at the 44px touch size.
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
      className={cn('flex min-w-0 flex-col', docked && 'min-h-0 flex-1')}
      style={height === null ? undefined : { height }}
    >
      {docked ? (
        <DockedLead title={renaming ? '' : d.title} onBack={onBack}>{acts}</DockedLead>
      ) : (
        <WindowBarActions order={2}>{acts}</WindowBarActions>
      )}
      {/* A phone's top bar already names the thread, so the heading is screen-reader only there. */}
      <h1
        data-page-title={d.title}
        className={cn(
          'line-clamp-2 min-w-0 pt-4 pb-2 font-title text-[length:var(--text-h1-size)] leading-[var(--text-h1-line)] wrap-anywhere text-foreground max-md:sr-only',
          (renaming || docked) && 'sr-only',
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
        // Attachments are stored in the thread's own folder; the server refuses the tab's id (422).
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

// A phone's top bar while a thread is open. A laptop keeps the breadcrumb.
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

function DockedLead({ title, onBack, children }: { readonly title: string; readonly onBack: () => void; readonly children?: React.ReactNode }): React.JSX.Element {
  return (
    <div data-thread-bar="" className="flex min-w-0 shrink-0 items-center gap-1 pb-2">
      <Button type="button" variant="ghost" size="icon" aria-label="Back to threads" className="-ml-1.5 shrink-0 text-muted-foreground hover:text-foreground" onClick={onBack}>
        <ArrowLeft className="size-4" strokeWidth={1.75} aria-hidden="true" />
      </Button>
      <p className="min-w-0 flex-1 truncate text-sm font-title text-foreground" title={title}>{title}</p>
      {children}
    </div>
  )
}

/**
 * Escape goes back to the list unless a field, an open menu or dialog, or a
 * composer holding writing wants it.
 */
function leavesThread(event: KeyboardEvent): boolean {
  if (event.key !== 'Escape') return false
  if (document.querySelector('[role="menu"], [role="dialog"], [role="alertdialog"], .bn-suggestion-menu, .bn-formatting-toolbar') !== null) return false
  const target = event.target as HTMLElement
  if (target.closest('input, textarea, select') !== null) return false
  const editor = target.closest<HTMLElement>('[data-post-editor]')
  // The editor prevents every Escape itself, so only an empty new post gives it up.
  if (editor === null) return !event.defaultPrevented
  if (editor.dataset.postEditor !== 'new') return false
  const text = editor.textContent?.trim() ?? ''
  return text === '' && editor.querySelector('img, video, audio, [data-content-type="file"]') === null
}

/** Fill the window below the thread's top, so history scrolls in its own region. */
function useFillHeight(enabled = true): [React.RefObject<HTMLDivElement | null>, number | null] {
  const box = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState<number | null>(null)
  useLayoutEffect(() => {
    const el = box.current
    const scroller = enabled ? el?.closest<HTMLElement>('[data-shell-scroll]') : null
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
  }, [enabled])
  return [box, height]
}

/** Enter or blur saves, Escape cancels. */
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

/** Resolve's optional decision line, in the composer's frame. */
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
