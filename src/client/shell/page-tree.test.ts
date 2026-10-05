import { describe, expect, it } from 'vitest'

import type { Folder } from '../../shared/folders.js'
import {
  buildTree,
  compareSiblings,
  isDescendant,
  isNoop,
  placeInOrder,
  resolveDrop,
  visibleRows,
  zoneAt,
} from './page-tree.js'

function page(id: string, parent: string | null = null, position: string | null = null): Folder {
  return {
    id,
    name: id,
    parent_folder_id: parent,
    child_position: position,
  } as unknown as Folder
}

/*
  a
  ├─ b (a0)
  │  └─ d
  └─ c (a1)
  e
  x   (its parent is a page this viewer cannot see)
*/
const pages = [
  page('e'),
  page('c', 'a', 'a1'),
  page('a'),
  page('b', 'a', 'a0'),
  page('d', 'b', 'a0'),
  page('x', 'hidden', 'a0'),
]

describe('page tree', () => {
  const tree = buildTree(pages)

  it('roots are pages with no visible parent, in arrival order', () => {
    expect(tree.roots.map((folder) => folder.id)).toEqual(['e', 'a', 'x'])
    expect(tree.parent.get('x')).toBeNull()
  })

  it('siblings sort by child_position in byte order, then id', () => {
    expect(tree.children.get('a')?.map((folder) => folder.id)).toEqual(['b', 'c'])
    /* 'B' < 'a' in byte order; localeCompare would say otherwise. */
    expect(compareSiblings(page('p', 'r', 'a'), page('q', 'r', 'B'))).toBe(1)
    expect(compareSiblings(page('p', 'r', 'a'), page('q', 'r', 'a'))).toBe(-1)
    expect(compareSiblings(page('p', 'r', null), page('q', 'r', 'z'))).toBe(1)
  })

  it('knows descendants, and a page is not its own descendant', () => {
    expect(isDescendant(tree, 'a', 'd')).toBe(true)
    expect(isDescendant(tree, 'b', 'c')).toBe(false)
    expect(isDescendant(tree, 'a', 'a')).toBe(false)
  })

  it('draws every page of a cycle once, rather than none', () => {
    const cyclic = buildTree([page('p', 'q'), page('q', 'p')])
    const drawn = visibleRows(cyclic, cyclic.roots, new Set()).map((row) => row.folder.id)
    expect(drawn.sort()).toEqual(['p', 'q'])
  })

  it('flattens visible rows depth first and skips folded pages', () => {
    const open = visibleRows(tree, tree.roots, new Set())
    expect(open.map((row) => `${row.folder.id}${String(row.depth)}`)).toEqual([
      'e0',
      'a0',
      'b1',
      'd2',
      'c1',
      'x0',
    ])
    expect(open.find((row) => row.folder.id === 'b')?.hasChildren).toBe(true)
    const folded = visibleRows(tree, tree.roots, new Set(['b']))
    expect(folded.map((row) => row.folder.id)).toEqual(['e', 'a', 'b', 'c', 'x'])
  })

  it('splits a row into quarters', () => {
    expect(zoneAt(0, 40, 5)).toBe('before')
    expect(zoneAt(0, 40, 20)).toBe('inside')
    expect(zoneAt(0, 40, 35)).toBe('after')
  })
})

describe('resolveDrop', () => {
  const tree = buildTree(pages)
  const open = new Set<string>()

  it('refuses a page onto itself or anything under it', () => {
    expect(resolveDrop(tree, open, 'a', 'a', 'inside')).toBeNull()
    expect(resolveDrop(tree, open, 'a', 'd', 'inside')).toBeNull()
    expect(resolveDrop(tree, open, 'a', 'b', 'after')).toBeNull()
  })

  it('the middle of a row nests the page last under it', () => {
    expect(resolveDrop(tree, open, 'e', 'd', 'inside')).toMatchObject({
      parent: 'd',
      mark: { rowId: 'd', kind: 'inside' },
    })
    expect(resolveDrop(tree, open, 'e', 'd', 'inside')?.afterId).toBeUndefined()
  })

  it('above a row lands after its previous sibling, or first', () => {
    expect(resolveDrop(tree, open, 'e', 'c', 'before')).toMatchObject({ parent: 'a', afterId: 'b' })
    expect(resolveDrop(tree, open, 'e', 'b', 'before')).toMatchObject({ parent: 'a', afterId: null })
    /* The carried page is not its own previous sibling. */
    expect(resolveDrop(tree, open, 'b', 'c', 'before')).toMatchObject({ parent: 'a', afterId: null })
  })

  it('below a row lands right after it, or first inside it when it is open', () => {
    expect(resolveDrop(tree, open, 'e', 'c', 'after')).toMatchObject({ parent: 'a', afterId: 'c' })
    expect(resolveDrop(tree, open, 'e', 'b', 'after')).toMatchObject({
      parent: 'b',
      afterId: null,
      mark: { kind: 'first-child' },
    })
    expect(resolveDrop(tree, new Set(['b']), 'e', 'b', 'after')).toMatchObject({
      parent: 'a',
      afterId: 'b',
    })
  })

  it('beside a root is a root, anchored for the Library order', () => {
    expect(resolveDrop(tree, open, 'd', 'e', 'before')).toMatchObject({
      parent: null,
      anchor: { id: 'e', side: 'before' },
    })
  })

  it('refuses a parent the viewer cannot put pages in', () => {
    const mayParent = (id: string): boolean => id !== 'a'
    expect(resolveDrop(tree, open, 'e', 'a', 'inside', mayParent)).toBeNull()
    expect(resolveDrop(tree, open, 'e', 'c', 'after', mayParent)).toBeNull()
    expect(resolveDrop(tree, open, 'e', 'd', 'inside', mayParent)).not.toBeNull()
  })

  it('knows a drop that changes nothing', () => {
    expect(isNoop(tree, 'c', { parent: 'a', afterId: 'b', mark: { rowId: 'b', kind: 'after' } })).toBe(true)
    expect(isNoop(tree, 'c', { parent: 'a', mark: { rowId: 'a', kind: 'inside' } })).toBe(true)
    expect(isNoop(tree, 'b', { parent: 'a', mark: { rowId: 'a', kind: 'inside' } })).toBe(false)
    expect(isNoop(tree, 'b', { parent: 'a', afterId: null, mark: { rowId: 'a', kind: 'first-child' } })).toBe(true)
  })
})

describe('placeInOrder', () => {
  it('moves an id beside its anchor, or last when the anchor is unnamed', () => {
    expect(placeInOrder(['a', 'b', 'c'], 'x', 'b', 'before')).toEqual(['a', 'x', 'b', 'c'])
    expect(placeInOrder(['a', 'b', 'c'], 'x', 'b', 'after')).toEqual(['a', 'b', 'x', 'c'])
    expect(placeInOrder(['x', 'a', 'b'], 'x', 'b', 'after')).toEqual(['a', 'b', 'x'])
    expect(placeInOrder(['a'], 'x', 'zz', 'after')).toEqual(['a', 'x'])
  })
})
