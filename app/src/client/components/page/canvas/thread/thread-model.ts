// The Work thread's derived state: solid and dashed rail, the one ringed "next"
// task, and long closed runs elided behind "Earlier work". Pure and never stored;
// a task not on the open list counts as closed.
import { isSectionHeading } from '../outline.js'

export interface ThreadBlock {
  readonly id: string
  readonly type: string
  readonly props?: Readonly<Record<string, unknown>>
  readonly children?: readonly ThreadBlock[]
}

export interface ThreadTask {
  readonly blocked_by_count?: number | undefined
  readonly start_date: string | null
  readonly assignee: { readonly id: string } | null
  readonly assignees?: readonly { readonly id: string }[]
  /** The open list also carries dropped tasks; they are closed work. */
  readonly status?: string | undefined
}

/**
 * 'covered' is solid on an opaque ground: it hides a section's green after the
 * done stretch ends.
 */
export type LineStyle = 'solid' | 'frontier' | 'dashed' | 'covered'

/**
 * The done stretch (AC-1514), from the first completed task's badge ('done-start')
 * to the frontier's ('done-frontier').
 */
export type ProgressState = 'done' | 'done-start' | 'done-frontier'

export interface ThreadInput {
  readonly blocks: readonly ThreadBlock[]
  /** The page's open tasks by id. Anything else, and a dropped one, is closed. */
  readonly open: ReadonlyMap<string, ThreadTask>
  readonly today: string
  readonly viewerId: string | null
  readonly shared: boolean
  /** Blocks hidden behind an "Earlier work" break → that break's id. */
  readonly elided?: ReadonlyMap<string, string>
}

export interface ThreadModel {
  /** Blocks whose rail is not plain solid. Absent means solid. */
  readonly line: ReadonlyMap<string, Exclude<LineStyle, 'solid'>>
  /** The one ringed task, or null. */
  readonly next: string | null
  readonly hasTasks: boolean
  readonly anyOpen: boolean
  /**
   * Absent means not on it. It belongs to the project, not the viewer: it stops at the
   * first open task, whoever's it is.
   */
  readonly progress: ReadonlyMap<string, ProgressState>
}

function taskIdOf(block: ThreadBlock): string | null {
  if (block.type === 'danaTask') {
    const id = block.props?.['taskId']
    return typeof id === 'string' && id !== '' ? id : null
  }
  if (block.type === 'checkListItem') return block.id
  return null
}

function isTask(block: ThreadBlock): boolean {
  return taskIdOf(block) !== null
}

/** On the open list and not dropped. */
function openCard(open: ReadonlyMap<string, ThreadTask>, id: string | null): ThreadTask | undefined {
  const task = id === null ? undefined : open.get(id)
  return task === undefined || task.status === 'abandoned' ? undefined : task
}

function isOpenTask(block: ThreadBlock, open: ReadonlyMap<string, ThreadTask>): boolean {
  if (block.type === 'checkListItem') return block.props?.['checked'] !== true
  return openCard(open, taskIdOf(block)) !== undefined
}

/** Finished and not dropped: a closed task that can start the done stretch. */
function isCompletedTask(block: ThreadBlock, open: ReadonlyMap<string, ThreadTask>): boolean {
  if (!isTask(block) || isOpenTask(block, open)) return false
  return block.type !== 'danaTask' || open.get(taskIdOf(block) ?? '')?.status !== 'abandoned'
}

export function isSection(block: ThreadBlock): boolean {
  return block.type === 'heading' && isSectionHeading({ type: block.type, props: (block.props ?? {}) as Record<string, unknown> })
}

/** A section's own list: what the rail runs beside under its heading. */
function ownList(block: ThreadBlock): readonly ThreadBlock[] {
  return isSection(block) ? block.children ?? [] : []
}

function holdsOpen(block: ThreadBlock, open: ReadonlyMap<string, ThreadTask>): boolean {
  if (isOpenTask(block, open)) return true
  return ownList(block).some((child) => holdsOpen(child, open))
}

function holdsTask(block: ThreadBlock): boolean {
  if (isTask(block)) return true
  return ownList(block).some(holdsTask)
}

/** Waiting: an open blocker, or a start still ahead. The ring skips it. */
export function isWaiting(task: ThreadTask, today: string): boolean {
  return (task.blocked_by_count ?? 0) > 0 || (task.start_date !== null && task.start_date > today)
}

