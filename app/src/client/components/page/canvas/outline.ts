import { MAX_NEST_DEPTH, MAX_SECTION_DEPTH } from '../../../../shared/page-document.js'

/** Validate explicit editor children; never infer ownership from preceding rows. */
export interface OutlineBlock {
  readonly id: string
  readonly type: string
  readonly props: {
    readonly [key: string]: unknown
    readonly level?: number
    readonly taskId?: string
    readonly isToggleable?: boolean
    readonly presentation?: boolean
  }
  readonly children: readonly OutlineBlock[]
}

/**
 * The one test for "is this heading a Work Section". A flat presentation heading
 * has `isToggleable: false`; a toggle heading has `isToggleable: true, presentation: true`.
 */
export function isSectionHeading(block: { readonly type: string; readonly props: { readonly [key: string]: unknown } }): boolean {
  return block.type === 'heading' && block.props.isToggleable !== false && block.props.presentation !== true
}

export function isToggleHeading(block: { readonly type: string; readonly props: { readonly [key: string]: unknown } }): boolean {
  return block.type === 'heading' && block.props.isToggleable === true && block.props.presentation === true
}

/**
 * Editor types that may hold nested blocks (the server's `NEST_PARENT_KINDS`). A Section
 * holds content by a different relation and is judged on its own.
 */
const NEST_PARENT_TYPES: ReadonlySet<string> = new Set([
  'paragraph',
  'heading',
  'bulletListItem',
  'numberedListItem',
  'checkListItem',
  'toggleListItem',
  'quote',
  'callout',
  'result',
])

const KNOWN_TYPES: ReadonlySet<string> = new Set([
  ...NEST_PARENT_TYPES,
  'image',
  'file',
  'audio',
  'video',
  'codeBlock',
  'danaTask',
  'danaFolder',
  'danaPage',
  'danaPageRef',
  'diagram',
  'divider',
])

export function holdsNested(block: { readonly type: string; readonly props: { readonly [key: string]: unknown } }): boolean {
  return NEST_PARENT_TYPES.has(block.type) && !isSectionHeading(block)
}

export function validateCanvasOutline(
  blocks: readonly OutlineBlock[],
): string | null {
  const blockIds = new Set<string>()
  const taskIds = new Set<string>()

  /**
   * `sectionLevel`: the level of the Section the items sit in (0 at the root);
   * `nestDepth`: how deep they sit under ordinary blocks.
   */
  function visit(
    items: readonly OutlineBlock[],
    sectionLevel: number,
    nestDepth: number,
  ): string | null {
    for (const item of items) {
      if (blockIds.has(item.id)) {
        return 'Each item must have its own identity.'
      }
      blockIds.add(item.id)

      if (!KNOWN_TYPES.has(item.type)) {
        return 'This block type is not supported in the canvas.'
      }

      if (isSectionHeading(item)) {
        if (nestDepth > 0) {
          return 'A heading that groups Work stays at the page root or inside another Work heading.'
        }
        if (
          item.props.level !== sectionLevel + 1 ||
          sectionLevel >= MAX_SECTION_DEPTH
        ) {
          return 'Heading 1 belongs at the page root, with Heading 2 and Heading 3 nested in order.'
        }
        const failure = visit(item.children, item.props.level, 0)
        if (failure !== null) return failure
        continue
      }

      if (item.type === 'danaTask') {
        if (nestDepth > 0) {
          return 'A Task stays in its section; it never nests under a block.'
        }
        const taskId = item.props.taskId
        if (!taskId || taskIds.has(taskId)) {
          return 'Each Task must reference one distinct Dana Task.'
        }
        taskIds.add(taskId)
      }

      if (nestDepth > MAX_NEST_DEPTH) {
        return `Blocks nest ${String(MAX_NEST_DEPTH)} levels deep at most.`
      }

      if (item.children.length > 0) {
        if (!holdsNested(item)) {
          return 'Blocks nest under text, a heading, a list item, a toggle, a quote or a callout.'
        }
        const failure = visit(item.children, sectionLevel, nestDepth + 1)
        if (failure !== null) return failure
      }
    }
    return null
  }

  return visit(blocks, 0, 0)
}

/** A shelf's headings are stored flat, so it keeps one heading level. */
export function shelfOutlineFailure(blocks: readonly OutlineBlock[]): boolean {
  return blocks.some((block) => (isSectionHeading(block) && block.props.level !== 1) || shelfOutlineFailure(block.children))
}

/** The task ids a change would drop. Deleting writing must never delete a task implicitly. */
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

/** The sub-pages (folder ids) a change would drop, as for tasks above. */
export function removedCanvasPages(before: readonly OutlineBlock[], after: readonly OutlineBlock[]): string[] {
  function ids(blocks: readonly OutlineBlock[]): string[] {
    return blocks.flatMap((block) => [
      ...(block.type === 'danaPage' && typeof block.props.folderId === 'string' && block.props.folderId !== ''
        ? [block.props.folderId]
        : []),
      ...ids(block.children),
    ])
  }
  const remaining = new Set(ids(after))
  return ids(before).filter((id) => !remaining.has(id))
}
