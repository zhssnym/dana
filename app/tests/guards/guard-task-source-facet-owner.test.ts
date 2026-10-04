import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

const source = readFileSync(
  new URL('../../src/client/components/page/canvas/TaskComposer.tsx', import.meta.url),
  'utf8',
)

describe('Task source facet ownership', () => {
  test('owns facet relations for the whole task session instead of the hover side menu', () => {
    const owner = source.indexOf('const facets = useBlockFacets(')
    const menu = source.indexOf('const menu = useMemo<BlockMenuModel>')
    const afterMenu = source.indexOf('const selectionActions', menu)

    expect(owner).toBeGreaterThan(0)
    expect(menu).toBeGreaterThan(owner)
    expect(source.slice(owner, menu)).toContain("access === 'edit'")
    expect(source.slice(menu, afterMenu)).toContain('facets,')
  })
})
