/*
AC-880 to AC-885: a Task owns a document (issue #221), and nothing a Task's
notes held is lost on the way in or afterwards.

- AC-880: migration 0031's backfill turns every non-empty `notes` into
  paragraph blocks whose texts are exactly `notesParagraphs(notes)`, joined
  with '\n' back to the notes, and a re-run writes nothing twice.
- AC-881: a Task whose notes arrived without a document (the deployed
  client's POST) is given one on first read, once.
- AC-882: a stranger is 404 on both document routes and a Can-view member is
  403 on the write, and neither changes a stored row.
- AC-883: a document write rewrites `notes` as its projection; a legacy
  `notes` PATCH replaces a plain-mirror document and appends to a rich one,
  never dropping a block.
- AC-884: duplicate and export carry the document.
- AC-885: trash keeps the document, and purging the Task cascades it.

Spec: 4.17, 7.6, 7.16, 7.22, 7.28.
*/
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast, addMemberOk, connect, createFolder, seedTask } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import { notesParagraphs } from '../../src/server/domain/task-document.js'
import { initialKeys } from '../../src/server/domain/fractional-index.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'viewer', 'stranger'])

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

async function rows(query: ReturnType<typeof sql>): Promise<Record<string, unknown>[]> {
  const result = (await app.db.execute(query)) as unknown as { rows: Record<string, unknown>[] }
  return result.rows
}

async function blocksOf(taskId: string): Promise<Record<string, unknown>[]> {
  return rows(sql`SELECT id, kind, text, page_position, rich_content, checked
                    FROM page_blocks WHERE task_id = ${taskId}::uuid
                   ORDER BY page_position, id`)
}

async function notesOf(taskId: string): Promise<string | null> {
  const found = await rows(sql`SELECT notes FROM tasks WHERE id = ${taskId}::uuid`)
  return (found[0]?.notes ?? null) as string | null
}

async function seedNoted(folderId: string, createdBy: string, notes: string | null) {
  const id = await seedTask(app.db, { folderId, createdBy })
  await app.db.execute(sql`UPDATE tasks SET notes = ${notes} WHERE id = ${id}::uuid`)
  return id
}

/** The backfill statement of migration 0031, run verbatim. */
function backfillStatement(): string {
  const text = readFileSync(
    new URL('../../db/migrations/0031_task_document.sql', import.meta.url),
    'utf-8',
  )
  const statement = text.split('--> statement-breakpoint').find((part) => part.includes('DO $$'))
  if (statement === undefined) throw new Error('0031 must carry its backfill')
  return statement
}

interface View {
  revision: string
  blocks: { id: string; kind: string; text: string | null }[]
}

function paragraph(id: string, text: string | null) {
  return {
    op: 'put_block',
    id,
    block_kind: 'paragraph',
    text,
    rich_content: null,
    file_id: null,
    ref_folder_id: null,
    width_pct: null,
    checked: null,
  }
}

function checklist(id: string, text: string, checked: boolean) {
  return { ...paragraph(id, text), block_kind: 'checklist', checked }
}

function outline(ids: string[]) {
  return {
    op: 'set_outline',
    items: ids.map((id) => ({ kind: 'block', id, section_block_id: null, list_parent_block_id: null })),
  }
}

async function readDocument(actor: Actor, taskId: string): Promise<View> {
  const response = await actor.browser.api(`/tasks/${taskId}/document`)
  expect(response.status, 'a member reads the Task document').toBe(200)
  return response.json() as View
}

async function writeDocument(actor: Actor, taskId: string, base: string, operations: unknown[]) {
  return actor.browser.json(`/tasks/${taskId}/document`, 'PUT', {
    action: 'document_transaction',
    mutation_id: randomUUID(),
    base_revision: base,
    operations,
  })
}

