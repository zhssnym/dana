/*
AC-1008: a Diagram block is stored as its source text and nothing else, reads
back byte-identical, survives a folder duplicate (the canvas's hydrate/dehydrate
half is `src/client/components/page/canvas/CanvasDiagram.test.tsx`), and refuses a file or folder reference.

Data-loss class (issue #222): the diagram's one durable representation is the
source, so a projection that dropped it — or turned it into a paragraph — would
lose the diagram on the next save. Security: the source is stored verbatim and
drawn by React as text (`CanvasDiagram.tsx`), never as markup.

Spec: 4.17, 7.16. Issue #222.
*/
import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast, createFolder, expectStatus } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import { folderToWorkflowFile } from '../../src/shared/workflows.js'
import type { PageView } from '../../src/shared/pages.js'
import { asFile, at, compose, importWorkflowOk, put, readPage } from '../support/workflow-page-harness.js'

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

    // The canvas projection's half is `CanvasDiagram.test.tsx` (client tsconfig).

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

  test('a diagram on the Purpose page survives a workflow export and import', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    // Step 7: Purpose is the project's first Doc tab, before Work.
    const made = await owner.browser.json('/folders', 'POST', { name: 'ac1008 purpose map', kind: null })
    expectStatus(made, 201, 'an unpicked project')
    const folderId = (made.json() as { id: string }).id
    expectStatus(
      await owner.browser.json(`/folders/${folderId}/tabs`, 'POST', { kind: 'usual' }),
      201,
      'the usual project: Purpose, Work, Results and Discussion',
    )
    const purposeOf = async (id: string): Promise<string> => {
      const listed = await owner.browser.json('/folders?tabs=1', 'GET')
      expectStatus(listed, 200, 'the owner lists the folders (7.4)')
      const all = listed.json() as { id: string; project_id: string; kind: string | null; tab_position: string | null }[]
      const root = all.find((f) => f.id === id)
      const tab = all
        .filter((f) => f.project_id === id && f.kind === 'doc' && f.tab_position !== null && f.tab_position < String(root?.tab_position))
        .sort((x, y) => (String(x.tab_position) < String(y.tab_position) ? -1 : 1))[0]
      expect(tab, 'the project has a Purpose tab').toBeDefined()
      return tab!.id
    }
    const readPurpose = async (tabId: string): Promise<PageView> => {
      const read = await owner.browser.json(`/folders/${tabId}/page`, 'GET')
      expectStatus(read, 200, 'the owner reads the Purpose page')
      return read.json() as PageView
    }
    const tabId = await purposeOf(folderId)
    const diagram = randomUUID()
    const base = await readPurpose(tabId)
    const saved = await owner.browser.json(`/folders/${tabId}/page/actions`, 'POST', {
      action: 'document_transaction',
      mutation_id: randomUUID(),
      base_revision: base.revision as string,
      operations: [put(diagram, 'diagram', SOURCE), { op: 'set_outline', items: [at(diagram)] }],
    })
    expectStatus(saved, 200, 'a diagram saves on the Purpose page')
    const purposePage = await readPurpose(tabId)
    const page = await readPage(owner, folderId)
    const exported = folderToWorkflowFile('ac1008 purpose map', [], page.blocks, page, [], {
      display_name: null,
      page: purposePage,
    })
    const blocks = exported.file.folders[0]?.purpose?.blocks ?? []
    expect(blocks, 'the Purpose diagram is carried, not silently skipped').toEqual([
      { kind: 'diagram', text: SOURCE },
    ])
    const importedId = await importWorkflowOk(owner, asFile(exported))
    const imported = await readPurpose(await purposeOf(importedId))
    expect(imported.blocks.map((b) => [b.kind, b.text])).toEqual([['diagram', SOURCE]])
  })
})
