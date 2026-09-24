/** Validate explicit editor children; never infer ownership from preceding visible rows. */
export interface OutlineBlock {
  readonly id: string
  readonly type: string
  readonly props: { readonly [key: string]: unknown; readonly level?: number; readonly taskId?: string }
  readonly children: readonly OutlineBlock[]
}

export function validateCanvasOutline(blocks: readonly OutlineBlock[]): string | null {
  const blockIds = new Set<string>()
  const taskIds = new Set<string>()
  function visit(items: readonly OutlineBlock[], parentLevel: number): string | null {
    for (const item of items) {
      if (blockIds.has(item.id)) return 'Each item must have its own identity.'
      blockIds.add(item.id)
      if (item.type === 'heading') {
        if (item.props.level !== parentLevel + 1 || parentLevel >= 2) {
          return 'Heading 1 belongs at the page root; Heading 2 belongs inside Heading 1. Only two levels are supported.'
        }
        const failure = visit(item.children, item.props.level)
        if (failure !== null) return failure
      } else {
        if (!['paragraph', 'image', 'danaTask', 'diagram'].includes(item.type)) return 'This block type is not supported in the canvas.'
        if (item.children.length > 0) return 'Only headings can contain other items.'
        if (item.type === 'danaTask') {
          const taskId = item.props.taskId
          if (!taskId || taskIds.has(taskId)) return 'Each Task must reference one distinct Dana Task.'
          taskIds.add(taskId)
        }
      }
    }
    return null
  }
  return visit(blocks, 0)
}

/** Document deletion cannot become an implicit Task deletion or partial save. */
export function removesCanvasTask(before: readonly OutlineBlock[], after: readonly OutlineBlock[]): boolean {
  function ids(blocks: readonly OutlineBlock[]): string[] {
    return blocks.flatMap((block) => [
      ...(block.type === 'danaTask' && block.props.taskId ? [block.props.taskId] : []),
      ...ids(block.children),
    ])
  }
  const remaining = new Set(ids(after))
  return ids(before).some((id) => !remaining.has(id))
}
