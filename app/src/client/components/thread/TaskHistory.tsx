/*
A task's history (M5): what happened to it (created, assigned, dates moved,
done, dropped, reopened, dependencies), oldest first. No posts: talk about a
task lives in its project's Discussion. Under the history, "Discuss" opens the
task's one thread there (`POST /tasks/:id/discussion` makes it on first use),
or, once it exists, one quiet link to it; and "Mark done ▾" (Drop in its menu)
or "Reopen".
*/
import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router'

import { useDiscussTask } from '../../api/consultation.js'
import { useConnections, useFolder, useFolders, useMe, useSubjectEvents, useTask, useTaskDependencies } from '../../api/queries.js'
import { mayDraw } from '../../lib/folder-authority.js'
import { paths } from '../../routes.js'
import { Button } from '../ui/button.js'
import { openTask } from '../task-open.js'
import { EventRow } from './timeline/EventRow.js'
import { StateButtons } from './timeline/StateButtons.js'
import type { StateMay } from './timeline/StateButtons.js'
import type { TaskState } from './timeline/state.js'
import { buildTimeline } from './timeline/timeline.js'

const NO_EVENTS: never[] = []

export function TaskHistory({
  taskId,
  folderId,
  state,
  onFinish,
  onReopen,
}: {
  readonly taskId: string
  readonly folderId: string | null
  readonly state: TaskState
  readonly onFinish: (how: 'done' | 'dropped') => void
  readonly onReopen: () => void
}): React.JSX.Element {
  const history = useSubjectEvents(`task:${taskId}`).data?.events ?? NO_EVENTS
  const dependencies = useTaskDependencies(taskId).data
  const detail = useTask(taskId).data
  const me = useMe()
  const connections = useConnections()
  const folders = useFolders()
  const members = useFolder(folderId ?? '', folderId !== null).data?.members ?? []
  const discuss = useDiscussTask()
  const navigate = useNavigate()

  const names = useMemo(() => {
    const map = new Map<string, { name: string; image?: string }>()
    const viewer = me.data?.user
    if (viewer?.display_name != null) {
      map.set(viewer.id, { name: viewer.display_name, ...(viewer.avatar_url === null ? {} : { image: viewer.avatar_url }) })
    }
    for (const user of [...members.map((m) => m.user), ...(connections.data ?? []).map((c) => c.user)]) {
      if (user.display_name === null || map.has(user.id)) continue
      map.set(user.id, { name: user.display_name, ...(user.avatar_url === null ? {} : { image: user.avatar_url }) })
    }
    return map
  }, [connections.data, me.data?.user, members])
  const personOf = (id: string | null): { name: string; image?: string } =>
    (id === null ? undefined : names.get(id)) ?? { name: 'Someone' }

  const entries = buildTimeline({
    events: history,
    dependsOn: dependencies?.depends_on ?? [],
    blocks: dependencies?.blocks ?? [],
    nameOf: (id) => personOf(id).name,
  })

  /* The finishing buttons follow the server's gates. mayDraw cannot project
     an assignment, so an assignee's own reach is added here
     (folder-actions.ts's whenAssignedToActor); the server stays the authority. */
  const row = folders.data?.find((folder) => folder.id === folderId)
  const viewerId = me.data?.user.id ?? null
  const mine = viewerId !== null && detail?.assignee?.id === viewerId
  const facts = row === undefined ? null : { access: row.my_access, isOwner: row.is_owner, isDefault: row.is_default }
  const stateMay: StateMay = {
    complete:
      facts !== null &&
      (mayDraw(facts, 'task.status.complete') || (mine && (facts.access === 'can_contribute' || facts.access === 'assigned_work'))),
    abandon: facts !== null && (mayDraw(facts, 'task.status.abandon') || (mine && facts.access === 'can_contribute')),
  }

  const threadId = detail?.discussion_id ?? null
  const threadAt = (id: string): string => `${paths.folder(folderId ?? '')}?discussion=${id}`
  const mayStart = facts !== null && mayDraw(facts, 'discussion.create')

  return (
    <div>
      {entries.length > 0 ? (
        <ol className="-mx-2 min-w-0" aria-label="History">
          {entries.map((entry) => (
            <li key={entry.key} className="min-w-0 list-none">
              <EventRow entry={entry} person={personOf} folderId={folderId ?? ''} onOpenTask={(id) => { openTask(id) }} />
            </li>
          ))}
        </ol>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        {folderId === null ? (
          <span />
        ) : threadId !== null ? (
          <Link
            to={threadAt(threadId)}
            className="rounded-sm text-sm text-muted-foreground underline-offset-2 outline-none hover:text-foreground hover:underline"
          >
            Open the discussion
          </Link>
        ) : mayStart ? (
          <Button
            variant="ghost"
            disabled={discuss.isPending}
            onClick={() => {
              discuss.mutate(taskId, { onSuccess: (thread) => { void navigate(threadAt(thread.id)) } })
            }}
          >
            Discuss
          </Button>
        ) : (
          <span />
        )}
        <StateButtons state={state} may={stateMay} onFinish={onFinish} onReopen={onReopen} />
      </div>
    </div>
  )
}
