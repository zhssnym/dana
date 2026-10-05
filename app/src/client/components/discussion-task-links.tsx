// Links between a task and its discussions, from either side. The link is a
// many-to-many edge; neither end owns the other.
import { useMemo, useRef, useState, type RefObject } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router'

import {
  DISCUSSION_TITLE_MAX,
  linkDiscussionTaskResponse,
  type Discussion,
} from '../../shared/consultation.js'
import { TASK_TITLE_LIMIT, type TaskLinkedDiscussion } from '../../shared/tasks.js'
import { getPageResponse } from '../../shared/pages.js'
import {
  useCreateDiscussion,
  useDiscussions,
  useDiscussTask,
  useUpdateDiscussion,
} from '../api/consultation.js'
import { useCreateTask } from '../api/mutations.js'
import { useFolderOpenTasks, useReferenceSearch, useTask } from '../api/queries.js'
import { ApiError, getPlain, mutateApi, OfflineError } from '../api/http.js'
import { queryKeys } from '../api/keys.js'
import { writeFailureMessage } from '../api/queryClient.js'
import { showToast } from '../state/toasts.js'
import { openChatDock } from '../state/chat-dock.js'
import { paths } from '../routes.js'
import { Plus, X } from '../lib/icons.js'
import { PROPERTY_LABEL, PROPERTY_ROW } from './task-pickers.js'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover.js'
import { cn } from './ui/utils.js'
import { StateMark, STATE_WORD, taskState } from './thread/timeline/state.js'

const INITIAL_LIMIT = 7

async function addEdge(discussionId: string, taskId: string): Promise<void> {
  await mutateApi(linkDiscussionTaskResponse, {
    method: 'POST',
    path: `/discussions/${discussionId}/tasks`,
    body: { task_id: taskId },
  })
}

async function removeEdge(discussionId: string, taskId: string): Promise<void> {
  await mutateApi(null, {
    method: 'DELETE',
    path: `/discussions/${discussionId}/tasks/${taskId}`,
  })
}

function relationFailure(error: unknown, fallback: string): string {
  if (error instanceof ApiError && (error.status === 403 || error.status === 409 || error.status === 422)) {
    return writeFailureMessage(error)
  }
  if (error instanceof OfflineError) return `${fallback}: you're offline.`
  return `${fallback}. Try again.`
}

export function TaskDiscussionLinks({
  taskId,
  taskTitle,
  folderId,
  mayStart,
}: {
  readonly taskId: string
  readonly taskTitle: string
  readonly folderId: string | null
  readonly mayStart: boolean
}): React.JSX.Element {
  if (folderId === null) {
    return (
      <div className={cn(PROPERTY_ROW, 'hover:bg-transparent')}>
        <span className={PROPERTY_LABEL}>Discussion</span>
        <span className="truncate text-muted-foreground">None</span>
      </div>
    )
  }
  return <TaskDiscussionPicker taskId={taskId} taskTitle={taskTitle} folderId={folderId} mayStart={mayStart} />
}

