// The one nesting validator for every document home. Each applier calls it over the final outline
// before its first write. It does not check identities or retention; appliers do that first.
import { MAX_NEST_DEPTH, isMediaKind, mayNest, mayNestUnder } from '../../shared/page-document.js'

export interface NestingItem {
  readonly kind: 'block' | 'task'
  readonly id: string
  /** Work grouping; null on every home but a Folder's Main page. */
  readonly section_block_id: string | null
  readonly list_parent_block_id: string | null
}

/**
 * Null when the outline's nesting is valid, otherwise the refusal sentence.
 * `kindOf` answers the final kind of this document's blocks and undefined for anything else.
 */
export function nestingProblem(
  outline: readonly NestingItem[],
  kindOf: (id: string) => string | undefined,
): string | null {
  const seen = new Map<string, { section: string | null; depth: number }>()
  for (const item of outline) {
    const parent = item.list_parent_block_id
    let depth = 0
    if (parent !== null) {
      if (item.kind !== 'block') return 'A Task is never a nested block.'
      const kind = kindOf(item.id)
      if (kind === undefined || !mayNest(kind)) return 'A Section never nests under a block.'
      const parentKind = kindOf(parent)
      if (parentKind === undefined || !mayNestUnder(kind, parentKind)) {
        return 'A block nests under text, a heading, a list item, a toggle, a quote or a callout of this page.'
      }
      const above = seen.get(parent)
      if (above === undefined) return 'A parent block must precede the blocks nested under it.'
      if (above.section !== item.section_block_id) return "A nested block belongs to its parent's Section."
      depth = above.depth + 1
      if (depth > MAX_NEST_DEPTH) return `Blocks nest ${String(MAX_NEST_DEPTH)} levels deep at most.`
    }
    if (item.kind === 'block') seen.set(item.id, { section: item.section_block_id, depth })
  }
  return null
}

/** When the server reclaimed this media block's file, or null. Only reported while the block still names no file. */
export function fileReclaimedAt(row: Record<string, unknown>): string | null {
  if (row.file_id !== null && row.file_id !== undefined) return null
  if (!isMediaKind(String(row.kind))) return null
  if (row.file_reclaimed_at === null || row.file_reclaimed_at === undefined) return null
  const at = row.file_reclaimed_at
  return at instanceof Date ? at.toISOString() : new Date(String(at)).toISOString()
}
