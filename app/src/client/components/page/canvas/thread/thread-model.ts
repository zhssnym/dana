/*
The Work thread's derived state (M4 design §2.4, §2.9): which stretch of the
rail is solid and which is dashed, the one ringed "next" task, and the long
leading runs of closed tasks that are elided behind an "Earlier work" break.
A section heading is a numbered stop and never folds.

**Nothing here is stored.** Everything is computed from the Work document and
the page's open-task list. A `danaTask` block whose task is not in the open
list is closed for the line's purpose, so drawing the thread needs no per-task
read. A `toggle-<id>` key stored for a section by an older build is ignored.

Pure: no DOM and no React. `FolderCanvas` feeds this module and
turns its answer into one style element (`threadStyle`).
*/
import { isSectionHeading } from '../outline.js'

export interface ThreadBlock {
  readonly id: string
  readonly type: string
  readonly props?: Readonly<Record<string, unknown>>
  readonly children?: readonly ThreadBlock[]
}

/** What the thread reads off an open task's card. */
export interface ThreadTask {
  readonly blocked_by_count?: number | undefined
  readonly start_date: string | null
  readonly assignee: { readonly id: string } | null
  readonly assignees?: readonly { readonly id: string }[]
  /** The page's open list also carries dropped tasks; they are closed work. */
  readonly status?: string | undefined
}

/**
 * 'covered' is solid on an opaque ground: a block after the done stretch's
 * end, inside a section the stretch runs through, hides that section's green.
 */
export type LineStyle = 'solid' | 'frontier' | 'dashed' | 'covered'

/**
 * The done stretch of the rail (AC-1514): drawn in the done colour from the
 * first completed task's badge ('done-start') to the global frontier's badge
 * ('done-frontier'), every item between them 'done'.
 */
export type ProgressState = 'done' | 'done-start' | 'done-frontier'

export interface ThreadInput {
  readonly blocks: readonly ThreadBlock[]
  /** The page's open tasks by task id. Anything else, and a dropped one, is closed. */
  readonly open: ReadonlyMap<string, ThreadTask>
  /** The civil today, `YYYY-MM-DD`. */
  readonly today: string
  readonly viewerId: string | null
  /** The page has more than one member. */
  readonly shared: boolean
  /** Blocks hidden behind an "Earlier work" break right now → that break's id. */
  readonly elided?: ReadonlyMap<string, string>
}

