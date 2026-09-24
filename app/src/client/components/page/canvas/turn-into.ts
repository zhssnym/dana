/*
"Turn into" for the block menu: one block's kind changes, its text and (where
the new kind can hold them) its children kept. A kind that cannot hold
children lifts them out to follow it, in order, so nothing is lost. Which
targets a surface offers is its own rule (`allowed` + `validate`), checked on a
simulated document before the item is shown, so a refused conversion is
never offered rather than offered and then explained.
*/

export type TurnKey = 'text' | 'h1' | 'h2' | 'h3' | 'todo' | 'bullet' | 'numbered' | 'quote' | 'callout' | 'code'

export interface TurnTarget {
  readonly key: TurnKey
  readonly title: string
  readonly type: string
  readonly level?: 1 | 2 | 3
}

export const TURN_TARGETS: readonly TurnTarget[] = [
  { key: 'text', title: 'Text', type: 'paragraph' },
  { key: 'h1', title: 'Heading 1', type: 'heading', level: 1 },
  { key: 'h2', title: 'Heading 2', type: 'heading', level: 2 },
  { key: 'h3', title: 'Heading 3', type: 'heading', level: 3 },
  { key: 'todo', title: 'To-do list', type: 'checkListItem' },
  { key: 'bullet', title: 'Bulleted list', type: 'bulletListItem' },
  { key: 'numbered', title: 'Numbered list', type: 'numberedListItem' },
  { key: 'quote', title: 'Quote', type: 'quote' },
  { key: 'callout', title: 'Callout', type: 'callout' },
  { key: 'code', title: 'Code', type: 'codeBlock' },
]

/** Kinds made of one run of text, the only ones that can be turned into another. */
export const TEXT_TYPES: ReadonlySet<string> = new Set(TURN_TARGETS.map((target) => target.type))
const LIST_TYPES: ReadonlySet<string> = new Set(['bulletListItem', 'numberedListItem', 'checkListItem'])

export interface TreeBlock {
  readonly id: string
  readonly type: string
  readonly props: Record<string, unknown>
  readonly content?: unknown
  readonly children: readonly TreeBlock[]
}

export function isCurrent(block: TreeBlock, target: TurnTarget): boolean {
  return block.type === target.type && (target.level === undefined || block.props.level === target.level)
}

/** Whether a converted block keeps its children under it. */
function holdsChildren(target: TurnTarget, headingToggles: boolean): boolean {
  return LIST_TYPES.has(target.type) || (target.type === 'heading' && headingToggles)
}

function plainText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content.map((inline: { type?: string; text?: string; content?: { text?: string }[] }) =>
    inline.type === 'text' ? inline.text ?? '' : inline.type === 'link' ? (inline.content ?? []).map((run) => run.text ?? '').join('') : '').join('')
}

export interface Conversion {
  readonly update: { type: string; props: Record<string, unknown>; content?: unknown }
  readonly lifted: readonly TreeBlock[]
}

export function conversionOf(block: TreeBlock, target: TurnTarget, headingToggles: boolean | undefined): Conversion {
  const props: Record<string, unknown> = target.type === 'heading'
    ? { level: target.level, ...(headingToggles === undefined ? {} : { isToggleable: headingToggles }) }
    : target.type === 'checkListItem' ? { checked: block.type === 'checkListItem' ? block.props.checked === true : false } : {}
  // Code holds plain text only; leaving code, its text is ordinary runs again.
  const content = target.type === 'codeBlock' || block.type === 'codeBlock'
    ? plainText(block.content)
    : undefined
  return {
    update: { type: target.type, props, ...(content === undefined ? {} : { content }) },
    lifted: holdsChildren(target, headingToggles === true) ? [] : block.children,
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
