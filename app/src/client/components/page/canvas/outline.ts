import { MAX_SECTION_DEPTH } from '../../../../shared/page-document.js'

/** Validate explicit editor children; never infer ownership from preceding visible rows. */
export interface OutlineBlock {
  readonly id: string
  readonly type: string
  readonly props: {
    readonly [key: string]: unknown
    readonly level?: number
    readonly taskId?: string
    readonly isToggleable?: boolean
  }
  readonly children: readonly OutlineBlock[]
}

const LIST_TYPES = new Set([
  'bulletListItem',
  'numberedListItem',
  'checkListItem',
  'toggleListItem',
])

/** What a toggle may hold beside list items (the server's `TOGGLE_CHILD_KINDS`). */
const TOGGLE_CHILD_TYPES = new Set(['paragraph', 'quote', 'callout', 'codeBlock', 'divider'])

const LEAF_TYPES = new Set([
  'paragraph',
  'image',
  'file',
  'audio',
  'video',
  'quote',
  'callout',
  'codeBlock',
  'danaTask',
  'danaFolder',
  'diagram',
  'divider',
])

export function validateCanvasOutline(
  blocks: readonly OutlineBlock[],
): string | null {
  const blockIds = new Set<string>()
  const taskIds = new Set<string>()

  function visit(
    items: readonly OutlineBlock[],
    parentLevel: number,
    insideList: boolean,
    insideToggle = false,
  ): string | null {
    for (const item of items) {
      if (blockIds.has(item.id)) {
        return 'Each item must have its own identity.'
      }
      blockIds.add(item.id)

      if (item.type === 'heading') {
        if (insideList) {
          return 'Only list items can be nested inside a list item.'
        }
        if (item.props.isToggleable === false) {
          if (parentLevel !== 0 || item.children.length > 0) {
            return 'Document headings are presentation only and stay flat.'
          }
          continue
        }
        if (
          item.props.level !== parentLevel + 1 ||
          parentLevel >= MAX_SECTION_DEPTH
        ) {
          return 'Heading 1 belongs at the page root, with Heading 2 and Heading 3 nested in order.'
        }
        const failure = visit(item.children, item.props.level, false)
        if (failure !== null) return failure
        continue
      }

      if (LIST_TYPES.has(item.type)) {
        const failure = visit(item.children, parentLevel, true, item.type === 'toggleListItem')
        if (failure !== null) return failure
        continue
      }

      if (insideList && !(insideToggle && TOGGLE_CHILD_TYPES.has(item.type))) {
        return insideToggle ? 'A toggle holds text, lists, quotes, callouts, code and dividers.' : 'Only list items can be nested inside a list item.'
      }
      if (!LEAF_TYPES.has(item.type)) {
        return 'This block type is not supported in the canvas.'
      }
      if (item.children.length > 0) {
        return 'Only Work headings and list items can contain other items.'
      }
      if (item.type === 'danaTask') {
        const taskId = item.props.taskId
        if (!taskId || taskIds.has(taskId)) {
          return 'Each Task must reference one distinct Dana Task.'
        }
        taskIds.add(taskId)
      }
    }
    return null
  }

  return visit(blocks, 0, false)
}

/** Document deletion cannot become an implicit Task deletion or partial save. */
/** The Task ids a change would drop from the document; empty when it drops none. */
export function removedCanvasTasks(before: readonly OutlineBlock[], after: readonly OutlineBlock[]): string[] {
  function ids(blocks: readonly OutlineBlock[]): string[] {
    return blocks.flatMap((block) => [
      ...(block.type === 'danaTask' && block.props.taskId
        ? [block.props.taskId]
        : []),
      ...ids(block.children),
    ])
  }
  const remaining = new Set(ids(after))
  return ids(before).filter((id) => !remaining.has(id))
}