interface Stage {
  owner: Actor
  viewer: Actor
  stranger: Actor
  folderId: string
}
let staged: Stage | undefined
async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const [owner, viewer, stranger] = await cast.of(app)
    if (owner === undefined || viewer === undefined || stranger === undefined) {
      throw new Error('cast must produce three actors')
    }
    await connect(app.db, owner.id, viewer.id)
    const folderId = await createFolder(owner, 'ac880 task documents')
    await addMemberOk(owner, folderId, viewer.id, 'can_view')
    staged = { owner, viewer, stranger, folderId }
  }
  return staged
}

describe('AC-880: the backfill preserves every note exactly', () => {
  test('AC-880: every non-empty note becomes paragraphs joined back to it, and a re-run adds nothing', async () => {
    const { owner, folderId } = await stage()
    const longLines = Array.from({ length: 90 }, (_, i) => `line ${String(i)} `.padEnd(99, 'x')).join('\n')
    const cases: { notes: string; exact: boolean }[] = [
      { notes: 'one line', exact: true },
      { notes: 'a\nb\n\nc\n', exact: true },
      { notes: '  leading and trailing whitespace \t ', exact: true },
      { notes: longLines, exact: true },
      { notes: `${'x'.repeat(4500)}\nend`, exact: false },
      { notes: '\u{1F600}'.repeat(4100), exact: false },
    ]
    const ids: string[] = []
    for (const item of cases) ids.push(await seedNoted(folderId, owner.id, item.notes))
    const empty = await seedNoted(folderId, owner.id, '')
    const none = await seedNoted(folderId, owner.id, null)

    await app.db.execute(sql.raw(backfillStatement()))
    const firstCounts: number[] = []
    for (const [index, item] of cases.entries()) {
      const id = ids[index] as string
      const blocks = await blocksOf(id)
      const texts = blocks.map((b) => String(b.text))
      firstCounts.push(blocks.length)
      expect(texts, 'the SQL backfill and notesParagraphs are one algorithm').toEqual(
        notesParagraphs(item.notes),
      )
      expect(blocks.every((b) => b.kind === 'paragraph' && b.rich_content === null)).toBe(true)
      expect(blocks.map((b) => b.page_position)).toEqual(initialKeys(blocks.length))
      if (item.exact) expect(texts.join('\n'), 'line breaks are kept exactly').toBe(item.notes)
      else expect(texts.join(''), 'a mid-line cut loses no character').toBe(item.notes)
      expect(await notesOf(id), 'the notes column is untouched').toBe(item.notes)
    }
    expect(firstCounts[3], 'a 9000-character note of short lines is cut at line breaks').toBe(3)
    expect(await blocksOf(empty)).toEqual([])
    expect(await blocksOf(none)).toEqual([])

    await app.db.execute(sql.raw(backfillStatement()))
    for (const [index, id] of ids.entries()) {
      expect((await blocksOf(id)).length, 'a re-run writes nothing twice').toBe(firstCounts[index])
    }
  })
})

