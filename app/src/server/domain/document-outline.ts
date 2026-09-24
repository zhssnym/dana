/*
The one nesting validator for every document home (wave 2, migration 0038).

`list_parent_block_id` is the general block parent: any block but a Section may
sit under a writing block of the same document. Four appliers write it -- a
Folder's Main page (`page-document.ts`), a facet (`facets.ts`), a Task
document (`task-document.ts`) and a Shelf (`shelf-document.ts`) -- and each
asks this function, ahead of its first write, over the final ordered outline.
Each maps the answer to its own refusal; none restates a rule.

What it refuses:

- a Task named as a child or a parent (a Task is never a nested block);
- a child whose kind may not nest, or a parent whose kind holds nothing
  (`mayNestUnder`);
- a parent that is not a block of this same document (`kindOf` answers only
  for this document's blocks, so another document's id reads as unknown);
- a parent that does not precede its child, which is also the whole cycle
  rule: a relation in which every parent appears earlier in one finite order
  cannot close a loop;
- a child whose Section differs from its parent's (the one Section rule): a
  block cannot be inside two Sections at once;
- nesting deeper than `MAX_NEST_DEPTH`.

What it does not judge: unknown or repeated identities and retention, which
each applier already checks against its own sets before calling this.
*/
import { MAX_NEST_DEPTH, mayNest, mayNestUnder } from '../../shared/page-document.js'

export interface NestingItem {
  readonly kind: 'block' | 'task'
  readonly id: string
  /** Work grouping; null on every home but a Folder's Main page. */
  readonly section_block_id: string | null
  readonly list_parent_block_id: string | null
}

/**
 * Null when the outline's nesting is valid, otherwise the sentence to refuse
 * with. `kindOf` answers the final kind of a block of this document (after
 * this transaction's `put_block`s) and undefined for anything else.
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
