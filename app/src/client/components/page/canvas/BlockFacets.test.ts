// @vitest-environment jsdom
import { describe, expect, test, vi } from 'vitest'

import type { BlockFacetRef } from '../../../../shared/block-facets.js'
import { installFacetDecorations, syncFacetDecorations } from './BlockFacets.js'

const facets: readonly BlockFacetRef[] = [
  { id: '00000000-0000-4000-8000-000000000001', name: 'Purpose' },
  { id: '00000000-0000-4000-8000-000000000002', name: 'Results' },
  { id: '00000000-0000-4000-8000-000000000003', name: 'Notes' },
]

describe('block facet metadata rail', () => {
  test('uses the real outer-row id, keeps BlockNote structural children untouched, and uses a first-line gutter', () => {
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
    expect(content.style.paddingInlineEnd).toBe('136px')
    expect(content.style.paddingBottom).toBe('')
    expect(rail.getAttribute('contenteditable')).toBe('false')
    expect(rail.className).toContain('absolute')
    expect(rail.className).toContain('top-0')
    expect(rail.className).toContain('right-0')
    expect(rail.style.getPropertyValue('display')).toBe('flex')
    expect(rail.style.getPropertyPriority('display')).toBe('important')
    expect(rail.style.getPropertyValue('visibility')).toBe('visible')
    expect(rail.style.getPropertyPriority('visibility')).toBe('important')
    expect(rail.style.getPropertyValue('opacity')).toBe('1')
    expect(rail.style.getPropertyPriority('opacity')).toBe('important')
    expect([...rail.querySelectorAll('a')].map((chip) => chip.textContent)).toEqual(['Purpose'])
    expect(rail.textContent).toContain('+2')
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
    expect(content.style.paddingInlineEnd).toBe('')
    expect(content.style.paddingBottom).toBe('')
    expect(rail.className).toContain('inline-flex')
    expect(rail.className).not.toContain('absolute')
    expect(rail.style.getPropertyValue('display')).toBe('inline-flex')
    expect(rail.style.getPropertyPriority('display')).toBe('important')
    expect(rail.style.getPropertyValue('visibility')).toBe('visible')
    expect(rail.style.getPropertyPriority('visibility')).toBe('important')
    expect(rail.style.getPropertyValue('opacity')).toBe('1')
    expect(rail.style.getPropertyPriority('opacity')).toBe('important')
  })

  test('reasserts persistent visibility when BlockNote hover styling mutates an existing rail', () => {
    const host = document.createElement('div')
    host.innerHTML = '<div class="bn-block-outer" data-id="block-1"><div class="bn-block"><div class="bn-block-content"></div></div></div>'
    const wanted = new Map([['block-1', facets.slice(0, 1)]])
    syncFacetDecorations(host, wanted)

    const rail = host.querySelector<HTMLElement>('[data-dana-block-facets="block-1"]')!
    rail.style.setProperty('display', 'none', 'important')
    rail.style.setProperty('visibility', 'hidden', 'important')
    rail.style.setProperty('opacity', '0', 'important')

    syncFacetDecorations(host, wanted)

    expect(rail.style.getPropertyValue('display')).toBe('flex')
    expect(rail.style.getPropertyPriority('display')).toBe('important')
    expect(rail.style.getPropertyValue('visibility')).toBe('visible')
    expect(rail.style.getPropertyPriority('visibility')).toBe('important')
    expect(rail.style.getPropertyValue('opacity')).toBe('1')
    expect(rail.style.getPropertyPriority('opacity')).toBe('important')
  })

  test('attaches the permanent pill when the editor DOM becomes ready after the owner mounts', () => {
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.push(callback)
      return frames.length
    })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())

    let host: HTMLElement | undefined
    const editor = {
      get domElement() { return host },
      document: [{ id: 'block-1', children: [] }],
    } as unknown as Parameters<typeof installFacetDecorations>[0]
    const model = {
      options: facets,
      editable: true,
      selected: (blockId: string) => blockId === 'block-1' ? facets.slice(0, 1) : [],
      toggle: () => undefined,
      busy: false,
    } as Parameters<typeof installFacetDecorations>[1]

    const cleanup = installFacetDecorations(editor, model)
    expect(frames).toHaveLength(1)
    host = document.createElement('div')
    host.innerHTML = '<div class="bn-block-outer" data-id="block-1"><div class="bn-block"><div class="bn-block-content"></div></div></div>'
    frames.shift()!(0)

    expect(host.querySelector('[data-dana-block-facets="block-1"]')?.textContent).toBe('Purpose')
    cleanup()
    vi.unstubAllGlobals()
  })

  test('removes the treatment and restores the content box when the relationship is removed', () => {
    const host = document.createElement('div')
    host.innerHTML = '<div class="bn-block-outer" data-id="block-1"><div class="bn-block"><div class="bn-block-content" style="overflow: clip; padding-inline-end: 5px"></div></div></div>'
    const content = host.querySelector<HTMLElement>('.bn-block-content')!
    syncFacetDecorations(host, new Map([['block-1', facets.slice(0, 1)]]))
    expect(host.querySelector('[data-dana-block-facets]')).not.toBeNull()
    expect(content.style.overflow).toBe('visible')
    expect(content.style.paddingInlineEnd).toBe('136px')

    syncFacetDecorations(host, new Map())
    expect(host.querySelector('[data-dana-block-facets]')).toBeNull()
    expect(content.style.position).toBe('')
    expect(content.style.overflow).toBe('clip')
    expect(content.style.paddingInlineEnd).toBe('5px')
  })
})
