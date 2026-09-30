import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import type { PageView } from '../../shared/pages.js'
import type { TaskCard } from '../../shared/tasks.js'
import { useCreateTask } from '../api/mutations.js'
import { mutateApi } from '../api/http.js'
import { queryKeys } from '../api/keys.js'
import { BoardQuickAdd, TaskBoard } from '../components/task-board.js'
import type { BoardColumn, BoardTask } from '../components/task-board.js'
import { Button } from '../components/ui/button.js'
import { InlineInput } from '../components/ui/inline-field.js'
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '../components/ui/dropdown-menu.js'
import { cn } from '../components/ui/utils.js'
import { ChevronDown, Plus } from '../lib/icons.js'
import { taskRowDisplay } from '../parts/presenters.js'
import type { RowContext } from '../parts/presenters.js'
import type { RowActions } from '../parts/useRowActions.js'
import { taskFilterActive, taskMatchesFilter } from './filter.js'
import type { TaskFilter } from './filter.js'
import { groupRows } from './grouping.js'
import { scheduleLanding } from './place-pages.js'
import { appendRootSection, sectionBoardColumns } from './work-board-model.js'
import { getPageResponse } from '../../shared/pages.js'

export type WorkGroup = 'section' | 'person' | 'date'

const GROUPS: readonly { value: WorkGroup; label: string }[] = [
  { value: 'section', label: 'Section' },
  { value: 'person', label: 'Assignee' },
  { value: 'date', label: 'Date' },
]

export function BoardGroupControl({ group, onChange }: {
  group: WorkGroup
  onChange: (group: WorkGroup) => void
}): React.JSX.Element {
  const label = GROUPS.find((choice) => choice.value === group)?.label ?? 'Section'
  return <DropdownMenu>
    <DropdownMenuTrigger render={<Button variant="ghost" size="sm" className="font-normal text-muted-foreground" aria-label={`Group by: ${label}`} />}>
      <span><span className="max-sm:hidden">Group by: </span>{label}</span>
      <ChevronDown strokeWidth={1.75} aria-hidden="true" />
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-40">
      <DropdownMenuRadioGroup value={group} onValueChange={(value: unknown) => {
        const choice = GROUPS.find((item) => item.value === value)
        if (choice !== undefined) onChange(choice.value)
      }}>
        {GROUPS.map((choice) => <DropdownMenuRadioItem key={choice.value} value={choice.value} closeOnClick>
          {choice.label}
        </DropdownMenuRadioItem>)}
      </DropdownMenuRadioGroup>
    </DropdownMenuContent>
  </DropdownMenu>
}

export function WorkBoard({ page, tasks, completed, folderId, filter, context, actions, canCreate, canEdit, group }: {
  page: PageView
  tasks: readonly TaskCard[]
  completed: readonly TaskCard[]
  folderId: string
  filter: TaskFilter
  context: RowContext
  actions: RowActions
  canCreate: boolean
  canEdit: boolean
  group: WorkGroup
}): React.JSX.Element {
  const create = useCreateTask()
  const queryClient = useQueryClient()
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const [pending, setPending] = useState<{ readonly id: string; readonly title: string } | null>(null)
  const [sectionError, setSectionError] = useState<string | null>(null)
  const filtered = taskFilterActive(filter)
  const addSection = async (): Promise<void> => {
    const title = name.trim()
    if (!title || pending !== null) return
    const id = crypto.randomUUID()
    setSectionError(null)
    setPending({ id, title })
    try {
      const body = appendRootSection(page, id, title)
      const next = await mutateApi(getPageResponse, { method: 'POST', path: `/folders/${folderId}/page/actions`, body })
      queryClient.setQueryData(queryKeys.folderPage(folderId), next)
      setName('')
      setNaming(false)
    } catch {
      setSectionError('Could not create the Section. Try again.')
      void queryClient.invalidateQueries({ queryKey: queryKeys.folderPage(folderId) })
    } finally { setPending(null) }
  }
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
  if (group === 'section' && pending !== null && !page.blocks.some((block) => block.id === pending.id)) {
    const beforeLoose = columns.findIndex((column) => column.key === 'no-section')
    columns.splice(beforeLoose < 0 ? columns.length : beforeLoose, 0, { key: pending.id, label: pending.title, tasks: [], takes: false })
  }
  const allColumns = (input: BoardColumn[]): BoardColumn[] => input.flatMap((column) => [column, ...allColumns(column.children ?? [])])
  if (filtered) for (const column of allColumns(columns)) column.takes = false
  const columnKeys = new Set(allColumns(columns).map((column) => column.key))
  const groups = new Map(flatGroups.map((item) => [item.key, item]))
  const captureOf = (key: string) => group === 'section'
    ? columnKeys.has(key) ? { section_block_id: key === 'no-section' ? null : key } : null
    : groups?.get(key)?.capture ?? null

  return <div className={cn(
    'min-w-0 space-y-3',
    group === 'section' && [
      '[&_[data-board-column]_[data-board-column]]:ml-0',
      '[&_[data-board-column]_[data-board-column]]:rounded-md',
      '[&_[data-board-column]_[data-board-column]]:border',
      '[&_[data-board-column]_[data-board-column]]:p-2',
    ],
  )}>
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
        if (filtered || !canCreate || pending?.id === column.key) return null
        const target = captureOf(column.key)
        if (target === null) return null
        return <BoardQuickAdd label={`New task in ${column.label}`} onAdd={(title) => create.mutate({ title, folder_id: folderId, ...target })} />
      }}
    />}
    {group === 'section' && canEdit && !filtered ? <div className="pt-1">
      {naming ? <InlineInput
        autoFocus
        aria-label="New section name"
        placeholder="Section name"
        maxLength={120}
        value={name}
        disabled={pending !== null}
        onChange={(event) => { setName(event.target.value); setSectionError(null) }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') { event.preventDefault(); void addSection() }
          if (event.key === 'Escape') { setNaming(false); setName(''); setSectionError(null) }
        }}
        className="mx-0 h-[var(--control-height)] w-full px-2 text-sm"
      /> : <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setNaming(true)}>
        <Plus className="size-4" aria-hidden="true" />New section
      </Button>}
      {sectionError === null ? null : <p role="alert" className="px-2 text-sm text-destructive">{sectionError}</p>}
    </div> : null}
  </div>
}
