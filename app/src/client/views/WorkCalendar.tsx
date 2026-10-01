import { useCallback, useMemo, useRef, useState } from 'react'

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
import { taskMatchesFilter, type TaskFilter } from './filter.js'

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
  const undatedTarget = useRef<HTMLDivElement>(null)
  const [draggingUndated, setDraggingUndated] = useState(false)
  const [dropDate, setDropDate] = useState<string | null>(null)
  const [draggingScheduled, setDraggingScheduled] = useState(false)
  const [overUndated, setOverUndated] = useState(false)
  const onUndatedDragState = useCallback((dragging: boolean) => {
    setDraggingUndated(dragging)
    if (!dragging) setDropDate(null)
  }, [])
  const onScheduledDragState = useCallback((dragging: boolean) => {
    setDraggingScheduled(dragging)
    if (!dragging) setOverUndated(false)
  }, [])
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

  const pointInside = (element: HTMLElement | null, point: { readonly x: number; readonly y: number }): boolean => {
    if (element === null) return false
    const box = element.getBoundingClientRect()
    return point.x >= box.left && point.x <= box.right && point.y >= box.top && point.y <= box.bottom
  }
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
    setDropDate(null)
    const task = undated.find((entry) => entry.id === taskId)
    if (task === undefined || task.status !== 'pending') return false
    const date = calendarDateAt(point)
    if (date === null) return false
    update.mutate({ id: taskId, body: { start_date: date } })
    return true
  }
  const calendarProposal = (taskId: string, point: { x: number; y: number }): string | null => {
    const task = undated.find((entry) => entry.id === taskId)
    if (task === undefined || task.status !== 'pending') { setDropDate(null); return null }
    const date = calendarDateAt(point)
    setDropDate((was) => was === date ? was : date)
    return date === null ? null : `Start ${formatDueDate(date, context.today)}`
  }
  const undatedProposal = (taskId: string, point: { readonly x: number; readonly y: number }): string | null => {
    const task = tasks.find((entry) => entry.id === taskId)
    const valid = task !== undefined && task.status === 'pending' && isScheduled(task) && pointInside(undatedTarget.current, point)
    setOverUndated(valid)
    return valid ? 'Make undated' : null
  }
  const dropIntoUndated = (taskId: string, point: { readonly x: number; readonly y: number }): boolean => {
    setOverUndated(false)
    const task = tasks.find((entry) => entry.id === taskId)
    if (task === undefined || task.status !== 'pending' || !isScheduled(task) || !pointInside(undatedTarget.current, point)) return false
    update.mutate({ id: taskId, body: { start_date: null, due_date: null } })
    return true
  }

  return <div ref={host}>
    <PlannedCalendar
      folderId={folderId}
      filter={filter}
      filterTasks={tasks}
      filterToday={context.today}
      externalDragging={draggingUndated}
      externalDropDate={dropDate}
      onExternalDrop={dropIntoUndated}
      onExternalOver={undatedProposal}
      onDragStateChange={onScheduledDragState}
      {...(canCreate ? { onCreate: (title: string, date: string) => {
        create.mutate({ title, folder_id: folderId, due_date: date })
      } } : {})}
    />
    {undated.length === 0 && !draggingScheduled ? null : <div
      ref={undatedTarget}
      data-calendar-undated-target
      className={`mt-6 border-t border-border pt-4 transition-colors${overUndated ? ' bg-selected' : ''}`}
    >
      <PlaceGroup name="Undated" heading="Undated">
        {undated.length === 0 ? (
          <div className="flex h-9 items-center rounded-sm px-1.5 text-xs text-muted-foreground">Drop here to make undated</div>
        ) : (
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
                followAcross
                onDragStateChange={onUndatedDragState}
              />
            </section>)}
          </div>
        )}
      </PlaceGroup>
    </div>}
    <ConfirmDialog pending={confirm.pending} onClose={confirm.close} />
  </div>
}
