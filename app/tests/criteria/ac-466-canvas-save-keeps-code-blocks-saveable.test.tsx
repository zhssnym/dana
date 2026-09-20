// @vitest-environment jsdom
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import type { CanvasApiSpy, CanvasSurfaceSpy } from '../support/folder-canvas-harness.js'
import { applyTransaction, blockOf, canvasIds, editAndSave, mountCanvas, refusalOf, structuredPage } from '../support/folder-canvas-harness.js'
import { RICH_TEXT_BLOCK_KINDS, STRUCTURED_BLOCK_KINDS } from '../../src/shared/page-document.js'
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
AC-466. Preserving a kind means preserving the rules the kind carries, and the
one that bites is rich content: `dehydrateCanvas` projects runs onto every
non-image block, `code` is outside `RICH_TEXT_BLOCK_KINDS`, and a `put_block`
restoring the kind while keeping the runs is refused. A refusal here is worse
than the loss it replaces — the writer latches `failed`, so a page holding a
code block would never save again, with no way forward from the screen.

The refusal is checked against `documentTransaction` itself rather than against
a copy of its rule, so this criterion is asserting the same code that answers
422 in production.
*/
describe('AC-466 a page holding a code block stays saveable', () => {
  test('an edit elsewhere leaves the code block alone and the transaction is accepted', async () => {
    mountCanvas(structuredPage())

    const first = await editAndSave(surface, api, (editor) => { editor.updateBlock(canvasIds.prose, { content: 'Run the gate' }) })
    expect(refusalOf(first)).toEqual([])
    // Untouched means untouched: nothing was written for it at all.
    expect(first.operations.filter((operation) => operation.op === 'put_block' && operation.id === canvasIds.code)).toEqual([])
    expect(blockOf(api.page, canvasIds.code)).toMatchObject({ kind: 'code', text: 'npm run gate', rich_content: null })

    const second = await editAndSave(surface, api, (editor) => { editor.updateBlock(canvasIds.prose, { content: 'Run the gate twice' }) })
    expect(refusalOf(second)).toEqual([])
    expect(second.operations.filter((operation) => operation.op === 'put_block' && operation.id === canvasIds.code)).toEqual([])
    expect(blockOf(api.page, canvasIds.code)).toMatchObject({ kind: 'code', text: 'npm run gate', rich_content: null })
  })

  test('editing the code block writes it back as code with no rich content, and is accepted', async () => {
    mountCanvas(structuredPage())

    const sent = await editAndSave(surface, api, (editor) => { editor.updateBlock(canvasIds.code, { content: 'npm run gate -- --quick' }) })
    expect(refusalOf(sent)).toEqual([])
    expect(sent.operations.find((operation) => operation.op === 'put_block' && operation.id === canvasIds.code))
      .toMatchObject({ block_kind: 'code', text: 'npm run gate -- --quick', rich_content: null, checked: null })
    expect(blockOf(api.page, canvasIds.code)).toMatchObject({ kind: 'code', text: 'npm run gate -- --quick', rich_content: null })
  })

  /*
  The rule is read off the constant, so a seventh kind cannot reintroduce this
  by being added to 4.17 and forgotten here. This case fails the day
  `STRUCTURED_BLOCK_KINDS` grows a kind outside `RICH_TEXT_BLOCK_KINDS` that
  the two cases above do not cover, which is the point of writing it down.
  */
  test('code is the only structured kind refusing rich content, and the save path derives that', () => {
    const rich = new Set<string>(RICH_TEXT_BLOCK_KINDS)
    expect(STRUCTURED_BLOCK_KINDS.filter((kind) => !rich.has(kind))).toEqual(['code'])
  })
})
