// @vitest-environment jsdom
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import type { CanvasApiSpy, CanvasSurfaceSpy } from '../support/folder-canvas-harness.js'
import { applyTransaction, blockOf, canvasIds, editAndSave, mountCanvas, refusalOf, structuredPage } from '../support/folder-canvas-harness.js'
import type { DocumentTransaction } from '../../src/shared/page-document.js'

const surface = vi.hoisted((): CanvasSurfaceSpy => ({ props: null }))
const api = vi.hoisted((): CanvasApiSpy => ({ sent: [], page: { blocks: [], items: [] }, revision: 1 }))

vi.mock('../../src/client/components/page/canvas/CanvasSurface.js', () => ({
  CanvasSurface: (props: NonNullable<CanvasSurfaceSpy['props']>) => { surface.props = props; return null },
}))
vi.mock('../../src/client/api/http.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  mutateApi: async (_schema: unknown, options: { body: DocumentTransaction }) => {
    api.sent.push(options.body)
    api.revision += 1
    api.page = applyTransaction(api.page, options.body, `r${api.revision}`)
    return api.page
  },
}))

afterEach(cleanup)
beforeEach(() => {
  surface.props = null
  api.sent = []
  api.revision = 1
  api.page = structuredPage()
})

/*
AC-464. The page this editor was handed carries a checklist item nested under a
bullet. Nothing the person did touched either of them, and nothing this editor
can do would express the nesting, so the save must carry it anyway — twice,
because the second save is where a baseline that was right only at mount stops
being right.
*/
describe('AC-464 list nesting survives a save of an unrelated edit', () => {
  test('two consecutive saves of another block both carry the list parent', async () => {
    mountCanvas(structuredPage())

    const first = await editAndSave(surface, api, (editor) => { editor.updateBlock(canvasIds.prose, { content: 'Before we leave' }) })
    expect(refusalOf(first)).toEqual([])
    const outline = (body: DocumentTransaction): unknown => body.operations.find((operation) => operation.op === 'set_outline')?.items.find((item) => item.id === canvasIds.tick)
    expect(outline(first)).toEqual({ kind: 'block', id: canvasIds.tick, section_block_id: canvasIds.section, list_parent_block_id: canvasIds.bullet })
    expect(blockOf(api.page, canvasIds.tick).list_parent_block_id).toBe(canvasIds.bullet)

    // The same edit again, on a writer that has now committed once. A baseline
    // re-derived only at mount is a flat one from here on.
    const second = await editAndSave(surface, api, (editor) => { editor.updateBlock(canvasIds.prose, { content: 'Before we leave the house' }) })
    expect(refusalOf(second)).toEqual([])
    expect(outline(second)).toEqual({ kind: 'block', id: canvasIds.tick, section_block_id: canvasIds.section, list_parent_block_id: canvasIds.bullet })
    expect(blockOf(api.page, canvasIds.tick).list_parent_block_id).toBe(canvasIds.bullet)
    expect(blockOf(api.page, canvasIds.tick).kind).toBe('checklist')
    expect(blockOf(api.page, canvasIds.bullet).kind).toBe('bullet')
    // The edit itself still arrived; a save that preserves everything by
    // sending nothing would pass every assertion above.
    expect(blockOf(api.page, canvasIds.prose).text).toBe('Before we leave the house')
  })
})
