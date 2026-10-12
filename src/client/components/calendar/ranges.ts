import type { TaskCard } from '../../../shared/tasks.js'

export interface WeekRange {
  readonly task: TaskCard
  readonly first: number
  readonly last: number
  readonly lane: number
  readonly begins: boolean
  readonly ends: boolean
}

export function weekRanges(tasks: readonly TaskCard[], week: readonly string[], maxLanes = Infinity): {
  readonly visible: readonly WeekRange[]
  readonly lanes: number
  readonly hidden: ReadonlyMap<string, number>
} {
  const firstDay = week[0]
  const lastDay = week[week.length - 1]
  if (firstDay === undefined || lastDay === undefined) return { visible: [], lanes: 0, hidden: new Map() }
  const crossing = tasks.filter((task) => task.start_date !== null && task.due_date !== null && task.start_date < task.due_date &&
    task.start_date <= lastDay && task.due_date >= firstDay)
    .sort((a, b) => (a.start_date ?? '').localeCompare(b.start_date ?? '') ||
      (a.due_date ?? '').localeCompare(b.due_date ?? '') || a.id.localeCompare(b.id))
  const laneEnds: number[] = []
  const visible: WeekRange[] = []
  const hidden = new Map<string, number>()
  for (const task of crossing) {
    const first = week.findIndex((day) => day >= (task.start_date ?? ''))
    const last = week.findLastIndex((day) => day <= (task.due_date ?? ''))
    if (first < 0 || last < first) continue
    let lane = laneEnds.findIndex((end) => end < first)
    if (lane < 0) lane = laneEnds.length
    if (lane >= maxLanes) {
      for (let index = first; index <= last; index += 1) {
        const date = week[index]
        if (date !== undefined) hidden.set(date, (hidden.get(date) ?? 0) + 1)
      }
      continue
    }
    laneEnds[lane] = last
    visible.push({ task, first, last, lane, begins: task.start_date === week[first], ends: task.due_date === week[last] })
  }
  return { visible, lanes: laneEnds.length, hidden }
}

// Month cells have three content lines, but reserve at most two for ranges by default.
// Keep these together: expanding a busy week must satisfy both limits.
export const MONTH_CELL_LINES = 3
export const MONTH_RANGE_LANES = 2

/** Minimum extra row steps that reveal every range and single-day event in a week. */
export function expandedMonthWeekSteps(
  tasks: readonly TaskCard[],
  week: readonly string[],
  cellCounts: ReadonlyMap<string, number>,
  previousSteps: number,
): number {
  const lanes = weekRanges(tasks, week).lanes
  const busiestDay = week.reduce((max, date) => Math.max(max, cellCounts.get(date) ?? 0), 0)
  return Math.max(
    0,
    previousSteps,
    // Three overlapping ranges need one extra step even with no single-day events.
    lanes - MONTH_RANGE_LANES,
    lanes + busiestDay - MONTH_CELL_LINES,
  )
}

export type CalendarDrag = {
  readonly taskId: string
  readonly action: 'move' | 'start' | 'due'
  readonly from: string
}

const DRAG_TYPE = 'application/x-dana-calendar-task'

export function readCalendarDrag(transfer: DataTransfer): CalendarDrag | null {
  const raw = transfer.getData(DRAG_TYPE)
  if (raw !== '') {
    try {
      const value: unknown = JSON.parse(raw)
      if (typeof value === 'object' && value !== null &&
        'taskId' in value && typeof value.taskId === 'string' &&
        'from' in value && typeof value.from === 'string' &&
        'action' in value && (value.action === 'move' || value.action === 'start' || value.action === 'due')) {
        return value as CalendarDrag
      }
    } catch { return null }
  }
  const taskId = transfer.getData('text/plain')
  return taskId === '' ? null : { taskId, action: 'move', from: '' }
}
