import { useMemo, useState } from 'react'

import type { PageView } from '../../shared/pages.js'
import type { TaskCard } from '../../shared/tasks.js'
import { useCreateTask } from '../api/mutations.js'
import { BoardQuickAdd, TaskBoard } from '../components/task-board.js'
import type { BoardColumn, BoardTask } from '../components/task-board.js'
import { taskRowDisplay } from '../parts/presenters.js'
import type { RowContext } from '../parts/presenters.js'
import type { RowActions } from '../parts/useRowActions.js'
import { taskFilterActive, taskMatchesFilter } from './filter.js'
import type { TaskFilter } from './filter.js'
import { groupRows } from './grouping.js'
import { scheduleLanding } from './place-pages.js'
import { sectionBoardColumns } from './work-board-model.js'

type WorkGroup = 'section' | 'person' | 'date'

export function WorkBoard({ page, tasks, completed, folderId, filter, context, actions, canCreate }: {
  page: PageView
  tasks: readonly TaskCard[]
  completed: readonly TaskCard[]
  folderId: string
  filter: TaskFilter
  context: RowContext
  actions: RowActions
  canCreate: boolean
}): React.JSX.Element {
  const [group, setGroup] = useState<WorkGroup>('section')
  const create = useCreateTask()
  const filtered = taskFilterActive(filter)
  const rows = useMemo(() => {
    const rank = new Map(page.items.filter((item) => item.kind === 'task').map((item, index) => [item.id, index]))
    return [...tasks, ...completed]
      .filter((task) => taskMatchesFilter(task, filter, context.today))
      .sort((a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity))
  }, [tasks, completed, page.items, filter, context.today])
  const byTask = new Map(rows.map((task) => [task.id, task]))
  const sections = useMemo(() => {
    const rank = new Map(page.items.map((item, index) => [item.id, index]))
    return page.blocks.filter((block) => block.kind === 'section')
      .sort((a, b) => (rank.get(a.id) ?? a.position) - (rank.get(b.id) ?? b.position))
  }, [page.blocks, page.items])
  const sectionById = new Map(sections.map((section) => [section.id, section]))
  const pathOf = (id: string | null): string => {
    const names: string[] = []
    const seen = new Set<string>()
    let at = id
    while (at !== null && !seen.has(at)) {
      seen.add(at)
      const section = sectionById.get(at)
      if (section === undefined) break
      names.unshift(section.text || 'Untitled section')
      at = section.section_block_id
    }
    return names.join(' › ')
  }
  const card = (task: TaskCard): BoardTask => ({
    ...taskRowDisplay(task, context),
    id: task.id,
    ...(group === 'section' || task.section_block_id === null ? {} : { sectionPath: pathOf(task.section_block_id) }),
  })
  const flatGroups = group === 'section' ? [] : groupRows(rows, group, context.today, context.viewerId)
  const columns: BoardColumn[] = group === 'section' ? sectionBoardColumns(page, rows, card) : flatGroups.map((column) => ({
    key: column.key,
    label: column.name,
    tasks: column.rows.map(card),
    takes: column.capture !== null,
  }))
  const allColumns = (input: BoardColumn[]): BoardColumn[] => input.flatMap((column) => [column, ...allColumns(column.children ?? [])])
  if (filtered) for (const column of allColumns(columns)) column.takes = false
  const columnKeys = new Set(allColumns(columns).map((column) => column.key))
  const groups = new Map(flatGroups.map((item) => [item.key, item]))
  const captureOf = (key: string) => group === 'section'
    ? columnKeys.has(key) ? { section_block_id: key === 'no-section' ? null : key } : null
    : groups?.get(key)?.capture ?? null

  return <div className="min-w-0 space-y-3">
    <label className="flex items-center gap-2 text-sm text-muted-foreground">
      Group by
      <select className="rounded-md border border-border bg-background px-2 py-1 text-foreground" value={group} onChange={(event) => setGroup(event.target.value as WorkGroup)}>
        <option value="section">Section</option>
        <option value="person">Assignee</option>
        <option value="date">Date</option>
      </select>
    </label>
    {columns.length === 0 ? <p className="text-sm text-muted-foreground">No tasks here.</p> : <TaskBoard
      columns={columns}
      grid="grid-cols-1 md:grid-cols-2"
      onOpenTask={(id) => { const task = byTask.get(id); if (task) actions.onOpenTask(task) }}
      onToggleComplete={(id) => { const task = byTask.get(id); if (task) { if (task.status === 'abandoned') actions.onRestore(task); else actions.onToggleComplete(task) } }}
      onToggleImportant={(id) => { const task = byTask.get(id); if (task) actions.onToggleImportant(task) }}
      onDropIn={(id, key) => {
        if (filtered) return false
        const task = byTask.get(id)
        const target = captureOf(key)
        if (task === undefined || target === null) return false
        const moved = scheduleLanding(task, target)
        if (moved === null) return false
        actions.onMoveToColumn(task, moved)
        return true
      }}
      quickAdd={(column) => {
        if (filtered || !canCreate) return null
        const target = captureOf(column.key)
        if (target === null) return null
        return <BoardQuickAdd label={`New task in ${column.label}`} onAdd={(title) => create.mutate({ title, folder_id: folderId, ...target })} />
      }}
    />}
  </div>
}