/**
 * One document-order walk: solid before the first block holding an open task, that
 * block "frontier", everything after dashed. A section holding the frontier stays solid.
 */
function drawLine(list: readonly ThreadBlock[], input: ThreadInput, line: Map<string, Exclude<LineStyle, 'solid'>>, state: { seen: boolean }): void {
  for (const block of list) {
    if (state.seen) line.set(block.id, 'dashed')
    else if (holdsOpen(block, input.open) && !isSection(block)) {
      line.set(block.id, 'frontier')
      state.seen = true
    }
    drawLine(ownList(block), input, line, state)
  }
}

/**
 * The done stretch runs from the first completed task to the first open one (or the
 * last task). If its start is elided, the break block starts it instead.
 */
function drawProgress(input: ThreadInput): { progress: Map<string, ProgressState>; covered: Set<string> } {
  type Kind = 'open' | 'done' | 'closed' | 'other'
  // `within`: the sections the item sits in, outermost first.
  const items: { readonly id: string; readonly kind: Kind; readonly within: readonly string[] }[] = []
  const kindOf = (block: ThreadBlock): Kind => {
    if (!isTask(block)) return 'other'
    return isOpenTask(block, input.open) ? 'open' : isCompletedTask(block, input.open) ? 'done' : 'closed'
  }
  const walk = (list: readonly ThreadBlock[], within: readonly string[]): void => {
    for (const block of list) {
      items.push({ id: block.id, kind: kindOf(block), within })
      walk(ownList(block), [...within, block.id])
    }
  }
  walk(input.blocks, [])
  const progress = new Map<string, ProgressState>()
  const covered = new Set<string>()
  const none = { progress, covered }
  const start = items.findIndex((item) => item.kind === 'done')
  if (start === -1) return none
  const frontier = items.findIndex((item) => item.kind === 'open')
  if (frontier !== -1 && frontier < start) return none
  let end = frontier
  for (let at = items.length - 1; end === -1 && at >= 0; at -= 1) if (items[at]!.kind !== 'other') end = at
  if (end <= start) return none
  for (let at = start; at <= end; at += 1) progress.set(items[at]!.id, at === start ? 'done-start' : at === end ? 'done-frontier' : 'done')
  // With nothing open, a section the stretch ends in is green over its whole height.
  if (frontier === -1) {
    for (let at = end; at < items.length; at += 1) if (items[at]!.within.some((id) => progress.has(id))) covered.add(items[at]!.id)
  }
  const breakId = input.elided?.get(items[start]!.id)
  if (breakId !== undefined) {
    for (const id of [...progress.keys()]) if (input.elided?.has(id) === true) progress.delete(id)
    if (progress.get(breakId) !== 'done-frontier') progress.set(breakId, 'done')
  }
  return { progress, covered }
}

/** The next ring: the first task, through every section, the viewer can do now. */
function findNext(list: readonly ThreadBlock[], input: ThreadInput): string | null {
  for (const block of list) {
    if (isSection(block)) {
      const inner = findNext(ownList(block), input)
      if (inner !== null) return inner
      continue
    }
    if (block.type !== 'danaTask') continue
    const id = taskIdOf(block)
    const task = openCard(input.open, id)
    if (id === null || task === undefined) continue
    if (isWaiting(task, input.today)) continue
    if (input.shared && (task.assignees?.length ?? (task.assignee ? 1 : 0)) > 0 &&
        !(task.assignees?.some((person) => person.id === input.viewerId)
          ?? task.assignee?.id === input.viewerId)) continue
    return id
  }
  return null
}

export function threadModel(input: ThreadInput): ThreadModel {
  const line = new Map<string, Exclude<LineStyle, 'solid'>>()
  drawLine(input.blocks, input, line, { seen: false })
  const { progress, covered } = drawProgress(input)
  for (const id of covered) if (!line.has(id)) line.set(id, 'covered')
  return {
    line,
    next: findNext(input.blocks, input),
    hasTasks: input.blocks.some(holdsTask),
    anyOpen: input.blocks.some((block) => holdsOpen(block, input.open)),
    progress,
  }
}

/** How many closed tasks a long leading stretch keeps in view. */
export const KEEP_VISIBLE = 3

export interface Elision {
  /** Hidden block id → the break block that reveals it. */
  readonly elided: ReadonlyMap<string, string>
  /** The first visible block after each elided run: it carries the break. */
  readonly breaks: ReadonlySet<string>
}