export interface ThreadModel {
  /** Blocks whose rail is not plain solid. Absent means solid. */
  readonly line: ReadonlyMap<string, Exclude<LineStyle, 'solid'>>
  /** The task id of the one ringed task, or null. */
  readonly next: string | null
  /** The document holds at least one task. */
  readonly hasTasks: boolean
  /** At least one task is open. */
  readonly anyOpen: boolean
  /**
   * The done stretch, by block id; absent means not on it. Nothing is on it
   * before a task is done. It belongs to the project, not to the viewer: it
   * stops at the first open task in document order, whoever's it is.
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

/** An open task's card: on the open list and not dropped. */
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

/**
 * Waiting: it has an open blocker, or its start is still ahead. The ring
 * skips it, and it shows the hourglass.
 */
export function isWaiting(task: ThreadTask, today: string): boolean {
  return (task.blocked_by_count ?? 0) > 0 || (task.start_date !== null && task.start_date > today)
}

/**
 * The line shows the frontier, once for the whole document (the walk goes
 * in document order through every section's own list, one `seen` for all).
 * Blocks before the first one that holds an open task are solid; that block
 * is solid down to its badge and dashed after ("frontier"); every later
 * block, at any depth, is dashed. A thread with nothing open is solid
 * throughout. A section that holds the frontier stays solid itself while it
 * is open: its own list carries the switch, so the line is solid from the
 * heading down to the first open task (its children overdraw it).
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
 * The done stretch, in one document-order walk of the thread's items. It
 * starts at the first completed task (a dropped one never starts it, but the
 * stretch runs through one) and stops at the first open task; with nothing
 * open, at the last task. A section holding the frontier is 'done' (its own
 * list carries the stop). When
 * the start is hidden behind "Earlier work", the break block starts it
 * instead, green over its whole length.
 */
function drawProgress(input: ThreadInput): { progress: Map<string, ProgressState>; covered: Set<string> } {
  type Kind = 'open' | 'done' | 'closed' | 'other'
  /* `within`: the sections the item sits in, outermost first. */
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
  /* With nothing open the stretch ends on the last task, and a section it
     runs through is green over its whole height: the end's own line below its
     badge, and every item after it in that section, cover it. (With an open
     task they are dashed, which already does.) */
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

/** The next ring: the first task, in document order through every section, the viewer can do now. */
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
  /** Hidden block id → the id of the break block that reveals it. */
  readonly elided: ReadonlyMap<string, string>
  /** The first visible block after each elided run: it carries the break. */
  readonly breaks: ReadonlySet<string>
}

/**
 * A long leading done stretch: five or more closed tasks before the first
 * open one in a list show only their last three. Everything from the first
 * closed task up to the third-last one is elided (notes between them too);
 * what sits above the first closed task (a section's intro) stays.
 */
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

/** How far the done colour reaches down a block in `state`; `now` says where a block new to the stretch grows from. */
function fillOf(state: ProgressState | undefined, now: ProgressState): string {
  if (state === undefined) return now === 'done-start' ? 'var(--dana-thread-knee)' : '0px'
  return state === 'done-frontier' ? 'var(--dana-thread-knee)' : '100%'
}

/**
 * The model as one style element's text: per-block rules by `data-id`, so
 * nothing is written into ProseMirror's DOM. Elided blocks are not drawn, a break block makes room above it
 * for the "Earlier work" button ThreadLayer places there.
 *
 * `grownFrom` is the done stretch before this viewer's tick, while the one
 * motion plays (AC-1514): each block whose fill changed grows from where it
 * was. An animation, not a transition, so it plays on blocks the editor has
 * only just drawn (a repeating task's tick remounts it).
 */
export function threadStyle(model: ThreadModel, elided: ReadonlySet<string>, breaks: ReadonlySet<string>, grownFrom: ReadonlyMap<string, ProgressState> | null = null): string {
  const rules: string[] = []
  const grow: string[] = []
  for (const [id, style] of model.line) if (!model.progress.has(id)) rules.push(`${outer(id)}{--dana-thread-line:var(--dana-thread-${style})}`)
  if (model.progress.size > 0) rules.push(`${[...model.progress.keys()].map(outer).join(',')}{--dana-thread-width:var(--dana-thread-weight)}`)
  /* The done stretch: the done colour down to the badge ('done-start' from
     it, 'done-frontier' to it), over the block's own grey line. */
  const growing: string[] = []
  for (const [id, state] of model.progress) {
    const fill = fillOf(state, state)
    rules.push(`${outer(id)}{--dana-thread-line:var(--dana-thread-${state});--dana-thread-under:var(--dana-thread-${model.line.get(id) ?? 'solid'});--dana-thread-fill:${fill}}`)
    const from = grownFrom === null ? fill : fillOf(grownFrom.get(id), state)
    if (from !== fill) growing.push(id)
  }
  /* One line growing down, not pieces growing at once: the time is shared
     out in document order, each block taking its turn (linear, so the pieces
     meet), the last easing to its stop. */
  const turns = growing.length
  growing.forEach((id, at) => {
    const ease = at === turns - 1 ? 'var(--ease-standard)' : 'linear'
    const from = fillOf(grownFrom?.get(id), model.progress.get(id)!)
    grow.push(`${outer(id)}{--dana-thread-from:${from};animation:dana-thread-grow calc(var(--duration-slow) / ${turns}) ${ease} calc(var(--duration-slow) * ${at} / ${turns}) both}`)
  })
  if (grow.length > 0) rules.push(`@media (prefers-reduced-motion: no-preference){${grow.join('')}}`)
  if (elided.size > 0) rules.push(`${[...elided].map(outer).join(',')}{display:none}`)
  /* The break's line is cut where its label sits, unless the done stretch
     runs through it: then the green runs past the label, as it does through
     what the label hides. */
  for (const id of breaks) {
    const cut = model.progress.has(id) ? '' : ';--dana-thread-line-top:var(--row-height)'
    rules.push(`${outer(id)}{padding-block-start:var(--row-height);--dana-thread-knee:calc(var(--row-height) + var(--dana-thread-center))${cut}}`)
  }
  return rules.join('\n')
}

export interface FrozenElision { readonly elision: Elision }

/** Elision is taken once per opening, so a tick never moves the page (ticks linger). */
export function freezeElision(frozen: { current: FrozenElision | null }, blocks: readonly ThreadBlock[], open: ReadonlyMap<string, ThreadTask>): FrozenElision {
  frozen.current ??= { elision: elision(blocks, open) }
  return frozen.current
}
