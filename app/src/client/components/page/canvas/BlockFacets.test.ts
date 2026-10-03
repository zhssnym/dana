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
  test('uses the real outer-row id, keeps BlockNote structural children untouched, and collapses extra facets', () => {
    const host = document.createElement('div')
    host.innerHTML = `
      <div class="bn-block-outer" data-id="block-1">
        <div class="bn-block">
          <div class="react-renderer"><div class="bn-block-content">file.pdf</div></div>
        </div>
        <div class="bn-block-group"><div>nested content</div></div>
      </div>
    `

    const outer = host.querySelector<HTMLElement>('.bn-block-outer')!
    const structuralChildren = [...outer.children]
    syncFacetDecorations(host, new Map([['block-1', facets]]))

    const rail = host.querySelector<HTMLElement>('[data-dana-block-facets="block-1"]')!
    const content = host.querySelector<HTMLElement>('.bn-block-content')!
    expect(rail).not.toBeNull()
    expect(content.contains(rail)).toBe(true)
    expect([...outer.children]).toEqual(structuralChildren)
    expect(content.style.position).toBe('relative')
    expect(content.style.paddingBottom).toBe('24px')
    expect(rail.getAttribute('contenteditable')).toBe('false')
    expect([...rail.querySelectorAll('a')].map((chip) => chip.textContent)).toEqual(['Purpose', 'Results'])
    expect(rail.textContent).toContain('+1')
  })

  test('keeps facet chips in the native file row instead of adding detached metadata space', () => {
    const host = document.createElement('div')
    host.innerHTML = `
      <div class="bn-block-outer" data-id="block-1">
        <div class="bn-block">
          <div class="bn-block-content">
            <div class="bn-file-name-with-icon"><span class="bn-file-name">N000604443.pdf</span></div>
          </div>
        </div>
      </div>
    `

    syncFacetDecorations(host, new Map([['block-1', facets.slice(1, 2)]]))

    const content = host.querySelector<HTMLElement>('.bn-block-content')!
    const fileRow = host.querySelector<HTMLElement>('.bn-file-name-with-icon')!
    const rail = host.querySelector<HTMLElement>('[data-dana-block-facets="block-1"]')!
    expect(rail.parentElement).toBe(fileRow)
    expect(rail.textContent).toBe('Results')
    expect(content.style.paddingBottom).toBe('')
    expect(rail.className).toContain('inline-flex')
    expect(rail.className).not.toContain('absolute')
  })

  test('removes the treatment and restores the content box when the relationship is removed', () => {
    const host = document.createElement('div')
    host.innerHTML = '<div class="bn-block-outer" data-id="block-1"><div class="bn-block"><div class="bn-block-content" style="overflow: clip"></div></div></div>'
    const content = host.querySelector<HTMLElement>('.bn-block-content')!
    syncFacetDecorations(host, new Map([['block-1', facets.slice(0, 1)]]))
    expect(host.querySelector('[data-dana-block-facets]')).not.toBeNull()
    expect(content.style.overflow).toBe('visible')

    syncFacetDecorations(host, new Map())
    expect(host.querySelector('[data-dana-block-facets]')).toBeNull()
    expect(content.style.position).toBe('')
    expect(content.style.overflow).toBe('clip')
    expect(content.style.paddingBottom).toBe('')
  })
})
