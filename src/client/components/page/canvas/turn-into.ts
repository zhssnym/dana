// "Turn into": the block keeps its text, and its children where the new kind holds
// them, else they follow it. Targets are checked on a simulated document first, so a
// refused conversion is never offered. A Section's children always lift out.
import { isSectionHeading, isToggleHeading } from './outline.js'

export type TurnKey = 'text' | 'h1' | 'h2' | 'h3' | 'th1' | 'th2' | 'th3' | 'toggle' | 'bullet' | 'numbered' | 'quote' | 'callout' | 'code' | 'result'

export const HEADING_NAMES = { 1: 'Large heading', 2: 'Medium heading', 3: 'Small heading' } as const

export interface TurnTarget {
  readonly key: TurnKey
  readonly title: string
  readonly type: string
  readonly level?: 1 | 2 | 3
  /** A toggle heading: a presentation heading that folds its children. */
  readonly toggle?: true
}

export const TURN_TARGETS: readonly TurnTarget[] = [
  { key: 'text', title: 'Text', type: 'paragraph' },
  { key: 'h1', title: HEADING_NAMES[1], type: 'heading', level: 1 },
  { key: 'h2', title: HEADING_NAMES[2], type: 'heading', level: 2 },
  { key: 'h3', title: HEADING_NAMES[3], type: 'heading', level: 3 },
  { key: 'th1', title: 'Toggle large heading', type: 'heading', level: 1, toggle: true },
  { key: 'th2', title: 'Toggle medium heading', type: 'heading', level: 2, toggle: true },
  { key: 'th3', title: 'Toggle small heading', type: 'heading', level: 3, toggle: true },
  { key: 'toggle', title: 'Toggle list', type: 'toggleListItem' },
  { key: 'bullet', title: 'Bulleted list', type: 'bulletListItem' },
  { key: 'numbered', title: 'Numbered list', type: 'numberedListItem' },
  { key: 'quote', title: 'Quote', type: 'quote' },
  { key: 'callout', title: 'Callout', type: 'callout' },
  { key: 'code', title: 'Code', type: 'codeBlock' },
  // Offered on the Results tab alone (`offersResults`).
  { key: 'result', title: 'Result', type: 'result' },
]

/** Kinds made of one run of text. A stored to-do still turns into any of these. */
export const TEXT_TYPES: ReadonlySet<string> = new Set([...TURN_TARGETS.map((target) => target.type), 'checkListItem'])

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

function holdsChildren(block: TreeBlock, target: TurnTarget, headingToggles: boolean): boolean {
  const toSection = target.type === 'heading' && target.toggle !== true && headingToggles
  if (isSectionHeading(block) && !toSection) return false
  return target.type !== 'codeBlock'
}

/** Text, links and chip labels flattened, so Code loses no words. */
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
    : {}
  // Code holds plain text only; leaving code, its text becomes ordinary runs again.
  const content = target.type === 'codeBlock' || block.type === 'codeBlock'
    ? plainText(block.content)
    : undefined
  return {
    update: { type: target.type, props, ...(content === undefined ? {} : { content }) },
    lifted: holdsChildren(block, target, headingToggles === true) ? [] : block.children,
  }
}

/** The document after the conversion (ids, kinds and nesting only). */
export function simulate(document: readonly TreeBlock[], id: string, target: TurnTarget, headingToggles: boolean | undefined): TreeBlock[] {
  const walk = (items: readonly TreeBlock[]): TreeBlock[] => items.flatMap((item) => {
    if (item.id !== id) return [{ ...item, children: walk(item.children) }]
    const { update, lifted } = conversionOf(item, target, headingToggles)
    return [{ ...item, type: update.type, props: { ...item.props, ...update.props }, children: lifted.length > 0 ? [] : item.children }, ...lifted]
  })
  return walk(document)
}

/** The document after nesting a block under its previous sibling, or null if it has none. */
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

/** A copy without ids, so BlockNote assigns fresh ones. */
export function withoutIds(block: TreeBlock): Record<string, unknown> {
  const { id: _id, children, ...rest } = block
  return { ...rest, children: children.map(withoutIds) }
}

export function contains(block: TreeBlock, types: ReadonlySet<string>): boolean {
  return types.has(block.type) || block.children.some((child) => contains(child, types))
}

// Backspace at the start turns a block into text where the canvas can keep it. A
// Section holding blocks never dissolves. Null means do nothing.
export function backspaceToText(document: readonly TreeBlock[], block: TreeBlock): TreeBlock[] | null {
  if (isSectionHeading(block) && block.children.length > 0) return null
  return simulate(document, block.id, TURN_TARGETS[0]!, undefined)
}