/** Five or more closed tasks before the first open one show only the last three. */
export function elision(blocks: readonly ThreadBlock[], open: ReadonlyMap<string, ThreadTask>): Elision {
  const elided = new Map<string, string>()
  const breaks = new Set<string>()
  const walk = (list: readonly ThreadBlock[]): void => {
    const frontier = list.findIndex((block) => holdsOpen(block, open))
    const end = frontier === -1 ? list.length : frontier
    const closed: number[] = []
    for (let at = 0; at < end; at += 1) if (isTask(list[at]!) && !isOpenTask(list[at]!, open)) closed.push(at)
    // Only a run that would hide at least two rows is worth a break.
    if (closed.length > KEEP_VISIBLE + 1) {
      const keepFrom = closed[closed.length - KEEP_VISIBLE]!
      const breakId = list[keepFrom]!.id
      breaks.add(breakId)
      for (let at = closed[0]!; at < keepFrom; at += 1) elided.set(list[at]!.id, breakId)
    }
    for (const block of list) walk(ownList(block))
  }
  walk(blocks)
  return { elided, breaks }
}

const quoteId = (id: string): string => id.replace(/["\\]/g, '')
const outer = (id: string): string => `.dana-thread .bn-block-outer[data-id="${quoteId(id)}"]`

/**
 * How far the done colour reaches down a block; `now` says where a newly added block
 * grows from.
 */
function fillOf(state: ProgressState | undefined, now: ProgressState): string {
  if (state === undefined) return now === 'done-start' ? 'var(--dana-thread-knee)' : '0px'
  return state === 'done-frontier' ? 'var(--dana-thread-knee)' : '100%'
}

/**
 * The model as one style element keyed by `data-id`. `grownFrom` plays the tick
 * motion as an animation, not a transition, so it runs on freshly drawn blocks too.
 */
export function threadStyle(model: ThreadModel, elided: ReadonlySet<string>, breaks: ReadonlySet<string>, grownFrom: ReadonlyMap<string, ProgressState> | null = null): string {
  const rules: string[] = []
  const grow: string[] = []
  for (const [id, style] of model.line) if (!model.progress.has(id)) rules.push(`${outer(id)}{--dana-thread-line:var(--dana-thread-${style})}`)
  if (model.progress.size > 0) rules.push(`${[...model.progress.keys()].map(outer).join(',')}{--dana-thread-width:var(--dana-thread-weight)}`)
  // The done colour down to the badge, over the block's own grey line.
  const growing: string[] = []
  for (const [id, state] of model.progress) {
    const fill = fillOf(state, state)
    rules.push(`${outer(id)}{--dana-thread-line:var(--dana-thread-${state});--dana-thread-under:var(--dana-thread-${model.line.get(id) ?? 'solid'});--dana-thread-fill:${fill}}`)
    const from = grownFrom === null ? fill : fillOf(grownFrom.get(id), state)
    if (from !== fill) growing.push(id)
  }
  // One line growing down: time shared out in document order, linear so the pieces meet.
  const turns = growing.length
  growing.forEach((id, at) => {
    const ease = at === turns - 1 ? 'var(--ease-standard)' : 'linear'
    const from = fillOf(grownFrom?.get(id), model.progress.get(id)!)
    grow.push(`${outer(id)}{--dana-thread-from:${from};animation:dana-thread-grow calc(var(--duration-slow) / ${turns}) ${ease} calc(var(--duration-slow) * ${at} / ${turns}) both}`)
  })
  if (grow.length > 0) rules.push(`@media (prefers-reduced-motion: no-preference){${grow.join('')}}`)
  if (elided.size > 0) rules.push(`${[...elided].map(outer).join(',')}{display:none}`)
  // A break's line is cut at its label unless the done stretch runs through it.
  for (const id of breaks) {
    const cut = model.progress.has(id) ? '' : ';--dana-thread-line-top:var(--row-height)'
    rules.push(`${outer(id)}{padding-block-start:var(--row-height);--dana-thread-knee:calc(var(--row-height) + var(--dana-thread-center))${cut}}`)
  }
  return rules.join('\n')
}

export interface FrozenElision { readonly elision: Elision }

/** Taken once per opening, so a tick never moves the page. */
export function freezeElision(frozen: { current: FrozenElision | null }, blocks: readonly ThreadBlock[], open: ReadonlyMap<string, ThreadTask>): FrozenElision {
  frozen.current ??= { elision: elision(blocks, open) }
  return frozen.current
}
