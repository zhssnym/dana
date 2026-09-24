/*
"Turn into" for the block menu: one block's kind changes, its text and (where
the new kind can hold them) its children kept. A kind that cannot hold
children lifts them out to follow it, in order, so nothing is lost. Which
targets a surface offers is its own rule (`allowed` + `validate`), checked on a
simulated document before the item is shown, so a refused conversion is
never offered rather than offered and then explained.

Since 0038 every writing kind holds nested blocks (text, a heading, a list
item, a toggle, a quote, a callout), so a conversion between them keeps the
children where they are; only code lifts them. A Work Section is the one
exception: its children are Section content, not nested blocks, so a Section
turned into anything but a Section lifts them out after it.
*/
import { isSectionHeading, isToggleHeading } from './outline.js'

export type TurnKey = 'text' | 'h1' | 'h2' | 'h3' | 'th1' | 'th2' | 'th3' | 'todo' | 'toggle' | 'bullet' | 'numbered' | 'quote' | 'callout' | 'code'

export interface TurnTarget {
  readonly key: TurnKey
  readonly title: string
  readonly type: string
  readonly level?: 1 | 2 | 3
  /** A toggle heading: a presentation heading that folds its children
   * (Purpose, Results and a Task body only; see `TOGGLE_HEADING_SURFACES`). */
  readonly toggle?: true
}

export const TURN_TARGETS: readonly TurnTarget[] = [
  { key: 'text', title: 'Text', type: 'paragraph' },
  { key: 'h1', title: 'Heading 1', type: 'heading', level: 1 },
  { key: 'h2', title: 'Heading 2', type: 'heading', level: 2 },
  { key: 'h3', title: 'Heading 3', type: 'heading', level: 3 },
  { key: 'th1', title: 'Toggle heading 1', type: 'heading', level: 1, toggle: true },
  { key: 'th2', title: 'Toggle heading 2', type: 'heading', level: 2, toggle: true },
  { key: 'th3', title: 'Toggle heading 3', type: 'heading', level: 3, toggle: true },
  { key: 'todo', title: 'To-do list', type: 'checkListItem' },
  { key: 'toggle', title: 'Toggle list', type: 'toggleListItem' },
  { key: 'bullet', title: 'Bulleted list', type: 'bulletListItem' },
  { key: 'numbered', title: 'Numbered list', type: 'numberedListItem' },
  { key: 'quote', title: 'Quote', type: 'quote' },
  { key: 'callout', title: 'Callout', type: 'callout' },
  { key: 'code', title: 'Code', type: 'codeBlock' },
]

/** Kinds made of one run of text, the only ones that can be turned into another. */
export const TEXT_TYPES: ReadonlySet<string> = new Set(TURN_TARGETS.map((target) => target.type))

export interface TreeBlock {
  readonly id: string
  readonly type: string
  readonly props: Record<string, unknown>
  readonly content?: unknown
  readonly children: readonly TreeBlock[]
}

export function isCurrent(block: TreeBlock, target: TurnTarget): boolean {
  if (block.type !== target.type || (target.level !== undefined && block.props.level !== target.level)) return false
  return target.type !== 'heading' || (target.toggle === true) === isToggleHeading(block)
}

/** Whether a converted block keeps its children under it. */
function holdsChildren(block: TreeBlock, target: TurnTarget, headingToggles: boolean): boolean {
  const toSection = target.type === 'heading' && target.toggle !== true && headingToggles
  if (isSectionHeading(block) && !toSection) return false
  return target.type !== 'codeBlock'
}

/** Text runs, links and chips (a Dana Link's label) flattened, so Code loses no words. */
function plainText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content.map((inline: { type?: string; text?: string; content?: unknown; props?: { label?: unknown } }) =>
    inline.type === 'text' ? inline.text ?? ''
      : Array.isArray(inline.content) ? plainText(inline.content)
        : typeof inline.props?.label === 'string' ? inline.props.label : '').join('')
}

export interface Conversion {
  readonly update: { type: string; props: Record<string, unknown>; content?: unknown }
  readonly lifted: readonly TreeBlock[]
}

export function conversionOf(block: TreeBlock, target: TurnTarget, headingToggles: boolean | undefined): Conversion {
  const props: Record<string, unknown> = target.type === 'heading'
    ? target.toggle === true
      ? { level: target.level, isToggleable: true, presentation: true }
      : { level: target.level, ...(headingToggles === undefined ? {} : { isToggleable: headingToggles, presentation: false }) }
    : target.type === 'checkListItem' ? { checked: block.type === 'checkListItem' ? block.props.checked === true : false } : {}
  // Code holds plain text only; leaving code, its text is ordinary runs again.
  const content = target.type === 'codeBlock' || block.type === 'codeBlock'
    ? plainText(block.content)
    : undefined
  return {
    update: { type: target.type, props, ...(content === undefined ? {} : { content }) },
    lifted: holdsChildren(block, target, headingToggles === true) ? [] : block.children,
  }
}

/** The document as it would be after the conversion (ids, kinds and nesting only). */
export function simulate(document: readonly TreeBlock[], id: string, target: TurnTarget, headingToggles: boolean | undefined): TreeBlock[] {
  const walk = (items: readonly TreeBlock[]): TreeBlock[] => items.flatMap((item) => {
    if (item.id !== id) return [{ ...item, children: walk(item.children) }]
    const { update, lifted } = conversionOf(item, target, headingToggles)
    return [{ ...item, type: update.type, props: { ...item.props, ...update.props }, children: lifted.length > 0 ? [] : item.children }, ...lifted]
  })
  return walk(document)
}

/** The document after nesting a block under its previous sibling, or null when it has none. */
export function simulateNest(document: readonly TreeBlock[], id: string): TreeBlock[] | null {
  let moved = false
  const walk = (items: readonly TreeBlock[]): TreeBlock[] => {
    const out: TreeBlock[] = []
    for (const item of items) {
      const previous = out.at(-1)
      if (item.id === id && previous !== undefined) {
        out[out.length - 1] = { ...previous, children: [...previous.children, item] }
        moved = true
        continue
      }
      out.push({ ...item, children: walk(item.children) })
    }
    return out
  }
  const next = walk(document)
  return moved ? next : null
}

/** A block, its children, and theirs, without ids: a copy BlockNote numbers afresh. */
export function withoutIds(block: TreeBlock): Record<string, unknown> {
  const { id: _id, children, ...rest } = block
  return { ...rest, children: children.map(withoutIds) }
}

export function contains(block: TreeBlock, types: ReadonlySet<string>): boolean {
  return types.has(block.type) || block.children.some((child) => contains(child, types))
}

/*
Backspace at the start of a non-text block turns it into text, but only where
the result is one the canvas can keep. A Section that holds blocks (a Work
heading; a toggle heading is not one): turning it into text would dissolve the Section and move its Tasks
and writing out, which no outline rule refuses, so it is never attempted.
Returns the simulated document, or null when Backspace should do nothing.
*/
export function backspaceToText(document: readonly TreeBlock[], block: TreeBlock): TreeBlock[] | null {
  // A Section holding content never dissolves; a toggle heading turns into
  // text with its nested blocks kept (text holds them, 0038).
  if (isSectionHeading(block) && block.children.length > 0) return null
  return simulate(document, block.id, TURN_TARGETS[0]!, undefined)
}
