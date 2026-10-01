/*
A task's history (M5): what happened to it (created, assigned, dates moved,
done, dropped, reopened, dependencies), oldest first. No posts: talk about a
task lives in its project's Discussion, reached from the task's Discussion
property.
*/
import { useMemo, useState } from 'react'

import { useConnections, useFolder, useMe, useSubjectEvents, useTaskDependencies } from '../../api/queries.js'
import { openTask } from '../task-open.js'
import { ChevronRight } from '../../lib/icons.js'
import { EventRow } from './timeline/EventRow.js'
import { buildTimeline } from './timeline/timeline.js'

const NO_EVENTS: never[] = []

export function TaskHistory({
  taskId,
  folderId,
}: {
  readonly taskId: string
  readonly folderId: string | null
}): React.JSX.Element | null {
  const [open, setOpen] = useState(false)
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

  if (entries.length === 0) return null
  return (
    <section className="flex min-w-0 flex-col gap-1" aria-labelledby={`history-${taskId}`}>
      <h2 id={`history-${taskId}`}>
        <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}
          className="flex items-center gap-2 rounded-sm text-sm text-muted-foreground hover:text-foreground">
          <ChevronRight className={`size-4 transition-transform duration-[var(--duration-fast)] ${open ? 'rotate-90' : ''}`} aria-hidden="true" />
          History
        </button>
      </h2>
      {open ? <ol className="-mx-2 min-w-0">
        {entries.map((entry) => (
          <li key={entry.key} className="min-w-0 list-none">
            <EventRow entry={entry} person={personOf} folderId={folderId ?? ''} onOpenTask={(id) => { openTask(id) }} />
          </li>
        ))}
      </ol> : null}
    </section>
  )
}
