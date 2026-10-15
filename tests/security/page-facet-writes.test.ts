import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { addMemberOk, Cast, connect, expectStatus } from '../support/folders-harness.js'
import { inTransaction } from '../../src/server/database.js'
import { rows } from '../support/helpers.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'viewer', 'stranger'], 'pf671')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

interface Facet {
  id: string
  name: string
  position: string
  content_page_id: string | null
}
interface FacetResponse {
  page_id: string
  containing_facet_id: string | null
  facets: Facet[]
}

describe('Page Facet writes', () => {
  test('create, rename and reorder on nested Pages without moving Page content', async () => {
    const [owner, viewer, stranger] = await cast.of(app)
    if (!owner || !viewer || !stranger) throw new Error('Missing test actors')
    const made = await owner.browser.json('/folders', 'POST', { name: 'pf671 root', kind: 'work' })
    expectStatus(made, 201, 'root Page')
    const rootId = (made.json() as { id: string }).id
    const nested = await owner.browser.json('/folders', 'POST', {
      name: 'pf671 child', parent_folder_id: rootId,
    })
    expectStatus(nested, 201, 'nested Page')
    const nestedRecord = nested.json() as { id: string; parent_folder_id: string | null }
    const nestedId = nestedRecord.id
    const originalParentId = nestedRecord.parent_folder_id

    const rootBefore = await owner.browser.json(`/pages/${rootId}/facets`, 'GET')
    expectStatus(rootBefore, 200, 'root Facets')
    const rootMain = (rootBefore.json() as FacetResponse).facets[0]
    if (!rootMain) throw new Error('Root must have Main')
    expect(rootMain.name).toBe('Main')

    const renamed = await owner.browser.json(`/pages/${rootId}/facets/${rootMain.id}`, 'PATCH', {
      name: 'Overview',
    })
    expectStatus(renamed, 200, 'rename Main')
    expect((renamed.json() as FacetResponse).facets[0]?.name).toBe('Overview')
    const stillRoot = await owner.browser.json(`/folders/${rootId}`, 'GET')
    expectStatus(stillRoot, 200, 'same root Page')
    expect((stillRoot.json() as { name: string }).name).toBe('pf671 root')

    const first = await owner.browser.json(`/pages/${nestedId}/facets`, 'POST', {
      name: 'Notes',
    })
    expectStatus(first, 201, 'new nested Facet')
    const newFacets = (first.json() as FacetResponse).facets
    expect(newFacets.map((facet) => facet.name)).toEqual(['Main', 'Notes'])
    const notes = newFacets[1]
    if (!notes) throw new Error('Notes missing')
    expect(notes.content_page_id).toBeNull()

    const second = await owner.browser.json(`/pages/${nestedId}/facets`, 'POST', {
      name: 'Plan',
      after_facet_id: null,
    })
    expectStatus(second, 201, 'insert at start')
    expect((second.json() as FacetResponse).facets.map((facet) => facet.name)).toEqual([
      'Plan', 'Main', 'Notes',
    ])
    const beforeOrder = (second.json() as FacetResponse).facets
    const reversed = [...beforeOrder].reverse().map((facet) => facet.id)
    const ordered = await owner.browser.json(`/pages/${nestedId}/facets/order`, 'PUT', {
      order: reversed,
    })
    expectStatus(ordered, 200, 'reorder')
    expect((ordered.json() as FacetResponse).facets.map((facet) => facet.id)).toEqual(reversed)

    expectStatus(await owner.browser.json(`/pages/${nestedId}/facets/order`, 'PUT', {
      order: reversed.slice(0, 2),
    }), 409, 'reject incomplete ordering')
    expectStatus(await owner.browser.json(`/pages/${nestedId}/facets`, 'POST', {
      name: 'No',
      after_facet_id: rootMain.id,
    }), 422, 'refuse Facet from another Page')
    expectStatus(await owner.browser.json(`/pages/${nestedId}/facets/${rootMain.id}`, 'PATCH', {
      name: 'Moved',
    }), 404, 'cannot rename Facet from another Page')

    const nestedFolder = await owner.browser.json(`/folders/${nestedId}`, 'GET')
    expectStatus(nestedFolder, 200, 'nested Page remains')
    expect((nestedFolder.json() as { parent_folder_id: string | null }).parent_folder_id).toBe(originalParentId)
    expectStatus(await owner.browser.json(`/folders/${nestedId}/page`, 'GET'), 200, 'nested document remains')

    await connect(app.db, owner.id, viewer.id)
    await connect(app.db, owner.id, stranger.id)
    await addMemberOk(owner, rootId, viewer.id, 'can_view')
    expectStatus(await viewer.browser.json(`/pages/${nestedId}/facets`, 'GET'), 200, 'member may read')
    expectStatus(await viewer.browser.json(`/pages/${nestedId}/facets`, 'POST', {
      name: 'Not allowed',
    }), 403, 'viewer cannot create')
    expectStatus(await viewer.browser.json(`/pages/${nestedId}/facets/${notes.id}`, 'PATCH', {
      name: 'Not allowed',
    }), 403, 'viewer cannot rename')
    expectStatus(await viewer.browser.json(`/pages/${nestedId}/facets/order`, 'PUT', {
      order: reversed,
    }), 403, 'viewer cannot reorder')
    expectStatus(await stranger.browser.json(`/pages/${nestedId}/facets`, 'POST', {
      name: 'Not allowed',
    }), 404, 'stranger cannot discover Page')
  }, 60_000)

  test('legacy Page content tracks its Facet and a new Facet can own blocks without a new Page', async () => {
    const [owner] = await cast.of(app)
    if (!owner) throw new Error('Missing owner')
    const made = await owner.browser.json('/folders', 'POST', {
      name: 'pf671 content home', kind: 'work',
    })
    expectStatus(made, 201, 'created Page')
    const rootId = (made.json() as { id: string }).id
    const child = await owner.browser.json('/folders', 'POST', {
      name: 'pf671 child home', parent_folder_id: rootId,
    })
    expectStatus(child, 201, 'created nested Page')
    const childId = (child.json() as { id: string }).id

    const rootFacet = (await rows(app.db, sql`
      SELECT id FROM page_facets WHERE content_folder_id = ${rootId}::uuid
    `))[0]?.id
    const childFacet = (await rows(app.db, sql`
      SELECT id FROM page_facets WHERE content_folder_id = ${childId}::uuid
    `))[0]?.id
    expect(rootFacet).toBeDefined()
    expect(childFacet).toBeDefined()

    const task = await owner.browser.json('/tasks', 'POST', {
      folder_id: rootId, title: 'pf671 existing task',
    })
    expectStatus(task, 201, 'legacy Task created')
    const taskId = (task.json() as { id: string }).id
    await inTransaction(app.db, (tx) => tx.execute(sql`
      INSERT INTO page_blocks (folder_id, kind, position, text)
      VALUES (${rootId}::uuid, 'paragraph', 999, 'pf671 existing writing')
    `))
    const [taskRow] = await rows(app.db, sql`
      SELECT folder_id, page_facet_id FROM tasks WHERE id = ${taskId}::uuid
    `)
    expect(taskRow).toEqual({ folder_id: rootId, page_facet_id: rootFacet })
    const [block] = await rows(app.db, sql`
      SELECT id, folder_id, page_facet_id FROM page_blocks
       WHERE folder_id = ${rootId}::uuid AND text = 'pf671 existing writing'
    `)
    expect(block?.page_facet_id).toBe(rootFacet)

    // Moving legacy content between Page homes reassigns only the Facet link.
    await inTransaction(app.db, (tx) => tx.execute(sql`
      UPDATE page_blocks SET folder_id = ${childId}::uuid WHERE id = ${block?.id}::uuid
    `))
    expect(await rows(app.db, sql`
      SELECT folder_id, page_facet_id FROM page_blocks WHERE id = ${block?.id}::uuid
    `)).toEqual([{ folder_id: childId, page_facet_id: childFacet }])

    const [before] = await rows(app.db, sql`
      SELECT count(*)::int AS amount FROM folders WHERE project_id = ${rootId}::uuid
    `)
    const created = await owner.browser.json(`/pages/${childId}/facets`, 'POST', {
      name: 'pf671 Notes',
    })
    expectStatus(created, 201, 'created independent Facet')
    const notes = (created.json() as FacetResponse).facets.find((facet) => facet.name === 'pf671 Notes')
    expect(notes?.content_page_id).toBeNull()
    const [after] = await rows(app.db, sql`
      SELECT count(*)::int AS amount FROM folders WHERE project_id = ${rootId}::uuid
    `)
    expect(after).toEqual(before)

    // The future editor will supply the Facet id while retaining the parent Page id.
    await inTransaction(app.db, (tx) => tx.execute(sql`
      INSERT INTO page_blocks (folder_id, page_facet_id, kind, position, text)
      VALUES (${childId}::uuid, ${notes?.id}::uuid, 'paragraph', 1000, 'pf671 Notes draft')
    `))
    expect(await rows(app.db, sql`
      SELECT folder_id, page_facet_id FROM page_blocks
       WHERE text = 'pf671 Notes draft'
    `)).toEqual([{ folder_id: childId, page_facet_id: notes?.id }])
    // The same Facet cannot be used as another Page's content home.
    await expect(inTransaction(app.db, (tx) => tx.execute(sql`
      INSERT INTO page_blocks (folder_id, page_facet_id, kind, position, text)
      VALUES (${rootId}::uuid, ${notes?.id}::uuid, 'paragraph', 1001, 'invalid foreign Facet')
    `))).rejects.toMatchObject({
      cause: { message: expect.stringContaining('page_facet_not_here') },
    })

    // Backfilled legacy records (including seeded data) cannot point to a
    // different Facet than their original content home.
    expect(await rows(app.db, sql`
      SELECT count(*)::int AS amount FROM page_blocks b JOIN page_facets pf
        ON pf.content_folder_id = b.folder_id
       WHERE b.page_facet_id IS DISTINCT FROM pf.id
         AND b.text IS DISTINCT FROM 'pf671 Notes draft'
    `)).toEqual([{ amount: 0 }])
  }, 60_000)

  test('Facet reads are isolated and the legacy document transaction retains sibling content', async () => {
    const [owner, , stranger] = await cast.of(app)
    if (!owner || !stranger) throw new Error('Missing actors')
    const made = await owner.browser.json('/folders', 'POST', {
      name: 'pf671 independent content', kind: 'work',
    })
    expectStatus(made, 201, 'created root Page')
    const pageId = (made.json() as { id: string }).id
    const beforeFacets = await owner.browser.json(`/pages/${pageId}/facets`, 'GET')
    expectStatus(beforeFacets, 200, 'read Facets')
    const mainId = (beforeFacets.json() as FacetResponse).facets.find(
      (facet) => facet.name === 'Main',
    )?.id
    expect(mainId).toBeDefined()

    const add = await owner.browser.json(`/pages/${pageId}/facets`, 'POST', {
      name: 'Notes',
    })
    expectStatus(add, 201, 'created Notes')
    const notesId = (add.json() as FacetResponse).facets.find(
      (facet) => facet.name === 'Notes',
    )?.id
    expect(notesId).toBeDefined()

    const task = await owner.browser.json('/tasks', 'POST', {
      folder_id: pageId, title: 'pf671 Notes task',
    })
    expectStatus(task, 201, 'created Task')
    const taskId = (task.json() as { id: string }).id
    await inTransaction(app.db, async (tx) => {
      await tx.execute(sql`
        INSERT INTO page_blocks (folder_id, page_facet_id, kind, position, text)
        VALUES (${pageId}::uuid, ${mainId}::uuid, 'paragraph', 200, 'pf671 Main writing')
      `)
      await tx.execute(sql`
        INSERT INTO page_blocks (folder_id, page_facet_id, kind, position, text)
        VALUES (${pageId}::uuid, ${notesId}::uuid, 'paragraph', 201, 'pf671 Notes writing')
      `)
      await tx.execute(sql`
        UPDATE tasks SET page_facet_id = ${notesId}::uuid WHERE id = ${taskId}::uuid
      `)
    })

    const main = await owner.browser.json(`/folders/${pageId}/page`, 'GET')
    const independent = await owner.browser.json(
      `/pages/${pageId}/facets/${notesId}/document`, 'GET',
    )
    const mainFromFacet = await owner.browser.json(
      `/pages/${pageId}/facets/${mainId}/document`, 'GET',
    )
    expectStatus(main, 200, 'read original Main')
    expectStatus(independent, 200, 'read new Facet')
    expectStatus(mainFromFacet, 200, 'read Main through Facet endpoint')
    const mainPage = main.json() as {
      revision: string
      blocks: { id: string; text: string; section_block_id: string | null; list_parent_block_id: string | null }[]
      items: { id: string; kind: 'block' | 'task' }[]
      task_placements: { id: string; section_block_id: string | null }[]
    }
    const notesPage = independent.json() as typeof mainPage
    expect(mainPage.blocks.some((block) => block.text === 'pf671 Main writing')).toBe(true)
    expect(mainPage.blocks.some((block) => block.text === 'pf671 Notes writing')).toBe(false)
    expect(mainPage.items.some((item) => item.id === taskId)).toBe(false)
    expect(notesPage.blocks.map((block) => block.text)).toContain('pf671 Notes writing')
    expect(notesPage.items.some((item) => item.id === taskId)).toBe(true)
    expect(notesPage.revision).not.toBe(mainPage.revision)
    expect((mainFromFacet.json() as typeof mainPage).revision).toBe(mainPage.revision)

    // This is the old, still-supported Work editor's full-document write.
    // It must never delete or rearrange another Facet's writing or Tasks.
    const outline = mainPage.items.map((item) => {
      const block = mainPage.blocks.find((candidate) => candidate.id === item.id)
      return {
        kind: item.kind,
        id: item.id,
        section_block_id: block?.section_block_id ??
          mainPage.task_placements.find((task) => task.id === item.id)?.section_block_id ?? null,
        list_parent_block_id: block?.list_parent_block_id ?? null,
      }
    })
    const save = await owner.browser.json(`/folders/${pageId}/page/actions`, 'POST', {
      action: 'document_transaction',
      mutation_id: crypto.randomUUID(),
      base_revision: mainPage.revision,
      operations: [{ op: 'set_outline', items: outline }],
    })
    expectStatus(save, 200, 'legacy document save')

    const after = await owner.browser.json(
      `/pages/${pageId}/facets/${notesId}/document`, 'GET',
    )
    expectStatus(after, 200, 'Notes survived Main write')
    const kept = after.json() as typeof mainPage
    expect(kept.revision).toBe(notesPage.revision)
    expect(kept.blocks.some((block) => block.text === 'pf671 Notes writing')).toBe(true)
    expect(kept.items.some((item) => item.id === taskId)).toBe(true)

    expectStatus(
      await stranger.browser.json(`/pages/${pageId}/facets/${notesId}/document`, 'GET'),
      404, 'stranger must not see a Facet document',
    )
    expectStatus(
      await owner.browser.json(`/pages/${pageId}/facets/${crypto.randomUUID()}/document`, 'GET'),
      404, 'unknown Facet',
    )
  }, 60_000)

  test('the existing transaction saves a new Facet with independent revisions, Tasks and nested Pages', async () => {
    const [owner, viewer, stranger] = await cast.of(app)
    if (!owner || !viewer || !stranger) throw new Error('Missing test actors')
    const made = await owner.browser.json('/folders', 'POST', {
      name: 'pf671 transactional root', kind: 'work',
    })
    expectStatus(made, 201, 'created Page')
    const pageId = (made.json() as { id: string }).id
    const added = await owner.browser.json(`/pages/${pageId}/facets`, 'POST', {
      name: 'Notes',
    })
    expectStatus(added, 201, 'created Notes Facet')
    const facetId = (added.json() as FacetResponse).facets.find(
      (facet) => facet.name === 'Notes',
    )?.id
    expect(facetId).toBeDefined()
    const endpoint = `/pages/${pageId}/facets/${facetId}/document`

    const before = await owner.browser.json(endpoint, 'GET')
    expectStatus(before, 200, 'blank Notes')
    const base = before.json() as {
      revision: string
      items: { id: string; kind: string }[]
      blocks: { id: string; text: string | null }[]
      mutation?: { replayed: boolean; committed_revision: string }
    }
    expect(base.items).toEqual([])
    expect(base.blocks).toEqual([])

    const blockId = crypto.randomUUID()
    const taskId = crypto.randomUUID()
    const firstBody = {
      action: 'document_transaction',
      mutation_id: crypto.randomUUID(),
      base_revision: base.revision,
      operations: [
        {
          op: 'put_block', id: blockId, block_kind: 'paragraph',
          text: 'pf671 notes saved', rich_content: null,
          file_id: null, ref_folder_id: null, width_pct: null, checked: null,
        },
        { op: 'create_task', id: taskId, title: 'pf671 notes action' },
        {
          op: 'set_outline',
          items: [
            { kind: 'block', id: blockId, section_block_id: null, list_parent_block_id: null },
            { kind: 'task', id: taskId, section_block_id: null, list_parent_block_id: null },
          ],
        },
      ],
    }
    const saved = await owner.browser.json(endpoint + '/actions', 'POST', firstBody)
    expectStatus(saved, 200, 'saved Notes writing and Task')
    const updated = saved.json() as typeof base
    expect(updated.mutation?.replayed).toBe(false)
    expect(updated.items.map((item) => item.id)).toEqual([blockId, taskId])
    expect(updated.blocks[0]?.text).toBe('pf671 notes saved')
    expect(updated.revision).not.toBe(base.revision)
    expect(await rows(app.db, sql`
      SELECT page_facet_id, folder_id FROM tasks WHERE id = ${taskId}::uuid
    `)).toEqual([{ page_facet_id: facetId, folder_id: pageId }])
    expect(await rows(app.db, sql`
      SELECT page_facet_id, folder_id FROM page_blocks WHERE id = ${blockId}::uuid
    `)).toEqual([{ page_facet_id: facetId, folder_id: pageId }])

    const repeated = await owner.browser.json(endpoint + '/actions', 'POST', firstBody)
    expectStatus(repeated, 200, 'idempotent retry')
    expect(((repeated.json() as typeof base).mutation?.replayed)).toBe(true)
    expectStatus(await owner.browser.json(endpoint + '/actions', 'POST', {
      ...firstBody,
      mutation_id: crypto.randomUUID(),
    }), 409, 'stale revision is refused')

    const main = await owner.browser.json(`/folders/${pageId}/page`, 'GET')
    expectStatus(main, 200, 'Main remains separate')
    const original = main.json() as typeof base
    expect(original.items.some((item) => item.id === taskId || item.id === blockId)).toBe(false)
    expect(original.revision).toBe(base.revision)

    const subPageId = crypto.randomUUID()
    const homeBlockId = crypto.randomUUID()
    const secondBody = {
      action: 'document_transaction',
      mutation_id: crypto.randomUUID(),
      base_revision: updated.revision,
      operations: [
        { op: 'create_page', id: subPageId, block_id: homeBlockId, title: 'Notes child' },
        {
          op: 'set_outline',
          items: [
            { kind: 'block', id: blockId, section_block_id: null, list_parent_block_id: null },
            { kind: 'task', id: taskId, section_block_id: null, list_parent_block_id: null },
            { kind: 'block', id: homeBlockId, section_block_id: null, list_parent_block_id: null },
          ],
        },
      ],
    }
    const withChild = await owner.browser.json(endpoint + '/actions', 'POST', secondBody)
    expectStatus(withChild, 200, 'made nested Page inside Notes')
    expect(await rows(app.db, sql`
      SELECT parent_folder_id, containing_facet_id FROM folders WHERE id = ${subPageId}::uuid
    `)).toEqual([{ parent_folder_id: pageId, containing_facet_id: facetId }])
    expect(await rows(app.db, sql`
      SELECT page_facet_id, ref_folder_id FROM page_blocks WHERE id = ${homeBlockId}::uuid
    `)).toEqual([{ page_facet_id: facetId, ref_folder_id: subPageId }])

    const afterChild = (withChild.json() as typeof base)
    const missingFileId = crypto.randomUUID()
    expectStatus(await owner.browser.json(endpoint + '/actions', 'POST', {
      action: 'document_transaction',
      mutation_id: crypto.randomUUID(),
      base_revision: afterChild.revision,
      operations: [
        {
          op: 'put_block', id: crypto.randomUUID(), block_kind: 'file',
          text: null, rich_content: null, file_id: missingFileId,
          ref_folder_id: null, width_pct: null, checked: null,
        },
        { op: 'set_outline', items: [] },
      ],
    }), 422, 'unreachable uploaded file is refused')
    expect((await owner.browser.json(endpoint, 'GET')).json()).toMatchObject({
      revision: afterChild.revision,
    })

    await connect(app.db, owner.id, viewer.id)
    await connect(app.db, owner.id, stranger.id)
    await addMemberOk(owner, pageId, viewer.id, 'can_view')
    expectStatus(await viewer.browser.json(endpoint, 'GET'), 200, 'viewer reads Notes')
    expectStatus(await viewer.browser.json(endpoint + '/actions', 'POST', firstBody), 403, 'viewer cannot edit')
    expectStatus(await stranger.browser.json(endpoint + '/actions', 'POST', firstBody), 404, 'stranger cannot edit')
  }, 60_000)
  test('Trash preserves Facet writing and child Page IDs, restore recovers them and the last Facet is protected', async () => {
    const [owner, viewer, stranger] = await cast.of(app)
    if (!owner || !viewer || !stranger) throw new Error('Missing test actors')
    const root = await owner.browser.json('/folders', 'POST', {
      name: 'pf671 reversible Facet root', kind: 'work',
    })
    expectStatus(root, 201, 'created root Page')
    const pageId = (root.json() as { id: string }).id
    const main = (await owner.browser.json(`/pages/${pageId}/facets`, 'GET')).json() as FacetResponse
    const mainId = main.facets[0]?.id
    if (!mainId) throw new Error('Page needs Main')
    expectStatus(await owner.browser.json(`/pages/${pageId}/facets/${mainId}`, 'DELETE'),
      409, 'cannot delete sole Main')
    const added = await owner.browser.json(`/pages/${pageId}/facets`, 'POST', { name: 'Notes' })
    expectStatus(added, 201, 'added independent Notes')
    const notesId = (added.json() as FacetResponse).facets.find((facet) => facet.name === 'Notes')?.id
    if (!notesId) throw new Error('Notes Facet missing')
    expectStatus(await owner.browser.json(`/pages/${pageId}/facets/${mainId}`, 'DELETE'),
      409, 'legacy-backed Main is protected until old page routes retire')

    const path = `/pages/${pageId}/facets/${notesId}`
    const documentPath = path + '/document'
    const before = await owner.browser.json(documentPath, 'GET')
    expectStatus(before, 200, 'blank Notes read')
    const revision = (before.json() as { revision: string }).revision
    const blockId = crypto.randomUUID()
    const taskId = crypto.randomUUID()
    const saved = await owner.browser.json(documentPath + '/actions', 'POST', {
      action: 'document_transaction', mutation_id: crypto.randomUUID(), base_revision: revision,
      operations: [
        { op: 'put_block', id: blockId, block_kind: 'paragraph', text: 'reversible writing',
          rich_content: null, file_id: null, ref_folder_id: null, width_pct: null, checked: null },
        { op: 'create_task', id: taskId, title: 'reversible Task' },
        { op: 'set_outline', items: [
          { kind: 'block', id: blockId, section_block_id: null, list_parent_block_id: null },
          { kind: 'task', id: taskId, section_block_id: null, list_parent_block_id: null },
        ] },
      ],
    })
    expectStatus(saved, 200, 'saved Notes Task and writing')
    const childId = crypto.randomUUID()
    const homeId = crypto.randomUUID()
    const savedRevision = (saved.json() as { revision: string }).revision
    const withChild = await owner.browser.json(documentPath + '/actions', 'POST', {
      action: 'document_transaction', mutation_id: crypto.randomUUID(),
      base_revision: savedRevision,
      operations: [
        { op: 'create_page', id: childId, block_id: homeId, title: 'Retained Notes child' },
        { op: 'set_outline', items: [
          { kind: 'block', id: blockId, section_block_id: null, list_parent_block_id: null },
          { kind: 'task', id: taskId, section_block_id: null, list_parent_block_id: null },
          { kind: 'block', id: homeId, section_block_id: null, list_parent_block_id: null },
        ] },
      ],
    })
    expectStatus(withChild, 200, 'saved nested Page')
    const finalRevision = (withChild.json() as { revision: string }).revision

    await connect(app.db, owner.id, viewer.id)
    await connect(app.db, owner.id, stranger.id)
    await addMemberOk(owner, pageId, viewer.id, 'can_view')
    expectStatus(await viewer.browser.json(path, 'DELETE'), 403, 'viewer cannot Trash')
    expectStatus(await stranger.browser.json(path, 'DELETE'), 404, 'outsider does not discover Facet')
    const trashed = await owner.browser.json(path, 'DELETE')
    expectStatus(trashed, 200, 'Trash keeps all content')
    expect((trashed.json() as FacetResponse).facets.map((facet) => facet.id)).toEqual([mainId])
    expectStatus(await owner.browser.json(path, 'DELETE'), 404, 'repeat Trash is not a second deletion')
    const trash = await owner.browser.json(`/pages/${pageId}/facets/trash`, 'GET')
    expectStatus(trash, 200, 'Trash listing')
    expect((trash.json() as FacetResponse).facets.map((facet) => facet.id)).toContain(notesId)
    expectStatus(await viewer.browser.json(`/pages/${pageId}/facets/trash`, 'GET'),
      403, 'viewer cannot inspect Trash')
    expectStatus(await owner.browser.json(documentPath, 'GET'), 404, 'trashed writing hidden')
    expectStatus(await owner.browser.json(documentPath + '/actions', 'POST', {
      action: 'document_transaction', mutation_id: crypto.randomUUID(),
      base_revision: finalRevision, operations: [],
    }), 404, 'stale editor cannot save to Trash')
    expectStatus(await owner.browser.json(path, 'PATCH', { name: 'Renamed while trashed' }),
      404, 'cannot rename trashed Facet')
    expectStatus(await owner.browser.json(`/pages/${pageId}/facets/order`, 'PUT',
      { order: [mainId] }), 200, 'reorder only active Facets')
    expectStatus(await owner.browser.json(`/pages/${pageId}/facets/order`, 'PUT',
      { order: [mainId, notesId] }), 409, 'cannot accidentally reorder trashed Facet')

    expect(await rows(app.db, sql`
      SELECT page_facet_id, folder_id FROM page_blocks WHERE id = ${blockId}::uuid
    `)).toEqual([{ page_facet_id: notesId, folder_id: pageId }])
    expect(await rows(app.db, sql`
      SELECT page_facet_id, folder_id FROM tasks WHERE id = ${taskId}::uuid
    `)).toEqual([{ page_facet_id: notesId, folder_id: pageId }])
    expect(await rows(app.db, sql`
      SELECT parent_folder_id, containing_facet_id FROM folders WHERE id = ${childId}::uuid
    `)).toEqual([{ parent_folder_id: pageId, containing_facet_id: notesId }])

    expectStatus(await owner.browser.json(path + '/restore', 'POST'), 200, 'restore Notes')
    const restored = await owner.browser.json(documentPath, 'GET')
    expectStatus(restored, 200, 'restored Facet readable')
    const data = restored.json() as {
      revision: string; blocks: { id: string }[]; items: { id: string }[]
    }
    expect(data.revision).toBe(finalRevision)
    expect(data.blocks.map((block) => block.id)).toContain(blockId)
    expect(data.items.map((item) => item.id)).toEqual([blockId, taskId, homeId])
    expectStatus(await owner.browser.json(path + '/restore', 'POST'), 404, 'repeat restore refused')
  }, 60_000)

  test('account export retains independent and trashed Facet identities and content associations', async () => {
    const [owner] = await cast.of(app)
    if (!owner) throw new Error('Missing owner')
    const made = await owner.browser.json('/folders', 'POST', {
      name: 'pf671 account export root', kind: 'work',
    })
    expectStatus(made, 201, 'created Page')
    const pageId = (made.json() as { id: string }).id
    const original = (await owner.browser.json(`/pages/${pageId}/facets`, 'GET')).json() as FacetResponse
    const mainId = original.facets[0]?.id
    if (!mainId) throw new Error('Main missing')
    const created = await owner.browser.json(`/pages/${pageId}/facets`, 'POST', { name: 'Exported Notes' })
    expectStatus(created, 201, 'created Facet')
    const independentId = (created.json() as FacetResponse).facets.find(
      (facet) => facet.name === 'Exported Notes',
    )?.id
    if (!independentId) throw new Error('New Facet missing')

    const path = `/pages/${pageId}/facets/${independentId}/document`
    const before = await owner.browser.json(path, 'GET')
    expectStatus(before, 200, 'read empty Facet')
    const blockId = crypto.randomUUID()
    const taskId = crypto.randomUUID()
    expectStatus(await owner.browser.json(path + '/actions', 'POST', {
      action: 'document_transaction', mutation_id: crypto.randomUUID(),
      base_revision: (before.json() as { revision: string }).revision,
      operations: [
        { op: 'put_block', id: blockId, block_kind: 'paragraph',
          text: 'Must stay associated during export', rich_content: null,
          file_id: null, ref_folder_id: null, width_pct: null, checked: null },
        { op: 'create_task', id: taskId, title: 'Must export with its Facet' },
        { op: 'set_outline', items: [
          { kind: 'block', id: blockId, section_block_id: null, list_parent_block_id: null },
          { kind: 'task', id: taskId, section_block_id: null, list_parent_block_id: null },
        ] },
      ],
    }), 200, 'write independent content')

    const verifyExport = async (trashed: boolean): Promise<void> => {
      const response = await owner.browser.json('/me/export', 'GET')
      expectStatus(response, 200, 'complete account export')
      const exported = response.json() as {
        version: number
        page_facets: { id: string; page_id: string; content_page_id: string | null; trashed: boolean }[]
        folders: {
          id: string
          blocks: { id: string; page_facet_id: string | null }[]
          tasks: { id: string; page_facet_id: string | null }[]
        }[]
      }
      expect(exported.version).toBe(17)
      expect(exported.page_facets).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: mainId, page_id: pageId, content_page_id: pageId, trashed: false }),
        expect.objectContaining({ id: independentId, page_id: pageId, content_page_id: null, trashed }),
      ]))
      const page = exported.folders.find((folder) => folder.id === pageId)
      expect(page).toBeDefined()
      expect(page?.blocks).toContainEqual(expect.objectContaining({
        id: blockId, page_facet_id: independentId,
      }))
      expect(page?.tasks).toContainEqual(expect.objectContaining({
        id: taskId, page_facet_id: independentId,
      }))
    }
    await verifyExport(false)
    expectStatus(await owner.browser.json(`/pages/${pageId}/facets/${independentId}`, 'DELETE'),
      200, 'Trash independent Facet')
    await verifyExport(true)
  }, 60_000)

})
