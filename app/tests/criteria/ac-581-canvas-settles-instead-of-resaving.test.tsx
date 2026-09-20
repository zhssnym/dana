// @vitest-environment jsdom
/*
AC-581: given a folder page open in the canvas, when nothing has been written,
then nothing is sent and the status region reads Saved; and when one edit is
made, then exactly one transaction is sent and the page goes quiet again.

**This is the criterion that watches the two corrections issue #250 made, and it
exists because a mutation test found nothing else watching them.** Reverting
either of these left AC-464, AC-465 and AC-466 green:

- `baselineOf` reduced to `documentOf(page)` alone, which was the first shape
  the issue proposed. The stored page and what this editor can draw of it are
  not the same document — `dehydrateCanvas` puts a run projection on every
  non-image block, and a block stored with `text` and no `rich_content` is
  ordinary, being what `insert_block` writes — so a baseline taken from the
  server's page alone reads "changed" the moment the editor is touched, and
  **a page nobody edited is written back**. That is the first case.
- `settled()` returned to byte equality. The baseline carries the kinds, ticks
  and list parents this editor cannot draw, so the projection never equals it,
  `settled` is false forever, and the 450 ms autosave sends one no-op
  transaction after another for as long as the tab is open. Each one is a write
  the page did not need: `applyDocument` records an event and inserts a
  `page_document_receipts` row before `structureChanged` is consulted, so an
  idle tab writes two rows every 450 ms against the single production instance.
  That is the second case.

Both are measured the same way and the measurement is deliberately narrow: the
number of transactions sent, and what the save status region says. Nothing here
asserts what is *in* a transaction — AC-464 to AC-466 do that, and AC-580 asks
whether the server takes it. What this one asks is how many there are.

Spec 4.17, 7.16, 11.11, 12.9. Issue #250.
*/
import { act, cleanup, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import type { CanvasApiSpy, CanvasSurfaceSpy } from '../support/folder-canvas-harness.js'
import { applyTransaction, canvasIds, legacyPage, mountCanvas, structuredPage } from '../support/folder-canvas-harness.js'
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
  sessionStorage.clear()
})

/** Longer than the component's own 450 ms debounce, so a save it decided to
 * make has been made by the time anything is counted. */
async function quiet(ms = 1400): Promise<void> {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)) })
}

/**
 * The editor announcing itself with nothing changed, which is what
 * `CanvasSurface` does on a change BlockNote considers one and the projection
 * does not. Repeated, because one of the two reversions loops rather than
 * firing once, and a single nudge cannot tell those apart.
 */
async function nudge(times = 4): Promise<void> {
  for (let index = 0; index < times; index += 1) {
    const captured = surface.props
    if (captured === null) throw new Error('CanvasSurface was never rendered; the canvas did not mount.')
    await act(async () => { captured.onChange(captured.editor) })
    await quiet(600)
  }
}

const status = (container: HTMLElement): string | null => within(container).getByRole('status').textContent

describe('AC-581 an open canvas settles, and one edit is one save', () => {
  test('a page whose blocks carry no rich content is not written back by opening it', async () => {
    api.page = legacyPage()
    const container = mountCanvas(legacyPage())
    await waitFor(() => { expect(surface.props).not.toBeNull() })

    await nudge()
    expect(api.sent).toHaveLength(0)
    expect(status(container)).toBe('Saved')

    const captured = surface.props!
    await act(async () => { captured.editor.updateBlock(canvasIds.prose, { content: 'Before we leave' }); captured.onChange(captured.editor) })
    await waitFor(() => { expect(api.sent).toHaveLength(1) }, { timeout: 10_000 })

    await nudge()
    expect(api.sent).toHaveLength(1)
    expect(status(container)).toBe('Saved')
  })

  test('a page holding kinds this editor cannot draw settles, rather than saving every 450 ms', async () => {
    api.page = structuredPage()
    const container = mountCanvas(structuredPage())
    await waitFor(() => { expect(surface.props).not.toBeNull() })

    await nudge()
    expect(api.sent).toHaveLength(0)
    expect(status(container)).toBe('Saved')

    const captured = surface.props!
    await act(async () => { captured.editor.updateBlock(canvasIds.prose, { content: 'Before we leave' }); captured.onChange(captured.editor) })
    await waitFor(() => { expect(api.sent).toHaveLength(1) }, { timeout: 10_000 })

    // The loop this case is about needs no further input: after a commit the
    // writer's own state change re-arms the debounce, so an idle tab is enough.
    await quiet()
    await nudge()
    expect(api.sent).toHaveLength(1)
    expect(status(container)).toBe('Saved')
  })
})
