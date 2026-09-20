// @vitest-environment jsdom
/*
AC-661: given a folder page carrying a `folder_ref` block, when the person
edits a different block, then the transaction carries no `put_block` for the
reference at all and its outline still names it.

This is the half of issue #255 that was already right, pinned so that the fix
for the other half cannot take it away. The measurement in that issue is two
directions of one gesture: an unrelated edit was safe and a keystroke inside
the block destroyed the relation. A carry that restored the kind by rewriting
every save would answer the second at the cost of the first — a `put_block` on
a block nobody touched, on every save, for the life of the page — and the
suite would read green because AC-660 only asks that the relation survive.

**What makes it pass is that the baseline and the save are the same
projection.** `folderRefsOf` is read once from the page the editor was
hydrated from and handed to `dehydrateCanvas` at every call site, so the
writer's baseline holds the reference exactly as the next projection will, and
`canvasOperations` emits a record only for a block whose projection moved.
Restoring the kind later, out of a baseline that had already lost it, is the
shape that cannot do this: `backend/250-canvas-save-path` is the branch that
found that a baseline built from the editor's own rendering has nothing to
restore from.

Spec 4.17, 7.16, 12.9. Issue #255.
*/
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { documentTransaction } from '../../src/shared/page-document.js'
import type { DocumentTransaction } from '../../src/shared/page-document.js'
import type { PageView } from '../../src/shared/pages.js'
import type { CanvasApiSpy, CanvasSurfaceSpy } from '../support/folder-ref-canvas-harness.js'
import { editAndSave, mountCanvas, pageBlock, typeInto } from '../support/folder-ref-canvas-harness.js'

const surface = vi.hoisted((): CanvasSurfaceSpy => ({ props: null }))
const api = vi.hoisted((): CanvasApiSpy => ({ sent: [], page: { blocks: [], items: [] } }))

vi.mock('../../src/client/components/page/canvas/CanvasSurface.js', () => ({
  CanvasSurface: (props: NonNullable<CanvasSurfaceSpy['props']>) => { surface.props = props; return null },
}))
vi.mock('../../src/client/api/http.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  mutateApi: async (_schema: unknown, options: { body: DocumentTransaction }) => {
    api.sent.push(options.body)
    // Deliberately literal and deliberately not a server: this criterion asks
    // what the canvas sends, and AC-660 asks what a server does with it.
    api.page = { ...api.page, revision: `r${String(api.sent.length + 1)}` }
    return api.page
  },
}))

const FOLDER = '00000000-0000-4000-8000-00000000f01d'
const REFERENCED = '00000000-0000-4000-8000-00000000f02d'
const PROSE = '00000000-0000-4000-8000-0000000000a1'
const REFERENCE = '00000000-0000-4000-8000-0000000000a2'

/** A folder page as the seed writes one: prose, then a reference to a folder. */
function referencePage(): PageView {
  return {
    revision: 'r1',
    blocks: [
      pageBlock(PROSE, 'paragraph', 'What the studio is for, in one line.', { rich_content: { version: 1, runs: [{ text: 'What the studio is for, in one line.' }] } }),
      /* `text` null is the shape `app/db/seed.ts` writes and the shape
         `shelfWritesOf` sends: a folder reference names a folder and carries
         no words of its own, and `hydrateCanvas` draws "Open folder" for it. */
      pageBlock(REFERENCE, 'folder_ref', null, { ref_folder_id: REFERENCED }),
    ],
    items: [PROSE, REFERENCE].map((id) => ({ kind: 'block' as const, id })),
    task_placements: [],
  }
}

beforeEach(() => { surface.props = null; api.sent = []; api.page = referencePage() })
afterEach(cleanup)

describe('AC-661 an unrelated edit writes nothing to a folder reference', () => {
  test('editing the prose sends one put_block for the prose and none for the reference', async () => {
    mountCanvas(referencePage(), FOLDER)
    const sent = await editAndSave(surface, api, typeInto(PROSE, 'What the studio is for, in two lines.'))

    const written = sent.operations.flatMap((operation) => operation.op === 'put_block' ? [operation] : [])
    expect(written.map((operation) => operation.id)).toEqual([PROSE])
    expect(written.map((operation) => operation.text)).toEqual(['What the studio is for, in two lines.'])

    // The outline is always complete — `applyDocument` refuses one that is not
    // — so "no put_block" is the whole of what "untouched" can mean here.
    const outline = sent.operations.find((operation) => operation.op === 'set_outline')
    expect(outline?.op === 'set_outline' ? outline.items.map((item) => item.id) : []).toEqual([PROSE, REFERENCE])
    expect(documentTransaction.safeParse(sent).success).toBe(true)
  })

  test('a second unrelated edit still writes nothing to it, so the baseline did not drift', async () => {
    mountCanvas(referencePage(), FOLDER)
    await editAndSave(surface, api, typeInto(PROSE, 'One'))
    const second = await editAndSave(surface, api, typeInto(PROSE, 'Two'))

    expect(second.operations.flatMap((operation) => operation.op === 'put_block' ? [operation.id] : [])).toEqual([PROSE])
  })
})
