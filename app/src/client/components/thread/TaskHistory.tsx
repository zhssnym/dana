/*
A task's history (M5): what happened to it (created, assigned, dates moved,
done, dropped, reopened, dependencies), oldest first. No posts: talk about a
task lives in its project's Discussion, reached from the task's Discussion
property.

Issue #500 moves this record out of the task body. The task page's one "…"
opens it as a dialog instead, so the page ends with the person's writing while
History remains available without adding another control to the surface.
*/
import { useMemo } from 'react'

import { useConnections, useFolder, useMe, useSubjectEvents, useTaskDependencies } from '../../api/queries.js'
import { openTask } from '../task-open.js'
import { EventRow } from './timeline/EventRow.js'
import { buildTimeline } from './timeline/timeline.js'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog.js'

const NO_EVENTS: never[] = []

export function TaskHistory({
  taskId,
  folderId,
  open,
  onOpenChange,
}: {
  readonly taskId: string
  readonly folderId: string | null
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
}): React.JSX.Element {
  const history = useSubjectEvents(`task:${taskId}`).data?.events ?? NO_EVENTS
  const dependencies = useTaskDependencies(taskId).data
  const me = useMe()
  const connections = useConnections()
  const members = useFolder(folderId ?? '', folderId !== null).data?.members ?? []

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[520px]">
        <DialogHeader>
          <DialogTitle>History</DialogTitle>
        </DialogHeader>
        {entries.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nothing has happened to this yet.
          </p>
        ) : (
          <ol className="-mx-2 max-h-[52vh] min-w-0 overflow-y-auto">
            {entries.map((entry) => (
              <li key={entry.key} className="min-w-0 list-none">
                <EventRow entry={entry} person={personOf} folderId={folderId ?? ''} onOpenTask={(id) => { openTask(id) }} />
              </li>
            ))}
          </ol>
        )}
      </DialogContent>
    </Dialog>
  )
}
