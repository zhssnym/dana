import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import type { TaskRows } from '../../../pages/task-rows.js'
import type { TaskFilter } from '../../../views/filter.js'
import { taskMatchesFilter } from '../../../views/filter.js'
import { ChevronRight } from '../../../lib/icons.js'
import type { CanvasBlock, CanvasEditor } from './schema.js'
import { isSectionHeading } from './outline.js'
import { FreeformCompletedTask, useFreeformFlights } from './CanvasTask.js'

type TaskCard = Parameters<typeof TaskRows>[0]['tasks'][number]
type Context = Parameters<typeof TaskRows>[0]['context']
type Position = { top: number; left: number; width: number }

/** Group by the live document's Section parent; task records stay put. */
export function completedGroups(blocks: readonly CanvasBlock[], completed: ReadonlyMap<string, TaskCard>): Map<string | null, TaskCard[]> {
  const groups = new Map<string | null, TaskCard[]>()
  const visit = (items: readonly CanvasBlock[], section: string | null): void => {
    for (const block of items) {
      const parent = isSectionHeading(block) ? block.id : section
      if (block.type === 'danaTask') {
        const task = completed.get(block.props.taskId)
        if (task !== undefined) {
          const rows = groups.get(section) ?? []
          rows.push(task)
          groups.set(section, rows)
        }
      }
      visit(block.children, parent)
    }
  }
  visit(blocks, null)
  return groups
}

function CompletedDisclosure({ section, tasks, onHeight }: {
  readonly section: string | null
  readonly tasks: readonly TaskCard[]
  readonly onHeight?: (height: number) => void
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (onHeight === undefined || box.current === null) return
    const measure = (): void => { if (box.current !== null) onHeight(box.current.getBoundingClientRect().height) }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(box.current)
    return () => observer.disconnect()
  }, [onHeight])
  const id = `freeform-completed-${section ?? 'root'}`
  const root = section === null
  return <div ref={box} data-freeform-completed-disclosure={section ?? 'root'} className={root ? 'mt-3 border-t border-border pt-2' : 'pt-2'}>
    <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((value) => !value)}
      className="flex h-[var(--control-height)] w-full items-center gap-2 rounded-md px-2 text-left text-sm text-muted-foreground hover:bg-hover hover:text-foreground">
      <ChevronRight className={`size-4 transition-transform duration-[var(--duration-fast)] ${open ? 'rotate-90' : ''}`} aria-hidden="true" />
      <span>{root ? 'Completed' : 'Completed tasks'}</span><span className="text-xs tabular-nums text-quiet-foreground">{tasks.length}</span>
    </button>
    {open ? <div id={id} role="list" className="pl-2">{tasks.map((task) => <FreeformCompletedTask key={task.id} task={task} />)}</div> : null}
  </div>
}

function samePositions(a: Map<string, Position>, b: Map<string, Position>): boolean {
  if (a.size !== b.size) return false
  for (const [id, next] of b) {
    const old = a.get(id)
    if (old === undefined || old.top !== next.top || old.left !== next.left || old.width !== next.width) return false
  }
  return true
}

export function FreeformCompleted({ editor, container, completed, context, filter }: {
  readonly editor: CanvasEditor
  readonly container: React.RefObject<HTMLDivElement | null>
  readonly completed: readonly TaskCard[]
  readonly context: Context
  readonly filter?: TaskFilter
}): React.JSX.Element {
  const flights = useFreeformFlights()
  const [revision, setRevision] = useState(0)
  const [heights, setHeights] = useState<Map<string, number>>(() => new Map())
  const [positions, setPositions] = useState<Map<string, Position>>(() => new Map())
  useEffect(() => editor.onChange(() => setRevision((value) => value + 1)), [editor])
  const groups = useMemo(() => completedGroups(editor.document, new Map(completed
    .filter((task) => !flights.has(task.id) && (filter === undefined || taskMatchesFilter(task, filter, context.today)))
    .map((task) => [task.id, task]))), [editor, revision, completed, filter, context.today, flights])

  useLayoutEffect(() => {
    const root = container.current
    if (root === null) return
    const measure = (): void => {
      const canvas = root.querySelector<HTMLElement>('.dana-writing-canvas')
      if (canvas === null) return
      const origin = canvas.getBoundingClientRect()
      const next = new Map<string, Position>()
      for (const [section] of groups) {
        if (section === null) continue
        const outer = canvas.querySelector<HTMLElement>(`.bn-block-outer[data-id="${section}"]`)
        const block = outer?.querySelector<HTMLElement>(':scope > .bn-block')
        if (block === undefined || block === null) continue
        const target = block.querySelector<HTMLElement>(':scope > .bn-block-group') ?? block
        const anchor = target.getBoundingClientRect()
        next.set(section, { top: anchor.bottom - origin.top, left: anchor.left - origin.left, width: anchor.width })
      }
      setPositions((old) => samePositions(old, next) ? old : next)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(root)
    const mutations = new MutationObserver(measure)
    mutations.observe(root, { childList: true, subtree: true })
    window.addEventListener('resize', measure)
    return () => { observer.disconnect(); mutations.disconnect(); window.removeEventListener('resize', measure) }
  }, [container, groups, heights])

  const reserve = [...groups].flatMap(([section]) => section === null ? [] : [
    `.dana-freeform-completed .bn-block-outer[data-id="${section}"] > .bn-block { padding-block-end: ${heights.get(section) ?? 'calc(var(--control-height) + var(--spacing) * 2)'}${heights.has(section) ? 'px' : ''}; }`,
  ]).join('\n')
  return <>
    <style>{reserve}</style>
    <div className="pointer-events-none absolute inset-x-0 top-0 h-0">
      {[...groups].flatMap(([section, tasks]) => {
        if (section === null) return []
        const position = positions.get(section)
        return position === undefined ? [] : <div key={section} className="pointer-events-auto absolute" style={position}>
          <CompletedDisclosure section={section} tasks={tasks} onHeight={(height) => setHeights((old) => old.get(section) === height ? old : new Map(old).set(section, height))} />
        </div>
      })}
    </div>
    {groups.has(null) ? <CompletedDisclosure section={null} tasks={groups.get(null)!} /> : null}
  </>
}
