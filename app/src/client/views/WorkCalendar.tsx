import { useMemo, useRef } from 'react'

import type { TaskCard } from '../../shared/tasks.js'
import { useCreateTask, useUpdateTask } from '../api/mutations.js'
import { useFolderPage } from '../api/queries.js'
import { PlannedCalendar } from '../components/calendar/index.js'
import { ConfirmDialog, TaskRows, useConfirm } from '../pages/task-rows.js'
import { formatDueDate } from '../parts/presenters.js'
import type { RowContext } from '../parts/presenters.js'
import { isScheduled } from '../parts/schedule.js'
import { useRowActions } from '../parts/useRowActions.js'
import { PlaceGroup } from './usePlace.js'
import { taskFilterActive, taskMatchesFilter, type TaskFilter } from './filter.js'

/** The shared calendar, scoped to this Work's canonical Tasks and filter. */
export default function WorkCalendar({ folderId, tasks, filter, context, canCreate }: {
  readonly folderId: string
  readonly tasks: readonly TaskCard[]
  readonly filter: TaskFilter
  readonly context: RowContext
  readonly canCreate: boolean
}): React.JSX.Element {
  const create = useCreateTask()
  const update = useUpdateTask()
  const page = useFolderPage(folderId)
  const actions = useRowActions()
  const confirm = useConfirm()
  const host = useRef<HTMLDivElement>(null)
  const filtered = taskFilterActive(filter)
  const undated = tasks.filter((task) => !isScheduled(task) && taskMatchesFilter(task, filter, context.today))

  const sectionGroups = useMemo(() => {
    const sections = new Map((page.data?.blocks ?? [])
      .filter((block) => block.kind === 'section')
      .map((block) => [block.id, block]))
    const pathOf = (id: string | null): string => {
      const names: string[] = []
      const seen = new Set<string>()
      let at = id
      while (at !== null && !seen.has(at)) {
        seen.add(at)
        const section = sections.get(at)
        if (section === undefined) break
        names.unshift(section.text || 'Untitled section')
        at = section.section_block_id
      }
      return names.join(' › ')
    }
    const grouped = new Map<string, { readonly label: string; readonly tasks: TaskCard[] }>()
    for (const task of undated) {
      const key = task.section_block_id ?? 'no-section'
      const label = task.section_block_id === null ? 'No section' : pathOf(task.section_block_id) || 'No section'
      const group = grouped.get(key)
      if (group === undefined) grouped.set(key, { label, tasks: [task] })
      else group.tasks.push(task)
    }
    return [...grouped.entries()].map(([key, group]) => ({ key, ...group }))
  }, [page.data?.blocks, undated])

  const calendarDateAt = (point: { x: number; y: number }): string | null => {
    const root = host.current
    if (root === null) return null
    for (const cell of Array.from(root.querySelectorAll<HTMLElement>('[data-date]'))) {
      const box = cell.getBoundingClientRect()
      if (point.x < box.left || point.x > box.right || point.y < box.top || point.y > box.bottom) continue
      return cell.dataset.date ?? null
    }
    return null
  }
  const dropIntoCalendar = (taskId: string, point: { x: number; y: number }): boolean => {
    if (filtered) return false
    const task = undated.find((entry) => entry.id === taskId)
    if (task === undefined || task.status !== 'pending') return false
    const date = calendarDateAt(point)
    if (date === null) return false
    update.mutate({ id: taskId, body: { start_date: date } })
    return true
  }
  const calendarProposal = (taskId: string, point: { x: number; y: number }): string | null => {
    if (filtered) return null
    const task = undated.find((entry) => entry.id === taskId)
    if (task === undefined || task.status !== 'pending') return null
    const date = calendarDateAt(point)
    return date === null ? null : `Start ${formatDueDate(date, context.today)}`
  }

  return <div ref={host}>
    <PlannedCalendar
      folderId={folderId}
      filter={filter}
      filterTasks={tasks}
      filterToday={context.today}
      {...(canCreate && !filtered ? { onCreate: (title: string, date: string) => {
        create.mutate({ title, folder_id: folderId, due_date: date })
      } } : {})}
    />
    {undated.length === 0 ? null : <div className="mt-6 border-t border-border pt-4">
      <PlaceGroup name="Undated" heading="Undated">
        <div className="space-y-4">
          {sectionGroups.map((group) => <section key={group.key} aria-label={group.label}>
            <h3 className="mb-1 px-1.5 text-xs font-medium text-muted-foreground">{group.label}</h3>
            <TaskRows
              tasks={group.tasks}
              context={context}
              actions={actions}
              onAsk={confirm.ask}
              onDropAt={dropIntoCalendar}
              onOver={calendarProposal}
            />
          </section>)}
        </div>
      </PlaceGroup>
    </div>}
    <ConfirmDialog pending={confirm.pending} onClose={confirm.close} />
  </div>
}