describe('AC-881 to AC-885: the Task document routes', () => {
  test('AC-881: notes written by the deployed client become the document on first read, once', async () => {
    const { owner, folderId } = await stage()
    const created = await owner.browser.json('/tasks', 'POST', {
      folder_id: folderId,
      title: 'ac881 legacy notes',
      notes: 'first\nsecond',
    })
    expect(created.status).toBe(201)
    const taskId = String((created.json() as { id: string }).id)
    const first = await readDocument(owner, taskId)
    const second = await readDocument(owner, taskId)
    expect(first.blocks.map((b) => b.text)).toEqual(['first\nsecond'])
    expect(second.revision).toBe(first.revision)
    expect((await blocksOf(taskId)).length).toBe(1)
  })

  test('AC-882: a stranger is 404 and a Can-view member 403, and no stored row changes', async () => {
    const { owner, viewer, stranger, folderId } = await stage()
    const taskId = await seedNoted(folderId, owner.id, 'private words')
    const view = await readDocument(owner, taskId)
    const before = await blocksOf(taskId)

    const strangerRead = await stranger.browser.api(`/tasks/${taskId}/document`)
    expect(strangerRead.status).toBe(404)
    const strangerWrite = await writeDocument(stranger, taskId, view.revision, [outline([])])
    expect(strangerWrite.status).toBe(404)
    const viewerRead = await viewer.browser.api(`/tasks/${taskId}/document`)
    expect(viewerRead.status, 'a Can-view member reads').toBe(200)
    const viewerWrite = await writeDocument(viewer, taskId, view.revision, [outline([])])
    expect(viewerWrite.status, 'a Can-view member may not write').toBe(403)

    expect(await blocksOf(taskId)).toEqual(before)
    expect(await notesOf(taskId)).toBe('private words')
  })

  test('AC-883: a document write rewrites notes; a legacy notes write replaces a mirror and appends to a rich document', async () => {
    const { owner, folderId } = await stage()
    const taskId = await seedNoted(folderId, owner.id, 'old text')
    const view = await readDocument(owner, taskId)

    // A plain mirror: the legacy textarea's write replaces it.
    const replaced = await owner.browser.json(`/tasks/${taskId}`, 'PATCH', { notes: 'new text\nline two' })
    expect(replaced.status).toBe(200)
    expect((await blocksOf(taskId)).map((b) => b.text)).toEqual(['new text\nline two'])
    expect(await notesOf(taskId)).toBe('new text\nline two')

    // The composer writes a checklist: notes becomes its projection, which
    // since 0060 leaves checklist items (the subtasks) out.
    const stale = await writeDocument(owner, taskId, view.revision, [outline([])])
    expect(stale.status, 'a stale base revision is refused').toBe(409)
    const current = await readDocument(owner, taskId)
    const keep = current.blocks[0]?.id as string
    const check = randomUUID()
    const wrote = await writeDocument(owner, taskId, current.revision, [
      checklist(check, 'buy milk', true),
      outline([keep, check]),
    ])
    expect(wrote.status, JSON.stringify(wrote.json())).toBe(200)
    expect(await notesOf(taskId)).toBe('new text\nline two')

    // The deployed client extends the notes: only the addition is appended.
    const extended = await owner.browser.json(`/tasks/${taskId}`, 'PATCH', {
      notes: 'new text\nline two\nand eggs',
    })
    expect(extended.status).toBe(200)
    let stored = await blocksOf(taskId)
    expect(stored.map((b) => [b.kind, b.text])).toEqual([
      ['paragraph', 'new text\nline two'],
      ['checklist', 'buy milk'],
      ['paragraph', 'and eggs'],
    ])
    expect(stored[1]?.checked, 'the checklist keeps its tick').toBe(true)
    expect(await notesOf(taskId)).toBe('new text\nline two\nand eggs')

    // The deployed client rewrites the notes: nothing is dropped, the text is appended.
    const rewritten = await owner.browser.json(`/tasks/${taskId}`, 'PATCH', { notes: 'totally different' })
    expect(rewritten.status).toBe(200)
    stored = await blocksOf(taskId)
    expect(stored.map((b) => b.text)).toEqual([
      'new text\nline two',
      'buy milk',
      'and eggs',
      'totally different',
    ])
    expect(await notesOf(taskId)).toBe('new text\nline two\nand eggs\ntotally different')
  })

  test('AC-883: a legacy notes write never erases the tail of a plain document longer than the notes column', async () => {
    const { owner, folderId } = await stage()
    const taskId = await seedNoted(folderId, owner.id, null)
    const view = await readDocument(owner, taskId)
    const [a, b, c] = [randomUUID(), randomUUID(), randomUUID()]
    const wrote = await writeDocument(owner, taskId, view.revision, [
      paragraph(a, 'a'.repeat(4000)),
      paragraph(b, 'b'.repeat(4000)),
      paragraph(c, `${'c'.repeat(3990)}THE-TAIL`),
      outline([a, b, c]),
    ])
    expect(wrote.status, JSON.stringify(wrote.json())).toBe(200)
    const cut = await notesOf(taskId)
    expect(cut?.length, 'notes is the cut projection').toBe(10000)

    // The deployed textarea sends back the 10000 characters it was shown, edited at the end.
    const written = `${(cut ?? '').slice(0, 9995)} more`
    const patched = await owner.browser.json(`/tasks/${taskId}`, 'PATCH', { notes: written })
    expect(patched.status).toBe(200)
    const stored = await blocksOf(taskId)
    expect(stored.slice(0, 3).map((row) => row.id), 'every block the document held survives').toEqual([a, b, c])
    expect(String(stored[2]?.text).endsWith('THE-TAIL'), 'the tail past 10000 characters survives').toBe(true)
    expect(stored.slice(3).map((row) => row.text).join('\n'), 'the written text is appended, in order').toBe(written)
  })

  test('AC-883: a legacy notes write replaces a short plain document whose text differs from notes', async () => {
    const { owner, folderId } = await stage()
    const taskId = await seedNoted(folderId, owner.id, null)
    const view = await readDocument(owner, taskId)
    const id = randomUUID()
    const wrote = await writeDocument(owner, taskId, view.revision, [paragraph(id, 'backfilled'), outline([id])])
    expect(wrote.status, JSON.stringify(wrote.json())).toBe(200)
    // The deploy overlap: the old server wrote notes alone, so the document lags it.
    await app.db.execute(sql`UPDATE tasks SET notes = 'written by the old server' WHERE id = ${taskId}::uuid`)

    const patched = await owner.browser.json(`/tasks/${taskId}`, 'PATCH', { notes: 'final words' })
    expect(patched.status).toBe(200)
    expect((await blocksOf(taskId)).map((row) => [row.kind, row.text])).toEqual([['paragraph', 'final words']])
    expect(await notesOf(taskId)).toBe('final words')
  })

  test("AC-883: a Task document write leaves the deployed client's legacy Folder page writer open", async () => {
    const { owner } = await stage()
    const folderId = await createFolder(owner, 'ac883 legacy page writer')
    const section = async (name: string) => {
      const page = await owner.browser.api(`/folders/${folderId}/page`)
      expect(page.status).toBe(200)
      const items = (page.json() as { items: unknown[] }).items
      return owner.browser.json(`/folders/${folderId}/page/actions`, 'POST', {
        action: 'insert_block',
        block_kind: 'section',
        text: name,
        section_block_id: null,
        after: items.at(-1) ?? null,
        before: null,
      })
    }
    const first = await section('first work'); expect(first.status, JSON.stringify(first.json())).toBe(200)

    const taskId = await seedNoted(folderId, owner.id, null)
    const view = await readDocument(owner, taskId)
    const id = randomUUID()
    const wrote = await writeDocument(owner, taskId, view.revision, [paragraph(id, 'edited'), outline([id])])
    expect(wrote.status, JSON.stringify(wrote.json())).toBe(200)

    expect((await section('second work')).status, 'a Task document write does not shut it').toBe(200)
    const sections = await rows(sql`SELECT text FROM page_blocks
                                     WHERE folder_id = ${folderId}::uuid AND kind = 'section'`)
    expect(sections.map((row) => row.text).sort()).toEqual(['first work', 'second work'])
  })

  test('AC-883: a Task document refuses Task rows, Sections and a block nested under a divider with 422', async () => {
    const { owner, folderId } = await stage()
    const taskId = await seedNoted(folderId, owner.id, null)
    const view = await readDocument(owner, taskId)
    const id = randomUUID()
    const section = await writeDocument(owner, taskId, view.revision, [
      { ...paragraph(id, 'Heading'), block_kind: 'section' },
      outline([id]),
    ])
    expect(section.status).toBe(422)
    const nestedParent = randomUUID()
    const nestedChild = randomUUID()
    const nested = await writeDocument(owner, taskId, view.revision, [
      { ...paragraph(nestedParent, null), block_kind: 'divider' },
      { ...paragraph(nestedChild, 'b'), block_kind: 'bullet' },
      {
        op: 'set_outline',
        items: [
          { kind: 'block', id: nestedParent, section_block_id: null, list_parent_block_id: null },
          { kind: 'block', id: nestedChild, section_block_id: null, list_parent_block_id: nestedParent },
        ],
      },
    ])
    expect(nested.status).toBe(422)
    expect(await blocksOf(taskId)).toEqual([])

    // Since 0038 a Task document nests: a block under a toggle heading is
    // stored with its parent, and the heading keeps `toggleable`.
    const heading = randomUUID()
    const inside = randomUUID()
    const folds = await writeDocument(owner, taskId, view.revision, [
      { ...paragraph(heading, 'Folds'), block_kind: 'heading1', rich_content: null, toggleable: true },
      paragraph(inside, 'inside'),
      {
        op: 'set_outline',
        items: [
          { kind: 'block', id: heading, section_block_id: null, list_parent_block_id: null },
          { kind: 'block', id: inside, section_block_id: null, list_parent_block_id: heading },
        ],
      },
    ])
    expect(folds.status, JSON.stringify(folds.json())).toBe(200)
    const stored = await rows(sql`SELECT id, list_parent_block_id, toggleable FROM page_blocks
                                   WHERE task_id = ${taskId}::uuid ORDER BY page_position`)
    expect(stored).toEqual([
      { id: heading, list_parent_block_id: null, toggleable: true },
      { id: inside, list_parent_block_id: heading, toggleable: null },
    ])
  })

  test('AC-884: duplicate and export carry the Task document', async () => {
    const { owner, folderId } = await stage()
    const taskId = await seedNoted(folderId, owner.id, 'carried')
    const view = await readDocument(owner, taskId)
    const check = randomUUID()
    const wrote = await writeDocument(owner, taskId, view.revision, [
      checklist(check, 'ticked', true),
      outline([view.blocks[0]?.id as string, check]),
    ])
    expect(wrote.status, JSON.stringify(wrote.json())).toBe(200)

    const duplicated = await owner.browser.json(`/tasks/${taskId}/duplicate`, 'POST', {})
    expect(duplicated.status).toBe(201)
    const copyId = String((duplicated.json() as { id: string }).id)
    const copied = await blocksOf(copyId)
    // A copy's checklist (its subtasks) comes unticked (8.5, AC-1517).
    expect(copied.map((b) => [b.kind, b.text, b.checked])).toEqual([
      ['paragraph', 'carried', null],
      ['checklist', 'ticked', false],
    ])
    expect(copied.some((b) => b.id === check), 'the copy has blocks of its own').toBe(false)
    expect((await blocksOf(taskId)).length, 'the source keeps its document').toBe(2)

    const exported = await owner.browser.api('/me/export')
    expect(exported.status).toBe(200)
    const data = exported.json() as {
      version: number
      folders: { id: string; tasks: { id: string; document: { kind: string; text: string | null }[] }[] }[]
    }
    expect(data.version).toBe(9)
    const task = data.folders.find((f) => f.id === folderId)?.tasks.find((t) => t.id === taskId)
    expect(task?.document.map((b) => [b.kind, b.text])).toEqual([
      ['paragraph', 'carried'],
      ['checklist', 'ticked'],
    ])
  })

  test('AC-885: trash keeps the document and purging the Task cascades it', async () => {
    const { owner, folderId } = await stage()
    const taskId = await seedNoted(folderId, owner.id, 'kept through trash')
    await readDocument(owner, taskId)
    const trashed = await owner.browser.json(`/tasks/${taskId}`, 'DELETE')
    expect(trashed.status).toBeLessThan(300)
    expect((await owner.browser.api(`/tasks/${taskId}/document`)).status).toBe(404)
    expect((await blocksOf(taskId)).map((b) => b.text)).toEqual(['kept through trash'])
    await app.db.execute(sql`DELETE FROM tasks WHERE id = ${taskId}::uuid`)
    expect(await blocksOf(taskId)).toEqual([])
  })
})
