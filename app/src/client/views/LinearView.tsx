/*
The Linear view: the page's tasks as a GitHub Issues list (m3 list; scratchpad
m3/RESEARCH-LIST.md). One bordered table: a header row (select-all, Open ·
Closed · All with counts, Milestone, Assignee and Sort menus, the density
switch, New issue), then one line per issue, then the one "New issue" line.

In page order (the default sort) milestones are rows of the table, every issue
sits in its place under its milestone, a closed one too (All shows done work
where it was, never hidden), and a row's handle drags it within or across
milestones: one `move_step` edit of the Work document. Other sorts are flat.

Only the title opens an issue (`?issue=<id>`, so Back returns here):
`linear/IssuePage.tsx`. Keys: arrows (and J/K) move, Enter or O opens, Space
closes or reopens, X selects, Shift+arrows extend, Alt+arrows move the row,
Esc clears; C focuses New issue, M and A open Milestone and Assignee (and L
Label for a selection).
*/
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'

import { useLabels, useSetTaskLabel, useWearFilterLabel } from '../api/labels.js'
import { useTransitionTask, useUpdateTask } from '../api/mutations.js'
import { useFolder, useFolderCompletedTasks, useMe, mergeCompletedDays } from '../api/queries.js'
import { cn } from '../components/ui/utils.js'
import { personDisplay, taskRowDisplay } from '../parts/presenters.js'
import { RowMeta } from '../components/task-meta.js'
import { Face } from '../components/person-face.js'
import { formatDayInline } from '../lib/dates.js'
import { agoFor } from '../lib/history.js'
import { GripVertical } from '../lib/icons.js'
import { moved, useSortableList } from '../lib/use-sortable-list.js'
import { useRowKeys } from '../components/row-keys.js'
import { Composer } from './linear/Composer.js'
import { useLineWriter } from './linear/document.js'
import { IssuePage } from './linear/IssuePage.js'
import { CommentCount, LabelChip, StateMark } from './linear/IssueParts.js'
import { labelsOf, sectionReader, useCommentCounts, usePeople } from './linear/issues.js'
import { ListHeader, SelectBox } from './linear/ListHeader.js'
import type { HeaderMenu, LabelChoiceRow } from './linear/ListHeader.js'
import { dropPlacement, listRows, NO_FILTERS, rowState, stateCounts } from './linear/list.js'
import type { Density, ListFilters, ListRow, ListSort, ListState, RowState } from './linear/list.js'
import { startDay } from './linear/stage.js'
import { wearsLabel } from './filter.js'
import type { RowContext } from '../parts/presenters.js'
import type { RowActions } from '../parts/useRowActions.js'
import type { PageView } from '../../shared/pages.js'
import type { TaskCard } from '../../shared/tasks.js'

const WORD: Record<RowState, string> = {
  open: 'Open',
  'in-progress': 'In progress',
  completed: 'Closed',
  'not-planned': 'Not planned',
}

/* New keys (m3 list): per viewer, on this device, for every page. */
const STATE_KEY = 'dana.linear.state'
const DENSITY_KEY = 'dana.linear.density'
const SORT_KEY = 'dana.linear.sort'

function useStored<T extends string>(key: string, fallback: T, allowed: readonly T[]): [T, (next: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = globalThis.localStorage.getItem(key) as T | null
      return stored !== null && allowed.includes(stored) ? stored : fallback
    } catch {
      return fallback
    }
  })
  const set = (next: T): void => {
    setValue(next)
    try {
      globalThis.localStorage.setItem(key, next)
    } catch {
      /* Still this session's choice. */
    }
  }
  return [value, set]
}

const typing = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  target.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""], [role="menu"], [role="dialog"]') !== null

