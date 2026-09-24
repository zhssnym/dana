/*
The sidebar's page tree, built on the client from the flat `GET /folders` list.

The server answers every page the viewer is a member of, each carrying the
parent *as this viewer may see it*: `parent_folder_id` is null for a root and
also for a page whose parent the viewer cannot see. So a page is a root here
when its parent is null **or absent from the list**, and nothing about a
hidden parent reaches the drawing.

Siblings sort by `child_position`, then `id`, in byte order (the column is
`COLLATE "C"`), so the comparison is `<` on strings and never `localeCompare`,
which would disagree with the server about where an uppercase key goes. Roots
are not ordered here: their order is the viewer's own Library order
(`library-order.ts`), and this file hands them back in the order they arrived.

Everything here is pure, so the arithmetic a drop depends on is measured by
`page-tree.test.ts` rather than by nobody.
*/
import type { Folder } from '../../shared/folders.js'

export interface PageTree {
  /** Pages with no parent this viewer can see, in the order they arrived. */
  readonly roots: readonly Folder[]
  /** Each page's children, sibling-sorted. A page with none is absent. */
  readonly children: ReadonlyMap<string, readonly Folder[]>
  /** Each page's parent as drawn: null for a root. */
  readonly parent: ReadonlyMap<string, string | null>
  readonly byId: ReadonlyMap<string, Folder>
}

const NONE: readonly Folder[] = []

/** Byte order on `child_position` (null last), then on id. */
export function compareSiblings(a: Folder, b: Folder): number {
  const pa = a.child_position ?? null
  const pb = b.child_position ?? null
  if (pa !== pb) {
    if (pa === null) return 1
    if (pb === null) return -1
    return pa < pb ? -1 : 1
  }
  if (a.id === b.id) return 0
  return a.id < b.id ? -1 : 1
}

export function buildTree(folders: readonly Folder[]): PageTree {
  const byId = new Map<string, Folder>()
  for (const folder of folders) byId.set(folder.id, folder)

  const roots: Folder[] = []
  const children = new Map<string, Folder[]>()
  const parent = new Map<string, string | null>()
  for (const folder of folders) {
    const up = folder.parent_folder_id ?? null
    if (up === null || up === folder.id || !byId.has(up)) {
      roots.push(folder)
      parent.set(folder.id, null)
      continue
    }
    parent.set(folder.id, up)
    const bucket = children.get(up)
    if (bucket === undefined) children.set(up, [folder])
    else bucket.push(folder)
  }
  for (const bucket of children.values()) bucket.sort(compareSiblings)

  /* A cycle the server should never produce (it refuses them with 422) would
     leave its members reachable from no root and so drawn nowhere. Break it by
     making the first member met a root, so every page is always drawn once. */
  const reached = new Set<string>()
  const walk = (id: string): void => {
    if (reached.has(id)) return
    reached.add(id)
    for (const child of children.get(id) ?? NONE) walk(child.id)
  }
  for (const root of roots) walk(root.id)
  for (const folder of folders) {
    if (reached.has(folder.id)) continue
    const up = parent.get(folder.id) ?? null
    if (up !== null) {
      const siblings = children.get(up)
      if (siblings !== undefined) {
        children.set(
          up,
          siblings.filter((sibling) => sibling.id !== folder.id),
        )
      }
    }
    parent.set(folder.id, null)
    roots.push(folder)
    walk(folder.id)
  }

  return { roots, children, parent, byId }
}

export function childrenOf(tree: PageTree, id: string): readonly Folder[] {
  return tree.children.get(id) ?? NONE
}

/** Whether `id` sits anywhere under `ancestorId` (strictly: not itself). */
export function isDescendant(tree: PageTree, ancestorId: string, id: string): boolean {
  const seen = new Set<string>()
  let at = tree.parent.get(id) ?? null
  while (at !== null && !seen.has(at)) {
    if (at === ancestorId) return true
    seen.add(at)
    at = tree.parent.get(at) ?? null
  }
  return false
}

export interface TreeRow {
  readonly folder: Folder
  readonly depth: number
  readonly hasChildren: boolean
}

/**
 * The rows a set of pages draws, depth first, skipping everything under a
 * folded page. `depth` starts at `startDepth` for the pages given.
 */
