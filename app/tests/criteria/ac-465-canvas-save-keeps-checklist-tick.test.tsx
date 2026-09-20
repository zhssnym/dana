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
AC-465. The block the person edits is the hard case, because it is the one the
save has to write. This editor draws a ticked checklist item as a paragraph, so
the record it hands back says `paragraph` and `checked: null`; writing that is
a conversion nobody asked for and a tick nobody can get back.

The second save matters here for the same reason it does in AC-464, and more:
the first save is the one that writes the block, so a baseline re-derived from
what was sent rather than from what the server holds is wrong about this block
in particular.
*/
describe('AC-465 a checklist tick survives a text edit on the item itself', () => {
  test('editing the item writes it back as a ticked checklist item, twice', async () => {
    mountCanvas(structuredPage())

    const first = await editAndSave(surface, api, (editor) => { editor.updateBlock(canvasIds.tick, { content: 'Milk and bread' }) })
    expect(refusalOf(first)).toEqual([])
    const put = (body: DocumentTransaction): unknown => body.operations.find((operation) => operation.op === 'put_block' && operation.id === canvasIds.tick)
    expect(put(first)).toMatchObject({ op: 'put_block', block_kind: 'checklist', checked: true, text: 'Milk and bread' })
    expect(blockOf(api.page, canvasIds.tick)).toMatchObject({ kind: 'checklist', checked: true, text: 'Milk and bread' })
    // The kind decides the relation as well as the tick: a checklist item is
    // still nested under its bullet after being rewritten.
    expect(blockOf(api.page, canvasIds.tick).list_parent_block_id).toBe(canvasIds.bullet)

    const second = await editAndSave(surface, api, (editor) => { editor.updateBlock(canvasIds.tick, { content: 'Milk, bread and eggs' }) })
    expect(refusalOf(second)).toEqual([])
    expect(put(second)).toMatchObject({ op: 'put_block', block_kind: 'checklist', checked: true, text: 'Milk, bread and eggs' })
    expect(blockOf(api.page, canvasIds.tick)).toMatchObject({ kind: 'checklist', checked: true, text: 'Milk, bread and eggs' })
    expect(blockOf(api.page, canvasIds.tick).list_parent_block_id).toBe(canvasIds.bullet)
  })
})
