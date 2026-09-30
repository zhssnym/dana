import { useMemo, useRef, useState } from 'react'
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
import { ChevronDown, GripVertical, Plus } from '../lib/icons.js'
import { swallowNextClick, useSortableList } from '../lib/use-sortable-list.js'
import { taskRowDisplay } from '../parts/presenters.js'
import type { RowContext } from '../parts/presenters.js'
import type { RowActions } from '../parts/useRowActions.js'
import { taskFilterActive, taskMatchesFilter } from './filter.js'
import type { TaskFilter } from './filter.js'
import { groupRows } from './grouping.js'
import { scheduleLanding } from './place-pages.js'
import { appendSection, reorderRootSection, sectionBoardColumns } from './work-board-model.js'
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
  const sectionZones = useRef(new Map<string, HTMLElement>())
  const [naming, setNaming] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [pending, setPending] = useState<{ readonly id: string; readonly title: string; readonly parentId: string | null } | null>(null)
  const [sectionError, setSectionError] = useState<string | null>(null)
  const [reordering, setReordering] = useState(false)
  const [reorderError, setReorderError] = useState<string | null>(null)
  const filtered = taskFilterActive(filter)
  const addSection = async (): Promise<void> => {
    const title = name.trim()
    if (!title || pending !== null || naming === null) return
    const id = crypto.randomUUID()
    const parentId = naming === 'root' ? null : naming
    setSectionError(null)
    setPending({ id, title, parentId })
    try {
      const body = appendSection(page, id, title, parentId)
      const next = await mutateApi(getPageResponse, { method: 'POST', path: `/folders/${folderId}/page/actions`, body })
      queryClient.setQueryData(queryKeys.folderPage(folderId), next)
      setName('')
      setNaming(null)
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
  const depthOf = (id: string): number => {
    let depth = 0
    let at: string | null = id
    while (at !== null) {
      const section = sectionById.get(at)
      if (section === undefined) return 3
      depth += 1
      at = section.section_block_id
    }
    return depth
  }
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
  if (group === 'section' && pending !== null && !page.blocks.some((block) => block.id === pending.id)) {
    const provisional: BoardColumn = { key: pending.id, label: pending.title, tasks: [], takes: false }
    if (pending.parentId === null) {
      const beforeLoose = columns.findIndex((column) => column.key === 'no-section')
      columns.splice(beforeLoose < 0 ? columns.length : beforeLoose, 0, provisional)
    } else {
      allColumns(columns).find((column) => column.key === pending.parentId)?.children?.push(provisional)
    }
  }
  const rootSections = group === 'section' ? columns.filter((column) => sectionById.get(column.key)?.section_block_id === null) : []
  const dragDisabled = !canEdit || filtered || pending !== null || reordering || rootSections.length < 2
  const targetSectionAt = (from: number, point: { x: number; y: number }): number => {
    for (let index = 0; index < rootSections.length; index += 1) {
      if (index === from) continue
      const column = rootSections[index]
      if (column === undefined) continue
      const node = sectionZones.current.get(column.key)
      if (node === undefined) continue
      const box = node.getBoundingClientRect()
      if (point.x >= box.left && point.x <= box.right && point.y >= box.top && point.y <= box.bottom) return index
    }
    return -1
  }
  const persistSectionOrder = async (from: number, to: number): Promise<void> => {
    const source = rootSections[from]
    const target = rootSections[to]
    if (source === undefined || target === undefined || source.key === target.key || reordering) return
    setReorderError(null)
    setReordering(true)
    try {
      const body = reorderRootSection(page, source.key, target.key)
      const next = await mutateApi(getPageResponse, { method: 'POST', path: `/folders/${folderId}/page/actions`, body })
      queryClient.setQueryData(queryKeys.folderPage(folderId), next)
    } catch {
      setReorderError('Could not move the Section. Try again.')
      void queryClient.invalidateQueries({ queryKey: queryKeys.folderPage(folderId) })
    } finally { setReordering(false) }
  }
  const sectionDrag = useSortableList({
    count: rootSections.length,
    axis: 'x',
    followAcross: true,
    disabled: dragDisabled,
    onLift: swallowNextClick,
    describe: (index) => rootSections[index]?.label ?? 'Section',
    onReorder: (from, to) => { void persistSectionOrder(from, to) },
    onOver: (from, point) => {
      const target = targetSectionAt(from, point)
      return target < 0 ? '__section-board__' : rootSections[target]?.key ?? '__section-board__'
    },
    onDropAt: (from, point) => {
      const target = targetSectionAt(from, point)
      if (target >= 0) void persistSectionOrder(from, target)
      return true
    },
  })
  if (filtered) for (const column of allColumns(columns)) column.takes = false
  const columnKeys = new Set(allColumns(columns).map((column) => column.key))
  const groups = new Map(flatGroups.map((item) => [item.key, item]))
  const captureOf = (key: string) => group === 'section'
    ? columnKeys.has(key) ? { section_block_id: key === 'no-section' ? null : key } : null
    : groups?.get(key)?.capture ?? null
  const sectionControl = (parentId: string | null): React.JSX.Element => {
    const key = parentId ?? 'root'
    const nested = parentId !== null
    const label = nested ? 'New subsection' : 'New section'
    return <div className={nested ? 'ml-2 mt-2 border-l border-border pl-2' : 'pt-1'}>
      {naming === key ? <InlineInput
        autoFocus
        aria-label={nested ? `New subsection in ${sectionById.get(parentId)?.text ?? 'Section'}` : 'New section name'}
        placeholder="Section name"
        maxLength={120}
        value={name}
        disabled={pending !== null}
        onChange={(event) => { setName(event.target.value); setSectionError(null) }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') { event.preventDefault(); void addSection() }
          if (event.key === 'Escape') { setNaming(null); setName(''); setSectionError(null) }
        }}
        className="mx-0 h-[var(--control-height)] w-full px-2 text-sm"
      /> : <Button variant="ghost" size="sm" className="text-muted-foreground" aria-label={nested ? `New subsection in ${sectionById.get(parentId)?.text ?? 'Section'}` : undefined} disabled={pending !== null} onClick={() => { setNaming(key); setName(''); setSectionError(null) }}>
        <Plus className="size-4" aria-hidden="true" />{label}
      </Button>}
      {naming === key && sectionError !== null ? <p role="alert" className="px-2 text-sm text-destructive">{sectionError}</p> : null}
    </div>
  }

  return <div className={cn(
    'min-w-0 space-y-3',
    [
      '[&>div>[data-board-column]]:rounded-md',
      '[&>div>[data-board-column]]:border',
      '[&>div>[data-board-column]]:p-2',
      '[&>div>[data-board-column]:nth-child(4n+1)]:border-[var(--color-dana-accent-100)]',
      '[&>div>[data-board-column]:nth-child(4n+1)]:bg-[var(--color-dana-accent-50)]',
      '[&>div>[data-board-column]:nth-child(4n+2)]:border-[var(--color-info-200)]',
      '[&>div>[data-board-column]:nth-child(4n+2)]:bg-[var(--color-info-100)]',
      '[&>div>[data-board-column]:nth-child(4n+3)]:border-[var(--color-success-200)]',
      '[&>div>[data-board-column]:nth-child(4n+3)]:bg-[var(--color-success-100)]',
      '[&>div>[data-board-column]:nth-child(4n+4)]:border-[var(--color-warning-200)]',
      '[&>div>[data-board-column]:nth-child(4n+4)]:bg-[var(--color-warning-100)]',
    ],
    group === 'section' && [
      '[&_[data-board-column]_[data-board-column]]:ml-0',
      '[&_[data-board-column]_[data-board-column]]:rounded-md',
      '[&_[data-board-column]_[data-board-column]]:border',
      '[&_[data-board-column]_[data-board-column]]:bg-background/70',
      '[&_[data-board-column]_[data-board-column]]:p-2',
    ],
  )}>
    {columns.length === 0 ? <p className="text-sm text-muted-foreground">No tasks here.</p> : <TaskBoard
      columns={columns}
      grid="grid-cols-1 md:grid-cols-2"
      columnLead={(column) => {
        const index = rootSections.findIndex((entry) => entry.key === column.key)
        if (index < 0 || dragDisabled) return null
        return <button
          type="button"
          aria-label={`Move ${column.label} Section`}
          title="Move Section"
          {...sectionDrag.handleProps(index)}
          className="flex size-5 shrink-0 cursor-grab items-center justify-center rounded-sm text-quiet-foreground hover:bg-hover hover:text-foreground active:cursor-grabbing"
        >
          <GripVertical className="size-4" strokeWidth={1.75} aria-hidden="true" />
        </button>
      }}
      columnRef={(column) => (node) => {
        const index = rootSections.findIndex((entry) => entry.key === column.key)
        if (index < 0) return
        sectionDrag.setItemRef(index)(node)
        if (node === null) {
          sectionZones.current.delete(column.key)
          return
        }
        sectionZones.current.set(column.key, node)
        const state = sectionDrag.itemState(index)
        const moving = state.isActive || state.offset !== 0 || state.crossOffset !== 0
        node.style.transform = moving ? `translate3d(${String(state.offset)}px, ${String(state.crossOffset)}px, 0)` : ''
        node.style.transition = state.isActive && !state.isSettling
          ? 'none'
          : 'transform var(--duration-base) var(--ease-enter), box-shadow var(--duration-base) var(--ease-enter), opacity var(--duration-fast) var(--ease-standard)'
        node.style.zIndex = state.isActive ? '20' : ''
        node.style.boxShadow = state.isActive ? 'var(--elevation-2)' : ''
        node.style.opacity = state.isActive ? '0.9' : ''
      }}
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
      subsectionAdd={(column) => {
        if (group !== 'section' || !canEdit || filtered || !sectionById.has(column.key) || depthOf(column.key) >= 3) return null
        return sectionControl(column.key)
      }}
    />}
    <span className="sr-only" aria-live="polite">{sectionDrag.announcement}</span>
    {reorderError !== null ? <p role="alert" className="text-sm text-destructive">{reorderError}</p> : null}
    {group === 'section' && canEdit && !filtered ? sectionControl(null) : null}
  </div>
}
