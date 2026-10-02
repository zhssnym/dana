// @vitest-environment jsdom
import { describe, expect, test } from 'vitest'

import type { BlockFacetRef } from '../../../../shared/block-facets.js'
import { syncFacetDecorations } from './BlockFacets.js'

const facets: readonly BlockFacetRef[] = [
  { id: '00000000-0000-4000-8000-000000000001', name: 'Purpose' },
  { id: '00000000-0000-4000-8000-000000000002', name: 'Results' },
  { id: '00000000-0000-4000-8000-000000000003', name: 'Notes' },
]

describe('block facet metadata rail', () => {
  test('stays outside the measured block content and collapses extra facets', () => {
    const host = document.createElement('div')
    host.innerHTML = `
      <div class="bn-block-outer">
        <div class="bn-block" data-id="block-1">
          <div class="react-renderer"><div class="bn-block-content">file.pdf</div></div>
        </div>
        <div class="bn-block-group"><div>nested content</div></div>
      </div>
    `

    syncFacetDecorations(host, new Map([['block-1', facets]]))

    const block = host.querySelector<HTMLElement>('.bn-block')!
    const rail = host.querySelector<HTMLElement>('[data-dana-block-facets="block-1"]')!
    const content = host.querySelector<HTMLElement>('.bn-block-content')!
    expect(content.contains(rail)).toBe(false)
    expect(block.nextElementSibling).toBe(rail)
    expect(rail.nextElementSibling?.classList.contains('bn-block-group')).toBe(true)
    expect(rail.getAttribute('contenteditable')).toBe('false')
    expect([...rail.querySelectorAll('a')].map((chip) => chip.textContent)).toEqual(['Purpose', 'Results'])
    expect(rail.textContent).toContain('+1')
  })

  test('removes the rail when the block no longer has facet relationships', () => {
    const host = document.createElement('div')
    host.innerHTML = '<div class="bn-block-outer"><div class="bn-block" data-id="block-1"><div class="bn-block-content"></div></div></div>'
    syncFacetDecorations(host, new Map([['block-1', facets.slice(0, 1)]]))
    expect(host.querySelector('[data-dana-block-facets]')).not.toBeNull()

    syncFacetDecorations(host, new Map())
    expect(host.querySelector('[data-dana-block-facets]')).toBeNull()
  })
})
