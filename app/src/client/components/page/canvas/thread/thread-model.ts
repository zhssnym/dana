/*
The Work thread's derived state (M4 design §2.4, §2.9): which stretch of the
rail is solid and which is dashed, the one ringed "next" task, the finished
sections that fold on load, and the long leading runs of closed tasks that are
elided behind an "Earlier work" break.

**Nothing here is stored.** Everything is computed from the Work document and
the page's open-task list. A `danaTask` block whose task is not in the open
list is closed for the line's purpose, so drawing the thread needs no per-task
read. `toggle-<id>` still holds only what the user closed; this module never
writes it.

Pure: no DOM and no React. The fold helpers at the end are handed the
storage to use, so a test can hold it. `FolderCanvas` feeds this module and
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
  /** The page's open list also carries dropped tasks; they are closed work. */
  readonly status?: string | undefined
}

export type LineStyle = 'solid' | 'frontier' | 'dashed'

export interface ThreadInput {
  readonly blocks: readonly ThreadBlock[]
  /** The page's open tasks by task id. Anything else, and a dropped one, is closed. */
  readonly open: ReadonlyMap<string, ThreadTask>
  /** The civil today, `YYYY-MM-DD`. */
  readonly today: string
  readonly viewerId: string | null
  /** The page has more than one member. */
  readonly shared: boolean
  /** Section heading ids folded right now (auto or by the user). */
  readonly folded: ReadonlySet<string>
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
 * The line shows the frontier, per list (the root, and each section's own).
 * Blocks before the first one that holds an open task are solid; that block
 * is solid down to its badge and dashed after ("frontier"); every later one
 * is dashed. A list with nothing open is solid throughout. A section that
 * holds the frontier stays solid itself while it is open: its own list
 * carries the switch, so the line is solid from the heading down to the
 * first open task (its children overdraw it). Folded, it is the frontier.
 */
function drawLine(list: readonly ThreadBlock[], input: ThreadInput, line: Map<string, Exclude<LineStyle, 'solid'>>): void {
  let seen = false
  for (const block of list) {
    if (seen) line.set(block.id, 'dashed')
    else if (holdsOpen(block, input.open)) {
      if (!isSection(block) || input.folded.has(block.id)) line.set(block.id, 'frontier')
      seen = true
    }
    drawLine(ownList(block), input, line)
  }
}

function findNext(list: readonly ThreadBlock[], input: ThreadInput): string | null {
  for (const block of list) {
    if (isSection(block)) {
      if (input.folded.has(block.id)) continue
      const inner = findNext(ownList(block), input)
      if (inner !== null) return inner
      continue
    }
    if (block.type !== 'danaTask') continue
    const id = taskIdOf(block)
    const task = openCard(input.open, id)
    if (id === null || task === undefined) continue
    if (isWaiting(task, input.today)) continue
    if (input.shared && task.assignee !== null && task.assignee.id !== input.viewerId) continue
    return id
  }
  return null
}

export function threadModel(input: ThreadInput): ThreadModel {
  const line = new Map<string, Exclude<LineStyle, 'solid'>>()
  drawLine(input.blocks, input, line)
  return {
    line,
    next: findNext(input.blocks, input),
    hasTasks: input.blocks.some(holdsTask),
    anyOpen: input.blocks.some((block) => holdsOpen(block, input.open)),
  }
}

/**
 * Sections that are finished: they hold a task and no open one. They fold to
 * their heading on load. Computed once per load (ticks linger).
 */
export function finishedSections(blocks: readonly ThreadBlock[], open: ReadonlyMap<string, ThreadTask>): Set<string> {
  const found = new Set<string>()
  const walk = (list: readonly ThreadBlock[]): void => {
    for (const block of list) {
      if (!isSection(block)) continue
      if ((block.children ?? []).length > 0 && holdsTask(block) && !holdsOpen(block, open)) found.add(block.id)
      walk(ownList(block))
    }
  }
  walk(blocks)
  return found
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
 * A long leading done stretch: more than three closed tasks before the first
 * open one in a list shows only its last three. Everything from the first
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
    if (closed.length > KEEP_VISIBLE) {
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

/** Every section heading that has something to fold, in document order. */
export function foldableSections(blocks: readonly ThreadBlock[]): string[] {
  const ids: string[] = []
  const walk = (list: readonly ThreadBlock[]): void => {
    for (const block of list) if (isSection(block)) { if ((block.children ?? []).length > 0) ids.push(block.id); walk(ownList(block)) }
  }
  walk(blocks)
  return ids
}

const quoteId = (id: string): string => id.replace(/["\\]/g, '')
const outer = (id: string): string => `.dana-thread .bn-block-outer[data-id="${quoteId(id)}"]`

/**
 * The model as one style element's text: per-block rules by `data-id`, so
 * nothing is written into ProseMirror's DOM. Folded sections hide their
 * children, elided blocks are not drawn, a break block makes room above it
 * for the "Earlier work" button ThreadLayer places there.
 */
export function threadStyle(model: ThreadModel, folded: ReadonlySet<string>, elided: ReadonlySet<string>, breaks: ReadonlySet<string>): string {
  const rules: string[] = []
  for (const [id, style] of model.line) rules.push(`${outer(id)}{--dana-thread-line:var(--dana-thread-${style})}`)
  for (const id of folded) rules.push(`${outer(id)}>.bn-block>.bn-block-group{display:none}${outer(id)}>.bn-block{--dana-thread-caret:var(--dana-icon-chevron-right)}${outer(id)}>.bn-block>.bn-block-content{color:var(--muted-foreground)}`)
  if (elided.size > 0) rules.push(`${[...elided].map(outer).join(',')}{display:none}`)
  for (const id of breaks) rules.push(`${outer(id)}{padding-block-start:var(--row-height);--dana-thread-line-top:var(--row-height)}`)
  return rules.join('\n')
}

/* ---- Folding state (§2.9). Auto-fold is derived and never stored; the
   user's own close is `toggle-<id>` = "false", the key BlockNote's toggles
   already use. `opened` holds what the viewer opened this session. */

export interface FoldStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export function closedByUser(store: FoldStore | null, id: string): boolean {
  try { return store?.getItem(`toggle-${id}`) === 'false' } catch { return false }
}

/** What is folded now: the user's closes, and finished sections the viewer has not opened. */
export function foldedNow(sections: readonly string[], finished: ReadonlySet<string>, opened: ReadonlySet<string>, store: FoldStore | null): Set<string> {
  return new Set(sections.filter((id) => closedByUser(store, id) || (finished.has(id) && !opened.has(id))))
}

/** The viewer folds or unfolds a section. Only their own close is written. */
export function toggleFold(store: FoldStore | null, opened: Set<string>, id: string, isFolded: boolean): void {
  if (isFolded) {
    opened.add(id)
    try { if (closedByUser(store, id)) store?.removeItem(`toggle-${id}`) } catch { /* storage is optional */ }
  } else {
    opened.delete(id)
    try { store?.setItem(`toggle-${id}`, 'false') } catch { /* storage is optional */ }
  }
}

export interface FrozenFolds { readonly finished: ReadonlySet<string>; readonly elision: Elision }

/** Fold and elision are taken once per opening, so a tick never moves the page (ticks linger). */
export function freezeFolds(frozen: { current: FrozenFolds | null }, blocks: readonly ThreadBlock[], open: ReadonlyMap<string, ThreadTask>): FrozenFolds {
  frozen.current ??= { finished: finishedSections(blocks, open), elision: elision(blocks, open) }
  return frozen.current
}