function TaskDiscussionPicker({
  taskId,
  taskTitle,
  folderId,
  mayStart,
}: {
  readonly taskId: string
  readonly taskTitle: string
  readonly folderId: string
  readonly mayStart: boolean
}): React.JSX.Element {
  const client = useQueryClient()
  const detail = useTask(taskId)
  const discuss = useDiscussTask()
  const create = useCreateDiscussion()
  const update = useUpdateDiscussion()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [working, setWorking] = useState<string | null>(null)
  const [added, setAdded] = useState<ReadonlySet<string>>(new Set())
  // If create succeeded but linking failed, the next press retries the same
  // discussion instead of making a duplicate.
  const retry = useRef<{ discussion: Discussion; tabId: string | null } | null>(null)
  const linked = detail.data?.linked_discussions ?? []
  const linkedIds = useMemo(
    () => new Set([...linked.map((discussion) => discussion.id), ...added]),
    [linked, added],
  )
  const list = useDiscussions(folderId, 'open', q)
  const candidates = (list.data?.pages.flatMap((page) => page.discussions) ?? [])
    .filter((discussion) => !discussion.is_general && !linkedIds.has(discussion.id))
    .slice(0, INITIAL_LIMIT)
  const busy = detail.isPending || discuss.isPending || create.isPending || update.isPending || working !== null
  const openThread = (id: string): void => {
    openChatDock({ folderId, discussionId: id })
  }

  const settled = (): void => {
    // A link changes the discussion, the task and every list showing either, so
    // invalidate everything.
    void client.invalidateQueries()
  }

  const linkExisting = async (discussion: Discussion): Promise<void> => {
    if (busy) return
    setWorking(discussion.id)
    try {
      await addEdge(discussion.id, taskId)
      setAdded((current) => new Set([...current, discussion.id]))
      settled()
    } catch (error) {
      showToast(relationFailure(error, 'The discussion was not linked'))
    } finally {
      setWorking(null)
    }
  }

  const unlink = async (discussion: TaskLinkedDiscussion): Promise<void> => {
    if (busy) return
    setWorking(discussion.id)
    try {
      await removeEdge(discussion.id, taskId)
      setAdded((current) => {
        const next = new Set(current)
        next.delete(discussion.id)
        return next
      })
      settled()
    } catch (error) {
      showToast(relationFailure(error, 'The discussion was not unlinked'))
    } finally {
      setWorking(null)
    }
  }

  const finishNew = async (discussion: Discussion, tabId: string | null): Promise<void> => {
    setWorking(discussion.id)
    try {
      await addEdge(discussion.id, taskId)
      retry.current = null
      setAdded((current) => new Set([...current, discussion.id]))
      settled()
      setOpen(false)
      setQ('')
      openThread(discussion.id)
    } catch (error) {
      retry.current = { discussion, tabId }
      showToast(relationFailure(error, 'The discussion was created but was not linked'))
    } finally {
      setWorking(null)
    }
  }

  const startNew = async (): Promise<void> => {
    if (!mayStart || busy) return
    if (retry.current !== null) {
      await finishNew(retry.current.discussion, retry.current.tabId)
      return
    }

    const title = (q.trim() || taskTitle).slice(0, DISCUSSION_TITLE_MAX)
    try {
      // This route ensures the project's Discussion tab and creates and links the
      // convenience thread atomically.
      const convenience = await discuss.mutateAsync(taskId)
      const alreadyLinked = linkedIds.has(convenience.discussion.id)

      if (!alreadyLinked) {
        let discussion = convenience.discussion
        if (q.trim() !== '' && discussion.title !== title) {
          try {
            discussion = await update.mutateAsync({ id: discussion.id, body: { title } })
          } catch {
            // Already linked; the mutation toast reports the failed rename.
          }
        }
        setAdded((current) => new Set([...current, discussion.id]))
        settled()
        setOpen(false)
        setQ('')
        openThread(discussion.id)
        return
      }

      // The convenience link already exists, so Create means an additional discussion.
      const discussion = await create.mutateAsync({ folderId, body: { title } })
      await finishNew(discussion, convenience.tabId)
    } catch {
      // The mutation cache shows the failure toast.
    }
  }

  if (linked.length === 0 && !mayStart) {
    return (
      <div className={cn(PROPERTY_ROW, 'hover:bg-transparent')}>
        <span className={PROPERTY_LABEL}>Discussion</span>
        <span className="truncate text-muted-foreground">None</span>
      </div>
    )
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setQ('')
      }}
    >
      <PopoverTrigger
        render={
          <button
            type="button"
            className={PROPERTY_ROW}
            aria-label={linked.length === 0 ? 'Start or link a discussion' : 'Manage linked discussions'}
            onClick={(event) => event.stopPropagation()}
          />
        }
      >
        <span className={PROPERTY_LABEL}>Discussion</span>
        {linked.length === 0 ? (
          <span className="truncate text-muted-foreground">Start a discussion</span>
        ) : (
          <span className="flex min-w-0 items-center gap-1 overflow-hidden">
            <span className="max-w-56 truncate rounded-sm bg-muted px-1.5 py-0.5 text-xs text-foreground">
              {linked[0]!.title}
            </span>
            {linked.length > 1 ? <span className="shrink-0 text-xs text-muted-foreground">+{linked.length - 1}</span> : null}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 max-w-[calc(100vw-2rem)] p-1" aria-label="Discussion picker">
        {mayStart ? (
          <input
            autoFocus
            aria-label="Search or start a discussion"
            placeholder="Search or start a discussion…"
            value={q}
            disabled={busy}
            onChange={(event) => setQ(event.target.value)}
            className="m-1 h-8 w-[calc(100%-0.5rem)] rounded-sm border border-input bg-background px-2 text-sm outline-none focus:border-ring"
          />
        ) : null}

        {linked.length > 0 ? (
          <div className="border-b border-border pb-1">
            <p className="px-2 py-1 text-[11px] font-medium text-muted-foreground">Linked</p>
            {linked.map((discussion) => (
              <div key={discussion.id} className="group/link flex min-h-8 items-center gap-1 rounded-sm px-2 hover:bg-accent">
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate text-left text-sm text-foreground"
                  onClick={() => {
                    setOpen(false)
                    openThread(discussion.id)
                  }}
                >
                  {discussion.title}
                </button>
                <span className="shrink-0 text-[11px] text-muted-foreground">{discussion.state === 'resolved' ? 'Resolved' : 'Open'}</span>
                <button
                  type="button"
                  aria-label={`Unlink ${discussion.title}`}
                  title="Unlink"
                  disabled={busy}
                  onClick={() => void unlink(discussion)}
                  className="inline-flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground opacity-0 hover:bg-background hover:text-foreground focus-visible:opacity-100 group-hover/link:opacity-100 pointer-coarse:opacity-100"
                >
                  <X className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        ) : null}

        {mayStart ? (
          <>
            <div className="py-1">
              {candidates.map((discussion) => (
                <button
                  key={discussion.id}
                  type="button"
                  disabled={busy}
                  onClick={() => void linkExisting(discussion)}
                  className="flex min-h-8 w-full items-center gap-2 rounded-sm px-2 text-left hover:bg-accent disabled:opacity-50"
                >
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">{discussion.title}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">Link</span>
                </button>
              ))}
              {list.isPending ? <p className="px-2 py-2 text-xs text-muted-foreground">Loading discussions…</p> : null}
              {!list.isPending && candidates.length === 0 ? (
                <p className="px-2 py-2 text-xs text-muted-foreground">{q.trim() ? 'No matching discussions.' : 'No other open discussions.'}</p>
              ) : null}
            </div>
            <div className="border-t border-border pt-1">
              <button
                type="button"
                disabled={busy}
                onClick={() => void startNew()}
                className="flex min-h-8 w-full items-center gap-2 rounded-sm px-2 text-left text-sm text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
              >
                <Plus className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
                <span className="truncate">
                  {retry.current !== null
                    ? `Retry linking “${retry.current.discussion.title}”`
                    : q.trim()
                      ? `Start “${q.trim()}”`
                      : 'Start a new discussion'}
                </span>
              </button>
            </div>
          </>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

// Opened from the thread's "…" menu and anchored to it. `folderId` is the
// thread's project, whose Work a new task joins.
export function DiscussionTaskPicker({
  discussion,
  folderId,
  canCreate,
  open,
  onOpenChange,
  anchor,
}: {
  readonly discussion: Discussion
  readonly folderId: string
  readonly canCreate: boolean
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly anchor: RefObject<HTMLElement | null>
}): React.JSX.Element {
  const client = useQueryClient()
  const nearby = useFolderOpenTasks(folderId, open)
  const create = useCreateTask()
  const setOpen = onOpenChange
  const [q, setQ] = useState('')
  const [working, setWorking] = useState<string | null>(null)
  const [added, setAdded] = useState<ReadonlySet<string>>(new Set())
  const [retry, setRetry] = useState<{ id: string; title: string } | null>(null)
  const searching = q.trim().length >= 2
  const search = useReferenceSearch(q, folderId)
  const linkedIds = useMemo(
    () => new Set([...discussion.linked_tasks.map((task) => task.id), ...added]),
    [discussion.linked_tasks, added],
  )
  const candidates = (searching
    ? (search.data?.results ?? [])
        .filter((result) => result.kind === 'task')
        .map((result) => ({ id: result.id, title: result.label }))
    : [...(nearby.data?.unscheduled ?? []), ...(nearby.data?.scheduled ?? [])].map((task) => ({ id: task.id, title: task.title })))
    .filter((task) => !linkedIds.has(task.id))
    .slice(0, INITIAL_LIMIT)
  const busy = create.isPending || working !== null

  const settled = (): void => {
    void client.invalidateQueries()
  }

  const link = async (taskId: string): Promise<void> => {
    if (busy) return
    setWorking(taskId)
    try {
      await addEdge(discussion.id, taskId)
      setAdded((current) => new Set([...current, taskId]))
      if (retry?.id === taskId) setRetry(null)
      setQ('')
      settled()
    } catch (error) {
      showToast(relationFailure(error, 'The task was not linked'))
    } finally {
      setWorking(null)
    }
  }

  const make = async (): Promise<void> => {
    if (!canCreate || busy) return
    if (retry !== null) {
      await link(retry.id)
      return
    }

    let made: { id: string; title: string } | null = null
    try {
      const section = await footSection(client, folderId)
      const title = (q.trim() || discussion.title).slice(0, TASK_TITLE_LIMIT)
      const task = await create.mutateAsync({
        title,
        folder_id: folderId,
        ...(section === null ? {} : { section_block_id: section }),
      })
      made = { id: task.id, title: task.title }
      setWorking(task.id)
      await addEdge(discussion.id, task.id)
      setAdded((current) => new Set([...current, task.id]))
      setQ('')
      settled()
    } catch (error) {
      if (made !== null) {
        setRetry(made)
        showToast(relationFailure(error, 'The task was made but was not linked'))
      }
      // Before the task exists, useCreateTask shows the failure toast.
    } finally {
      setWorking(null)
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setQ('')
      }}
    >
      <PopoverContent anchor={anchor} align="end" className="w-80 max-w-[calc(100vw-2rem)] p-1" aria-label="Task picker">
        <input
          autoFocus
          aria-label="Search or create a task"
          placeholder="Search or create a task…"
          value={q}
          disabled={busy}
          onChange={(event) => setQ(event.target.value)}
          className="m-1 h-8 w-[calc(100%-0.5rem)] rounded-sm border border-input bg-background px-2 text-sm outline-none focus:border-ring"
        />
        <div className="py-1">
          {candidates.map((task) => (
            <button
              key={task.id}
              type="button"
              disabled={busy}
              onClick={() => void link(task.id)}
              className="flex min-h-8 w-full items-center gap-2 rounded-sm px-2 text-left hover:bg-accent disabled:opacity-50"
            >
              <span className="min-w-0 flex-1 truncate text-sm text-foreground">{task.title}</span>
              <span className="shrink-0 text-[11px] text-muted-foreground">Link</span>
            </button>
          ))}
          {(searching ? search.isPending : nearby.isPending) ? <p className="px-2 py-2 text-xs text-muted-foreground">Loading tasks…</p> : null}
          {!(searching ? search.isPending : nearby.isPending) && candidates.length === 0 ? (
            <p className="px-2 py-2 text-xs text-muted-foreground">{q.trim() ? 'No matching tasks.' : 'No other open tasks.'}</p>
          ) : null}
        </div>
        {canCreate ? (
          <div className="border-t border-border pt-1">
            <button
              type="button"
              disabled={busy}
              onClick={() => void make()}
              className="flex min-h-8 w-full items-center gap-2 rounded-sm px-2 text-left text-sm text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
            >
              <Plus className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
              <span className="truncate">
                {retry !== null
                  ? `Retry linking “${retry.title}”`
                  : q.trim()
                    ? `Create “${q.trim()}”`
                    : 'Create a new task'}
              </span>
            </button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

export function DiscussionLinkedTasks({
  discussion,
  canUnlink,
}: {
  readonly discussion: Discussion
  readonly canUnlink: boolean
}): React.JSX.Element | null {
  const client = useQueryClient()
  const [working, setWorking] = useState<string | null>(null)
  if (discussion.linked_tasks.length === 0) return null

  const unlink = async (taskId: string): Promise<void> => {
    if (working !== null) return
    setWorking(taskId)
    try {
      await removeEdge(discussion.id, taskId)
      void client.invalidateQueries()
    } catch (error) {
      showToast(relationFailure(error, 'The task was not unlinked'))
    } finally {
      setWorking(null)
    }
  }

  return (
    // Unlink shows on hover or focus (always on touch) and removes only the link.
    <ul className="shrink-0 text-sm" aria-label="Linked tasks">
      {discussion.linked_tasks.map((task) => {
        const state = taskState(task)
        return (
          <li key={task.id} className="group/task -mx-2.5 flex min-w-0 items-center rounded-md hover:bg-accent">
            <Link
              to={paths.task(task.id)}
              className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md px-2.5 py-1.5 outline-none focus-visible:bg-accent"
            >
              <StateMark state={state} className="size-4 shrink-0" />
              <span className="min-w-0 truncate text-foreground">{task.title}</span>
              <span className="shrink-0 text-muted-foreground">{STATE_WORD[state]}</span>
            </Link>
            {canUnlink ? (
              <button
                type="button"
                aria-label={`Unlink ${task.title}`}
                title="Unlink"
                disabled={working !== null}
                onClick={() => void unlink(task.id)}
                className="mr-1 inline-flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground opacity-0 outline-none hover:text-foreground focus-visible:opacity-100 group-hover/task:opacity-100 pointer-coarse:size-11 pointer-coarse:opacity-100"
              >
                <X className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
              </button>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

// A new task goes at the foot of the Work, inside the last section if there is one.
async function footSection(client: ReturnType<typeof useQueryClient>, folderId: string): Promise<string | null> {
  const page = await client.fetchQuery({
    queryKey: queryKeys.folderPage(folderId),
    queryFn: () => getPlain(getPageResponse, `/folders/${folderId}/page`),
  })
  const last = page.items.at(-1)
  if (last === undefined) return null
  if (last.kind === 'task') return page.task_placements?.find((task) => task.id === last.id)?.section_block_id ?? null
  const block = page.blocks.find((item) => item.id === last.id)
  if (block === undefined) return null
  return block.kind === 'section' ? block.id : block.section_block_id
}