export function LinearView(props: {
  readonly folderId: string
  readonly page: PageView
  /* Open work (and not planned), already narrowed to the page's Label filter. */
  readonly tasks: readonly TaskCard[]
  readonly completed: readonly TaskCard[]
  /* The Label filter's choice, which a task added here is given too. */
  readonly label: string | null
  /* The page's "Show completed" belongs to the other views; here the state
     switch (Open · Closed · All) says what is shown. */
  readonly showCompleted: boolean
  readonly today: string
  readonly context: RowContext
  readonly actions: RowActions
}): React.JSX.Element {
  const { folderId, page, tasks, label, today, context, actions } = props
  const wearFilterLabel = useWearFilterLabel(folderId)
  const [search, setSearch] = useSearchParams()
  const issueId = search.get('issue')
  const writer = useLineWriter(folderId)
  const done = useFolderCompletedTasks(folderId, true)
  const counts = useCommentCounts(folderId)
  const person = usePeople(folderId)
  const me = useMe().data?.user.id ?? null
  const members = useFolder(folderId, true).data?.members
  const pageLabels = useLabels(folderId).data?.rows
  const setLabel = useSetTaskLabel()
  const transition = useTransitionTask()
  const update = useUpdateTask()
  const keys = useRowKeys<HTMLDivElement>()
  const table = useRef<HTMLDivElement>(null)
  const composer = useRef<HTMLDivElement>(null)

  const [state, setStateRaw] = useStored<ListState>(STATE_KEY, 'open', ['open', 'closed', 'all'])
  const [density, setDensity] = useStored<Density>(DENSITY_KEY, 'compact', ['compact', 'comfortable'])
  const [sort, setSort] = useStored<ListSort>(SORT_KEY, 'manual', ['manual', 'newest', 'oldest', 'updated', 'due', 'comments'])
  const [filters, setFilters] = useState<ListFilters>(NO_FILTERS)
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set())
  const [menu, setMenu] = useState<HeaderMenu>(null)
  const anchor = useRef<string | null>(null)
  /* A drop draws where it landed at once; the page's next revision replaces it. */
  const [held, setHeld] = useState<{ page: PageView; rows: ListRow[] } | null>(null)

  /* Every closed issue, not the first page of them: under Closed and All each
     sits in its place, and the counts count them all. One page's tasks. */
  useEffect(() => {
    if (done.hasNextPage && !done.isFetchingNextPage) void done.fetchNextPage()
  }, [done.hasNextPage, done.isFetchingNextPage, done])

  const closedOn = useMemo(() => {
    const map = new Map<string, string>()
    for (const day of mergeCompletedDays(done.data?.pages)) for (const task of day.rows) if (!map.has(task.id)) map.set(task.id, day.date)
    return map
  }, [done.data])

  /* Every issue once: open work as the page reads it, then finished work
     narrowed to the page's Label filter. */
  const everyIssue = useMemo(() => {
    const seen = new Set(tasks.map((task) => task.id))
    const rows = [...tasks]
    for (const day of mergeCompletedDays(done.data?.pages)) {
      for (const task of day.rows) {
        if (seen.has(task.id) || !wearsLabel(task, label)) continue
        seen.add(task.id)
        rows.push(task)
      }
    }
    return rows
  }, [tasks, done.data, label])

  const counted = useMemo(() => stateCounts({ page, tasks: everyIssue, filters }), [page, everyIssue, filters])
  const computed = useMemo(
    () => listRows({ page, tasks: everyIssue, state, filters, sort, comments: counts }),
    [page, everyIssue, state, filters, sort, counts],
  )
  const rows = held !== null && held.page === page ? held.rows : computed
  const shownTasks = useMemo(() => rows.flatMap((row) => (row.kind === 'task' ? [row.task] : [])), [rows])
  const selectedTasks = useMemo(() => everyIssue.filter((task) => selected.has(task.id)), [everyIssue, selected])
  const { sections } = useMemo(() => sectionReader(page), [page])
  const manual = sort === 'manual'

  const setState = (next: ListState): void => {
    setStateRaw(next)
    setSelected(new Set())
  }

  const openIssue = (task: Pick<TaskCard, 'id'>): void => {
    setSearch((current) => {
      const next = new URLSearchParams(current)
      next.set('issue', task.id)
      return next
    })
  }
  const closeIssue = (): void => {
    setSearch((current) => {
      const next = new URLSearchParams(current)
      next.delete('issue')
      return next
    })
  }

  const focusNew = (): void => {
    const input = composer.current?.querySelector('input')
    input?.scrollIntoView({ block: 'nearest' })
    input?.focus()
  }

  /* ---- selection ---- */
  const toggleSelect = (id: string, range: boolean): void => {
    setSelected((current) => {
      const next = new Set(current)
      const ids = shownTasks.map((task) => task.id)
      const from = anchor.current === null ? -1 : ids.indexOf(anchor.current)
      const to = ids.indexOf(id)
      if (range && from >= 0 && to >= 0) {
        const on = !current.has(id) || current.has(anchor.current!)
        for (const each of ids.slice(Math.min(from, to), Math.max(from, to) + 1)) {
          if (on) next.add(each)
          else next.delete(each)
        }
      } else if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    anchor.current = id
  }
  const clearSelection = (): void => {
    setSelected(new Set())
    anchor.current = null
  }

  /* ---- drag ---- */
  const reorder = (from: number, to: number): void => {
    const row = rows[from]
    if (!manual || row?.kind !== 'task' || from === to) return
    const next = moved(rows, from, to)
    const place = dropPlacement(next, to)
    const was = dropPlacement(rows, from)
    if (place.section === was.section && place.before === was.before) return
    setHeld({ page, rows: next.map((each, index) => (index === to && each.kind === 'task' ? { ...each, section: place.section } : each)) })
    void writer.write({ op: 'move_step', id: row.task.id, section: place.section, before: place.before }).catch(() => setHeld(null))
  }
  const drag = useSortableList({
    count: rows.length,
    onReorder: reorder,
    disabled: !manual,
    describe: (index) => {
      const row = rows[index]
      return row?.kind === 'task' ? row.task.title : 'Milestone'
    },
  })
  useEffect(() => {
    if (held !== null && held.page !== page) setHeld(null)
  }, [held, page])

  /* ---- bulk ---- */
  const markAs = async (target: RowState): Promise<void> => {
    const chosen = selectedTasks
    await Promise.all(
      chosen.map(async (task) => {
        const now = rowState(task, today)
        if (now === target) return
        const event = (name: 'complete' | 'uncomplete' | 'abandon' | 'restore') => transition.mutateAsync({ id: task.id, event: name })
        /* Back to open first, then on to the target. */
        if (now === 'completed') await event('uncomplete')
        if (now === 'not-planned') await event('restore')
        if (target === 'completed') await event('complete')
        else if (target === 'not-planned') await event('abandon')
        else if (target === 'in-progress') await update.mutateAsync({ id: task.id, body: { start_date: startDay(task, today) } })
        else if (now === 'in-progress') await update.mutateAsync({ id: task.id, body: { start_date: null } })
      }),
    ).catch(() => undefined)
  }
  const labelRows: LabelChoiceRow[] = (pageLabels ?? [])
    .filter((row) => !row.archived)
    .map((row) => ({
      id: row.id,
      name: row.name,
      color: row.color,
      worn: selectedTasks.filter((task) => labelsOf(task).some((worn) => worn.id === row.id)).length,
    }))
  const toggleLabel = (row: LabelChoiceRow): void => {
    const on = row.worn < selectedTasks.length
    for (const task of selectedTasks) {
      const wears = labelsOf(task).some((worn) => worn.id === row.id)
      if (wears !== on) setLabel.mutate({ taskId: task.id, labelId: row.id, on })
    }
  }
  const assign = (personId: string | null): void => {
    for (const task of selectedTasks) {
      if ((task.assignee?.id ?? null) !== personId) update.mutate({ id: task.id, body: { assignee_id: personId } })
    }
  }
  const toMilestone = (sectionId: string | null): void => {
    /* In page order, each to the milestone's end, so they keep their order. */
    const ordered = shownTasks.filter((task) => selected.has(task.id))
    for (const task of ordered) void writer.write({ op: 'move_step', id: task.id, section: sectionId, before: null })
  }
  const remove = (): void => {
    actions.onDeleteMany(selectedTasks)
    clearSelection()
  }

  /* ---- page keys: C, M, A, L, Esc ---- */
  const latest = useRef({ focusNew, clearSelection, setMenu, selecting: selected.size > 0 })
  latest.current = { focusNew, clearSelection, setMenu, selecting: selected.size > 0 }
  useEffect(() => {
    if (issueId !== null) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || typing(event.target)) return
      const now = latest.current
      const key = event.key.toLowerCase()
      if (event.key === 'Escape' && now.selecting) now.clearSelection()
      else if (key === 'c' && !event.shiftKey) now.focusNew()
      else if (key === 'm') now.setMenu('milestone')
      else if (key === 'a') now.setMenu('assignee')
      else if (key === 'l' && now.selecting) now.setMenu('label')
      else return
      event.preventDefault()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [issueId])

  if (issueId !== null) {
    return (
      <IssuePage
        key={issueId}
        taskId={issueId}
        folderId={folderId}
        page={page}
        today={today}
        actions={actions}
        onBack={closeIssue}
      />
    )
  }

  const rowContext: RowContext = { ...context, today }
  const toggle = (task: TaskCard): void =>
    task.status === 'abandoned' ? actions.onRestore(task) : actions.onToggleComplete(task)
  const milestoneName = new Map(sections.map((section) => [section.id, section.name]))

  const byline = (task: TaskCard, section: string | null): string => {
    const state = rowState(task, today)
    const date = closedOn.get(task.id)
    const where = !manual && section !== null ? ` · ${milestoneName.get(section) ?? ''}` : ''
    if (state === 'completed') return `${date === undefined ? 'Closed' : `Closed ${formatDayInline(date, today)}`}${where}`
    if (state === 'not-planned') return `Closed as not planned ${agoFor(Date.parse(task.updated_at))}${where}`
    const who = task.created_by === null ? '' : ` by ${person(task.created_by.id).name}`
    return `Opened ${agoFor(Date.parse(task.created_at))}${who}${where}`
  }

  const siblingRow = (from: HTMLElement, step: 1 | -1): HTMLElement | undefined => {
    const all = Array.from(table.current?.querySelectorAll<HTMLElement>('[data-row-key]') ?? [])
    return all[all.indexOf(from) + step]
  }

  const taskRow = (task: TaskCard, section: string | null, index: number): React.JSX.Element => {
    const state = rowState(task, today)
    const open = state === 'open' || state === 'in-progress'
    const drawn = drag.itemState(index)
    /* A closed row's dates are over; its byline says when it closed. */
    const { steps, due, starts, ...rest } = taskRowDisplay(task, rowContext)
    const display = open ? { ...rest, ...(due === undefined ? {} : { due }), ...(starts === undefined ? {} : { starts }) } : rest
    const labels = labelsOf(task)
    const checked = selected.has(task.id)
    const assignee = task.assignee === null ? null : { ...personDisplay(task.assignee), id: task.assignee.id }
    return (
      <li
        key={task.id}
        ref={drag.setItemRef(index)}
        style={{
          transform: drawn.offset === 0 ? undefined : `translate3d(0, ${String(drawn.offset)}px, 0)`,
          transition: drawn.isActive && !drawn.isSettling ? undefined : 'transform 150ms ease-out',
          zIndex: drawn.isActive ? 20 : undefined,
        }}
        className={cn('group/row relative border-t border-border', drawn.isActive ? 'bg-background' : undefined)}
      >
        <div
          data-row-key=""
          data-task-id={task.id}
          aria-selected={checked}
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget) return
            const key = event.key
            if (key === 'Enter' || key === 'o' || key === 'O') {
              event.preventDefault()
              openIssue(task)
            } else if (key === ' ') {
              event.preventDefault()
              toggle(task)
            } else if (key === 'x' || key === 'X') {
              event.preventDefault()
              toggleSelect(task.id, false)
            } else if ((key === 'j' || key === 'k') && !event.shiftKey) {
              event.preventDefault()
              siblingRow(event.currentTarget, key === 'j' ? 1 : -1)?.focus()
            } else if (event.altKey && manual && (key === 'ArrowUp' || key === 'ArrowDown')) {
              event.preventDefault()
              const target = index + (key === 'ArrowDown' ? 1 : -1)
              if (target >= 0 && target < rows.length) {
                const self = event.currentTarget
                reorder(index, target)
                requestAnimationFrame(() => self.isConnected && self.focus())
              }
            } else if (event.shiftKey && (key === 'ArrowUp' || key === 'ArrowDown')) {
              const other = siblingRow(event.currentTarget, key === 'ArrowDown' ? 1 : -1)?.dataset.taskId
              setSelected((current) => new Set([...current, task.id, ...(other === undefined ? [] : [other])]))
              anchor.current = task.id
            }
          }}
          className={cn(
            'flex min-h-[var(--row-height)] items-start gap-1.5 px-2 outline-none transition-colors duration-[var(--duration-fast)] hover:bg-muted/40 focus-visible:bg-muted/60 motion-reduce:transition-none',
            density === 'compact' ? 'py-0.5' : 'py-1.5',
            checked && 'bg-selected hover:bg-selected',
          )}
        >
          <SelectBox checked={checked} label={`Select ${task.title}`} onToggle={(event) => toggleSelect(task.id, event.shiftKey)} />
          <span className="flex w-4 shrink-0 justify-center">
            {manual && (
              <button
                type="button"
                aria-label={`Move ${task.title}`}
                {...drag.handleProps(index)}
                className={cn(
                  'flex h-6 w-4 cursor-grab items-center justify-center rounded-xs text-muted-foreground opacity-0 transition-opacity group-hover/row:opacity-100 focus-visible:opacity-100 active:cursor-grabbing pointer-coarse:opacity-100',
                  drawn.isActive && 'opacity-100',
                )}
              >
                <GripVertical aria-hidden className="size-3.5" />
              </button>
            )}
          </span>
          <span className="flex h-6 items-center self-start" title={WORD[state]}>
            <StateMark state={state} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                onClick={() => openIssue(task)}
                className={cn(
                  'min-w-0 truncate text-left text-sm font-section leading-6 hover:underline',
                  open ? 'text-foreground' : 'text-muted-foreground',
                  state === 'not-planned' && 'line-through',
                )}
              >
                {task.title}
              </button>
              {labels.map((each) => (
                <span key={each.id} className="flex max-sm:hidden">
                  <LabelChip name={each.name} color={each.color} />
                </span>
              ))}
            </div>
            {density === 'comfortable' && (
              <p className="truncate text-xs leading-4 text-muted-foreground">{byline(task, section)}</p>
            )}
          </div>
          <div className="flex h-6 shrink-0 items-center gap-2 self-start">
            <RowMeta
              className="shrink-0 max-sm:hidden"
              source={{
                ...display,
                ...(steps === undefined ? {} : { steps: { done: steps.complete, total: steps.total } }),
              }}
              given={{ assignee: true }}
              onToggleImportant={() => actions.onToggleImportant(task)}
            />
            <span className="flex w-9 justify-end">
              <CommentCount count={counts.get(task.id)} />
            </span>
            <span className="flex w-5 justify-end" title={assignee?.name}>
              {assignee !== null && <Face person={assignee} className="size-5 data-[size=sm]:size-5" />}
            </span>
          </div>
        </div>
      </li>
    )
  }

  const milestoneRow = (row: Extract<ListRow, { kind: 'milestone' }>, index: number): React.JSX.Element => {
    const drawn = drag.itemState(index)
    return (
      <li
        key={`m:${row.id}`}
        ref={drag.setItemRef(index)}
        aria-label={`Milestone ${row.name}`}
        style={{
          transform: drawn.offset === 0 ? undefined : `translate3d(0, ${String(drawn.offset)}px, 0)`,
          transition: 'transform 150ms ease-out',
        }}
        className="flex min-h-9 items-center gap-1.5 border-t border-border bg-muted/40 px-2"
      >
        <span aria-hidden className="flex size-6 shrink-0 items-center justify-center">
          <span className="size-2.5 rotate-45 rounded-xs border-[1.5px] border-muted-foreground" />
        </span>
        <h3 className="min-w-0 flex-1 truncate text-sm font-section text-foreground">{row.name}</h3>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {row.done} of {row.total}
        </span>
        <span aria-hidden className="h-1 w-16 shrink-0 overflow-hidden rounded-full bg-muted max-sm:w-10">
          <span
            className="block h-full rounded-full bg-muted-foreground"
            style={{ width: `${String(row.total === 0 ? 0 : Math.round((row.done / row.total) * 100))}%` }}
          />
        </span>
      </li>
    )
  }

  const addNew = (kind: string, text: string): void => {
    if (kind === 'milestone') {
      void writer.write({ op: 'add_milestone', name: text })
      return
    }
    /* Under a Milestone filter it goes into that milestone; under a Label
       filter it wears that label, or it would vanish the moment it was made. */
    const section = filters.milestone.kind === 'section' ? filters.milestone.id : null
    const id = crypto.randomUUID()
    void writer.write({ op: 'add_step', title: text, section, id }).then(() => {
      wearFilterLabel(id, label)
    })
  }

  const empty = state === 'open' ? 'No open issues' : state === 'closed' ? 'Nothing closed yet' : 'No issues yet'
  const peopleChoices = (members ?? []).map((member) => ({ id: member.user.id, name: person(member.user.id).name }))

  return (
    <div
      ref={keys}
      className="pb-2"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && selected.size > 0 && !typing(event.target)) {
          event.preventDefault()
          clearSelection()
        }
      }}
    >
      <div ref={table} className="rounded-[var(--radius-sm)] border border-border">
        <ListHeader
          state={state}
          counts={counted}
          onState={setState}
          filters={filters}
          onFilters={(next) => {
            setFilters(next)
            clearSelection()
          }}
          sort={sort}
          onSort={setSort}
          density={density}
          onDensity={setDensity}
          milestones={sections}
          people={peopleChoices}
          viewerId={me}
          labels={labelRows}
          shown={shownTasks.length}
          selected={selectedTasks.length}
          onSelectAll={() => setSelected(new Set(shownTasks.map((task) => task.id)))}
          onClear={clearSelection}
          onMark={(target) => void markAs(target)}
          onLabel={toggleLabel}
          onAssign={assign}
          onMilestone={toMilestone}
          onDelete={remove}
          onNew={focusNew}
          menu={menu}
          onMenu={setMenu}
        />
        <ul role="list" aria-label="Issues">
          {rows.map((row, index) =>
            row.kind === 'milestone' ? milestoneRow(row, index) : taskRow(row.task, row.section, index),
          )}
        </ul>
        {shownTasks.length === 0 && !(state !== 'open' && done.isPending) && (
          <p className="border-t border-border px-2 py-2 text-sm text-muted-foreground">{empty}</p>
        )}
        <div ref={composer} className="border-t border-border pl-1.5">
          <Composer
            variant="line"
            kinds={['step', 'milestone']}
            label="New issue"
            placeholder="New issue, or type / for a milestone"
            onSubmit={addNew}
            onImage={() => undefined}
          />
        </div>
      </div>
      <p aria-live="polite" className="sr-only">
        {drag.announcement}
      </p>
    </div>
  )
}
