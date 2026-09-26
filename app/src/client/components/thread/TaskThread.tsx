/*
A task's one timeline (M4): its posts and its history events (done, dropped,
reopened, assigned, dates moved, dependencies) in one list, oldest first, in
the same post list and composer as a folder's threads (`ThreadPosts`). Under
it, "Mark done ▾" (Drop in its menu) or "Reopen", beside "Post".

The read is `useThread(folder, task)`, the one `task-editing.tsx` already
holds for the card's Attachments block (one cache entry), polled every few
seconds while this tab is open (`useTaskThreadLive`). Who wrote
what is resolved off the roster the card already reads; what this viewer may
do is the folder row's gates (`lib/folder-authority.ts`), as everywhere else.

Read like a page's thread (r7): opening the task, and every new post seen
while it is on screen, marks it read on the server (`PUT
/tasks/:id/thread/read`), which clears its bell rows. The page opens at its
top, the title, not at the timeline's end: the timeline is below the task,
and a `#post-<id>` address (a notification) still scrolls to its post.
*/
import { useCallback, useEffect, useMemo } from 'react'

import { usePostComment } from '../../api/mutations.js'
import { useMarkTaskThreadRead, useTaskThreadLive } from '../../api/consultation.js'
import { useConnections, useFolder, useFolders, useMe, useSubjectEvents, useTask, useTaskDependencies } from '../../api/queries.js'
import { folderGates, mayDraw } from '../../lib/folder-authority.js'
import type { ThreadAuthority } from '../../lib/thread.js'
import { RosterTints } from '../default-avatar.js'
import { Button } from '../ui/button.js'
import { openTask } from '../task-open.js'
import { ThreadPosts } from './ThreadPosts.js'
import type { TimelineItem } from './ThreadPosts.js'
import { EventRow } from './timeline/EventRow.js'
import { StateButtons } from './timeline/StateButtons.js'
import type { StateMay } from './timeline/StateButtons.js'
import type { TaskState } from './timeline/state.js'
import { buildTimeline } from './timeline/timeline.js'

const NOTHING: ThreadAuthority = { moderate: false, mutateOwnComment: false, likeComment: false, createComment: false }

const NO_EVENTS: never[] = []

export function TaskThread({
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
  const thread = useTaskThreadLive(folderId, taskId)
  const history = useSubjectEvents(`task:${taskId}`).data?.events ?? NO_EVENTS
  const dependencies = useTaskDependencies(taskId).data
  const detail = useTask(taskId).data
  const me = useMe()
  const connections = useConnections()
  const folders = useFolders()
  const members = useFolder(folderId ?? '', folderId !== null).data?.members ?? []
  const post = usePostComment()
  const markRead = useMarkTaskThreadRead()

  const comments = thread.data?.comments
  const newest = comments?.reduce<string>((latest, c) => (c.created_at > latest ? c.created_at : latest), '') ?? null
  useEffect(() => {
    if (newest === null) return
    const mark = (): void => {
      if (document.visibilityState !== 'visible') return
      void markRead(taskId)
    }
    mark()
    document.addEventListener('visibilitychange', mark)
    return () => { document.removeEventListener('visibilitychange', mark) }
  }, [taskId, newest, markRead])

  const people = useMemo(() => {
    const map = new Map<string, { name: string; image?: string }>()
    const viewer = me.data?.user
    if (viewer?.display_name != null) {
      map.set(viewer.id, { name: viewer.display_name, ...(viewer.avatar_url === null ? {} : { image: viewer.avatar_url }) })
    }
    for (const member of members) {
      const name = member.user.display_name
      if (name === null || map.has(member.user.id)) continue
      const image = member.user.avatar_url
      map.set(member.user.id, { name, ...(image === null ? {} : { image }) })
    }
    for (const connection of connections.data ?? []) {
      const name = connection.user.display_name
      if (name === null || map.has(connection.user.id)) continue
      const image = connection.user.avatar_url
      map.set(connection.user.id, { name, ...(image === null ? {} : { image }) })
    }
    return map
  }, [connections.data, me.data?.user, members])
  const personOf = useCallback((id: string) => people.get(id) ?? { name: 'Someone' }, [people])

  const row = folders.data?.find((folder) => folder.id === folderId)
  const may = useMemo((): ThreadAuthority => {
    if (row === undefined) return NOTHING
    const gates = folderGates({ access: row.my_access, isOwner: row.is_owner, isDefault: row.is_default })
    return {
      moderate: gates.moderate,
      mutateOwnComment: gates.mutateOwnComment,
      likeComment: gates.likeComment,
      createComment: gates.createComment,
    }
  }, [row])

  const events = useMemo((): TimelineItem[] => {
    const entries = buildTimeline({
      events: history,
      comments: [],
      dependsOn: dependencies?.depends_on ?? [],
      blocks: dependencies?.blocks ?? [],
      nameOf: (id) => personOf(id).name,
    })
    return entries.flatMap((entry) =>
      entry.kind === 'event'
        ? [
            {
              key: `event-${entry.key}`,
              at: entry.at,
              node: (
                <EventRow
                  entry={entry}
                  person={(id) => (id === null ? { name: 'Someone' } : personOf(id))}
                  folderId={folderId ?? ''}
                  onOpenTask={(id) => { openTask(id) }}
                />
              ),
            },
          ]
        : [],
    )
  }, [history, dependencies, personOf, folderId])

  /* The finishing buttons follow the server's gates. mayDraw cannot project
     an assignment, so an assignee's own reach is added here
     (folder-actions.ts's whenAssignedToActor); the server stays the authority. */
  const viewerId = me.data?.user.id ?? null
  const mine = viewerId !== null && detail?.assignee?.id === viewerId
  const facts = row === undefined ? null : { access: row.my_access, isOwner: row.is_owner, isDefault: row.is_default }
  const stateMay: StateMay = {
    complete:
      facts !== null &&
      (mayDraw(facts, 'task.status.complete') || (mine && (facts.access === 'can_contribute' || facts.access === 'assigned_work'))),
    abandon: facts !== null && (mayDraw(facts, 'task.status.abandon') || (mine && facts.access === 'can_contribute')),
  }

  return (
    <RosterTints ids={members.map((member) => member.user.id)}>
      <ThreadPosts
        folderId={folderId}
        comments={comments}
        loading={folderId !== null && thread.isPending}
        failed={thread.isError}
        onRetry={() => void thread.refetch()}
        viewerId={me.data?.user.id ?? null}
        personOf={personOf}
        may={may}
        post={(body) => post.mutateAsync({ folderId: folderId ?? '', body, taskId })}
        events={events}
        placeholder="Write a post…"
        renderActions={({ submit, empty, busy }) => (
          <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
            <StateButtons
              state={state}
              may={stateMay}
              withPost={!empty}
              busy={busy}
              onFinish={(how) => {
                if (empty) {
                  onFinish(how)
                  return
                }
                void submit().then((posted) => {
                  if (posted) onFinish(how)
                })
              }}
              onReopen={() => {
                if (empty) {
                  onReopen()
                  return
                }
                void submit().then((posted) => {
                  if (posted) onReopen()
                })
              }}
            />
            <Button variant="commit" disabled={empty || busy} title="Ctrl+Enter" onClick={() => void submit()}>
              Post
            </Button>
          </div>
        )}
        {...(may.createComment
          ? {}
          : {
              closed: (
                <div className="flex justify-end">
                  <StateButtons state={state} may={stateMay} withPost={false} busy={false} onFinish={onFinish} onReopen={onReopen} />
                </div>
              ),
            })}
      />
    </RosterTints>
  )
}