export function visibleRows(
  tree: PageTree,
  pages: readonly Folder[],
  folded: ReadonlySet<string>,
  startDepth = 0,
): TreeRow[] {
  const rows: TreeRow[] = []
  const seen = new Set<string>()
  const visit = (folder: Folder, depth: number): void => {
    if (seen.has(folder.id)) return
    seen.add(folder.id)
    const kids = childrenOf(tree, folder.id)
    rows.push({ folder, depth, hasChildren: kids.length > 0 })
    if (folded.has(folder.id)) return
    for (const child of kids) visit(child, depth + 1)
  }
  for (const page of pages) visit(page, startDepth)
  return rows
}

/** Where on a row the pointer is: its top quarter, middle half, or bottom quarter. */
export type DropZone = 'before' | 'inside' | 'after'

export function zoneAt(top: number, bottom: number, y: number): DropZone {
  const quarter = (bottom - top) / 4
  if (y < top + quarter) return 'before'
  if (y > bottom - quarter) return 'after'
  return 'inside'
}

/**
 * What a drop would do, in the terms of PATCH /folders/:id/location.
 *
 * `afterId` undefined means "last under that parent", null means "first".
 * A drop at the root level (`parent` null) is placed in the viewer's own
 * Library order instead, so it carries the root it lands beside as `anchor`.
 * `mark` is what the sidebar draws: the row to highlight or draw a line on.
 */
export interface TreeDrop {
  readonly parent: string | null
  readonly afterId?: string | null
  readonly anchor?: { readonly id: string; readonly side: 'before' | 'after' }
  readonly mark: {
    readonly rowId: string
    readonly kind: 'inside' | 'before' | 'after' | 'first-child'
  }
}

/**
 * The drop a pointer over `rowId`'s `zone` proposes for `carriedId`, or null
 * when there is none: onto itself or anything under it (a cycle), or onto a
 * page `mayParent` says the viewer cannot put pages in.
 */
export function resolveDrop(
  tree: PageTree,
  folded: ReadonlySet<string>,
  carriedId: string,
  rowId: string,
  zone: DropZone,
  mayParent: (id: string) => boolean = () => true,
): TreeDrop | null {
  if (rowId === carriedId || isDescendant(tree, carriedId, rowId)) return null
  if (!tree.byId.has(rowId)) return null

  if (zone === 'inside') {
    if (!mayParent(rowId)) return null
    return { parent: rowId, mark: { rowId, kind: 'inside' } }
  }

  const kids = childrenOf(tree, rowId).filter((kid) => kid.id !== carriedId)
  if (zone === 'after' && kids.length > 0 && !folded.has(rowId)) {
    /* Below an open page with children, the line sits above its first child,
       so that is where the page lands. */
    if (!mayParent(rowId)) return null
    return { parent: rowId, afterId: null, mark: { rowId, kind: 'first-child' } }
  }

  const parent = tree.parent.get(rowId) ?? null
  if (parent !== null && !mayParent(parent)) return null
  if (parent === null) {
    return {
      parent: null,
      anchor: { id: rowId, side: zone },
      mark: { rowId, kind: zone },
    }
  }
  if (zone === 'after') return { parent, afterId: rowId, mark: { rowId, kind: 'after' } }
  const siblings = childrenOf(tree, parent).filter((sibling) => sibling.id !== carriedId)
  const at = siblings.findIndex((sibling) => sibling.id === rowId)
  const previous = at > 0 ? siblings[at - 1] : undefined
  return { parent, afterId: previous?.id ?? null, mark: { rowId, kind: 'before' } }
}

/** Whether a drop would leave the page exactly where it already is. */
export function isNoop(tree: PageTree, carriedId: string, drop: TreeDrop): boolean {
  const current = tree.parent.get(carriedId) ?? null
  if (drop.parent === null || current !== drop.parent) return false
  const siblings = childrenOf(tree, drop.parent)
  const at = siblings.findIndex((sibling) => sibling.id === carriedId)
  if (at < 0) return false
  if (drop.afterId === undefined) return at === siblings.length - 1
  if (drop.afterId === null) return at === 0
  return siblings[at - 1]?.id === drop.afterId
}

/**
 * The Library order with `id` moved beside `anchorId`, for a page that becomes
 * a root. An anchor the order does not name puts it last.
 */
export function placeInOrder(
  order: readonly string[],
  id: string,
  anchorId: string,
  side: 'before' | 'after',
): string[] {
  const rest = order.filter((entry) => entry !== id)
  const at = rest.indexOf(anchorId)
  if (at < 0) return [...rest, id]
  rest.splice(side === 'before' ? at : at + 1, 0, id)
  return rest
}
