/*
AC-1008: a Diagram block is stored as its source text and nothing else, reads
back byte-identical, survives the canvas's hydrate/dehydrate projection and a
folder duplicate, and refuses a file or folder reference.

Data-loss class (issue #222): the diagram's one durable representation is the
source, so a projection that dropped it — or turned it into a paragraph — would
lose the diagram on the next save. Security: the source is stored verbatim and
drawn by React as text (`CanvasDiagram.tsx`), never as markup.

Spec: 4.17, 7.16. Issue #222.
*/
import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { dehydrateCanvas, hydrateCanvas } from '../../src/client/components/page/canvas/adapters.js'
import type { CanvasBlock } from '../../src/client/components/page/canvas/schema.js'
import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast, createFolder, expectStatus } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import { at, compose, put, readPage } from '../support/workflow-page-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner'], 'ac1008')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

const SOURCE = 'flowchart LR\nIdea -> Draft: send\n<img src=x onerror=alert(1)> -> Draft'

describe('AC-1008 a diagram round-trips as its source', () => {
  test('store, read, project, duplicate, refuse a file', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const folderId = await createFolder(owner, 'ac1008 the map')
    const diagram = randomUUID()
    const page = await compose(
      owner,
      folderId,
      [put(diagram, 'diagram', SOURCE), { op: 'set_outline', items: [at(diagram)] }],
      'a diagram block must save through the document transaction (7.16)',
    )
    const read = page.blocks.find((b) => b.id === diagram)
    expect(read?.kind).toBe('diagram')
    expect(read?.text).toBe(SOURCE)
    expect(read?.rich_content ?? null).toBeNull()

    // The canvas projection keeps the kind and the source both ways.
    const hydrated = hydrateCanvas(page, 600)
    expect(hydrated).toEqual([{ id: diagram, type: 'diagram', props: { source: SOURCE }, children: [] }])
    const projected = dehydrateCanvas(hydrated as unknown as CanvasBlock[], 600, new Map())
    expect(projected.blocks).toEqual([{ id: diagram, block_kind: 'diagram', text: SOURCE, rich_content: null, file_id: null, ref_folder_id: null, width_pct: null, checked: null }])

    // A diagram names no file and no folder.
    const refused = await owner.browser.json(`/folders/${folderId}/page/actions`, 'POST', {
      action: 'document_transaction',
      mutation_id: randomUUID(),
      base_revision: page.revision as string,
      operations: [put(diagram, 'diagram', SOURCE, { ref_folder_id: folderId }), { op: 'set_outline', items: [at(diagram)] }],
    })
    expect(refused.status).toBeGreaterThanOrEqual(400)
    expect((await readPage(owner, folderId)).blocks.find((b) => b.id === diagram)?.text).toBe(SOURCE)

    // Duplicating the folder copies the source.
    const copy = await owner.browser.json(`/folders/${folderId}/duplicate`, 'POST', {})
    expectStatus(copy, 201, 'the owner duplicates the folder')
    const copyId = ((await copy.json()) as { id: string }).id
    const copied = (await readPage(owner, copyId)).blocks.filter((b) => b.kind === 'diagram')
    expect(copied.map((b) => b.text)).toEqual([SOURCE])
  })
})
