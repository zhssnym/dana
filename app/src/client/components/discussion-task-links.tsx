/*
Issue #495: one compact relation interaction from either side.

A Task keeps its existing Discussion property. Opening it immediately shows
recent Discussions, filters them as the person types, and offers creation in
the same surface. A Discussion keeps "Turn into a task" as its one visible
entry point and uses the same pattern for Tasks. The relationship itself is
#497's persisted many-to-many edge; this file never treats either endpoint as
owned by the other.
*/
import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router'

import {
  DISCUSSION_TITLE_MAX,
  linkDiscussionTaskResponse,
  type Discussion,
} from '../../shared/consultation.js'
import { TASK_TITLE_LIMIT, type TaskLinkedDiscussion } from '../../shared/tasks.js'
import { getPageResponse } from '../../shared/pages.js'
import { useCreateDiscussion, useDiscussions } from '../api/consultation.js'
import { useCreateTask } from '../api/mutations.js'
import { useFolderOpenTasks, useReferenceSearch, useTask } from '../api/queries.js'
import { ApiError, getPlain, mutateApi, OfflineError } from '../api/http.js'
import { queryKeys } from '../api/keys.js'
import { writeFailureMessage } from '../api/queryClient.js'
import { showToast } from '../state/toasts.js'
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

/* ------------------------------------------------------------------ Task */

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
  const navigate = useNavigate()
  const detail = useTask(taskId)
  const create = useCreateDiscussion()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [working, setWorking] = useState<string | null>(null)
  const [added, setAdded] = useState<ReadonlySet<string>>(new Set())
  const linked = detail.data?.linked_discussions ?? []
  const linkedIds = useMemo(
    () => new Set([...linked.map((discussion) => discussion.id), ...added]),
    [linked, added],
  )
  const list = useDiscussions(folderId, 'open', q)
  const candidates = (list.data?.pages.flatMap((page) => page.discussions) ?? [])
    .filter((discussion) => !discussion.is_general && !linkedIds.has(discussion.id))
    .slice(0, INITIAL_LIMIT)
  const busy = create.isPending || working !== null
  const threadAt = (id: string): string => `${paths.folder(folderId)}?discussion=${id}`

  const linkExisting = async (discussion: Discussion): Promise<void> => {
    if (busy) return
    setWorking(discussion.id)
    try {
      await addEdge(discussion.id, taskId)
      setAdded((current) => new Set([...current, discussion.id]))
      void client.invalidateQueries({ queryKey: queryKeys.task(taskId) })
      void client.invalidateQueries({ queryKey: queryKeys.discussion(discussion.id) })
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
      await client.invalidateQueries({ queryKey: queryKeys.task(taskId) })
      void client.invalidateQueries({ queryKey: queryKeys.discussion(discussion.id) })
    } catch (error) {
      showToast(relationFailure(error, 'The discussion was not unlinked'))
    } finally {
      setWorking(null)
    }
  }

  const startNew = async (): Promise<void> => {
    if (!mayStart || busy) return
    const title = (q.trim() || taskTitle).slice(0, DISCUSSION_TITLE_MAX)
    try {
      const discussion = await create.mutateAsync({ folderId, body: { title } })
      setWorking(discussion.id)
      try {
        await addEdge(discussion.id, taskId)
        void client.invalidateQueries({ queryKey: queryKeys.task(taskId) })
        void client.invalidateQueries({ queryKey: queryKeys.discussion(discussion.id) })
        setOpen(false)
        setQ('')
        void navigate(threadAt(discussion.id))
      } catch (error) {
        showToast(relationFailure(error, 'The discussion was created but was not linked'))
      } finally {
        setWorking(null)
      }
    } catch {
      /* useCreateDiscussion owns its normal mutation failure toast. */
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
                    void navigate(threadAt(discussion.id))
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
                  className="inline-flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground opacity-0 hover:bg-background hover:text-foreground focus-visible:opacity-100 group-hover/link:opacity-100"
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
                <span className="truncate">{q.trim() ? `Start “${q.trim()}”` : 'Start a new discussion'}</span>
              </button>
            </div>
          </>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

/* ------------------------------------------------------------ Discussion */

export function DiscussionTaskAction({
  discussion,
  folderId,
  canRelate,
  canCreate,
}: {
  readonly discussion: Discussion
  readonly folderId: string
  readonly canRelate: boolean
  readonly canCreate: boolean
}): React.JSX.Element | null {
  if (!canRelate) return null
  return <DiscussionTaskPicker discussion={discussion} folderId={folderId} canCreate={canCreate} />
}

function DiscussionTaskPicker({
  discussion,
  folderId,
  canCreate,
}: {
  readonly discussion: Discussion
  readonly folderId: string
  readonly canCreate: boolean
}): React.JSX.Element {
  const client = useQueryClient()
  const nearby = useFolderOpenTasks(folderId)
  const create = useCreateTask()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [working, setWorking] = useState<string | null>(null)
  const [added, setAdded] = useState<ReadonlySet<string>>(new Set())
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

  const link = async (taskId: string): Promise<void> => {
    if (busy) return
    setWorking(taskId)
    try {
      await addEdge(discussion.id, taskId)
      setAdded((current) => new Set([...current, taskId]))
      setQ('')
      void client.invalidateQueries({ queryKey: queryKeys.discussion(discussion.id) })
      void client.invalidateQueries({ queryKey: queryKeys.task(taskId) })
    } catch (error) {
      showToast(relationFailure(error, 'The task was not linked'))
    } finally {
      setWorking(null)
    }
  }

  const make = async (): Promise<void> => {
    if (!canCreate || busy) return
    let madeId: string | null = null
    try {
      const section = await footSection(client, folderId)
      const task = await create.mutateAsync({
        title: (q.trim() || discussion.title).slice(0, TASK_TITLE_LIMIT),
        folder_id: folderId,
        ...(section === null ? {} : { section_block_id: section }),
      })
      madeId = task.id
      setWorking(task.id)
      await addEdge(discussion.id, task.id)
      setAdded((current) => new Set([...current, task.id]))
      setQ('')
      void client.invalidateQueries({ queryKey: queryKeys.discussion(discussion.id) })
      void client.invalidateQueries({ queryKey: queryKeys.task(task.id) })
    } catch (error) {
      if (madeId !== null) showToast(relationFailure(error, 'The task was made but was not linked'))
      /* Before the Task exists, useCreateTask owns the normal failure toast. */
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
      <PopoverTrigger render={<button type="button" className="inline-flex h-8 items-center justify-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground shadow-xs hover:bg-primary/90" />}>
        Turn into a task
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 max-w-[calc(100vw-2rem)] p-1" aria-label="Task picker">
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
              <span className="truncate">{q.trim() ? `Create “${q.trim()}”` : 'Create a new task'}</span>
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
      await client.invalidateQueries({ queryKey: queryKeys.discussion(discussion.id) })
      void client.invalidateQueries({ queryKey: queryKeys.task(taskId) })
    } catch (error) {
      showToast(relationFailure(error, 'The task was not unlinked'))
    } finally {
      setWorking(null)
    }
  }

  return (
    <div className="mt-3.5 flex min-w-0 flex-wrap gap-1.5" aria-label="Linked tasks">
      {discussion.linked_tasks.map((task) => {
        const state = taskState(task)
        return (
          <span key={task.id} className="group/task inline-flex h-7 max-w-full items-center gap-1.5 rounded-md border border-border bg-muted/40 pl-2 pr-1 text-sm">
            <Link to={paths.task(task.id)} className="flex min-w-0 items-center gap-1.5 outline-none hover:underline focus-visible:underline">
              <StateMark state={state} className="size-3.5 shrink-0" />
              <span className="max-w-56 truncate text-foreground">{task.title}</span>
              <span className="shrink-0 text-[11px] text-muted-foreground">{STATE_WORD[state]}</span>
            </Link>
            {canUnlink ? (
              <button
                type="button"
                aria-label={`Unlink ${task.title}`}
                title="Unlink"
                disabled={working !== null}
                onClick={() => void unlink(task.id)}
                className="inline-flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground opacity-0 hover:bg-background hover:text-foreground focus-visible:opacity-100 group-hover/task:opacity-100"
              >
                <X className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
              </button>
            ) : null}
          </span>
        )
      })}
    </div>
  )
}

/* A newly created Task keeps the same placement semantics the old
   Discussion conversion had: it is filed at the foot of the Work, inside
   that foot's section when there is one. */
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
