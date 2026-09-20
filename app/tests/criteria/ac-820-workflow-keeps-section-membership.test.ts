/*
AC-820: given a folder page with two Sections and Tasks under each, when it is
saved as a workflow file and that file is imported into another account, then
every Task arrives under the Section it was under, and content the page held at
the root after a Section arrives at the root.

## This is the reported defect, driven end to end

Issue #185's first sentence: "the tasks were no longer under their intended
Sections". It followed from the contract rather than from the endpoint — a
workflow file carried `blocks` and `tasks` as two collections, and a collection
cannot say that one of its members sits *under* a member of the other. Format 4
carries one ordered page, so the membership is the order, and this criterion is
the one that says so at the far end of a real round trip.

## What is asserted, and why it is rows

`POST /workflows/import` answers a folder id. It answers exactly the same id
whether the Tasks landed under their Sections or at the page root, so the
response cannot tell those two apart and nothing here reads it as though it
could. `tasks.section_block_id` and `page_blocks.section_block_id` are read
straight out of the database, in the folder's own `page_position` order, with
every identity replaced by the text of what it names — the source's ids are the
one thing that provably does not travel.

## The root paragraph is not decoration

7.16 admits content at the page root **after** a Section: a purely positional
file could not say so, and would claim the Section above it. The fixture puts
one there on purpose, so that the `section` escape is exercised by the same
round trip that exercises the default. Take the escape out of the writer and
this criterion fails on that row alone, with the Sections still right.

Spec: 7.16, 4.17. Issue #185.
*/
import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast, createFolder } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import {
  asFile,
  at,
  compose,
  importWorkflowOk,
  pageRows,
  put,
  savedWorkflow,
  shapeOf,
  task,
} from '../support/workflow-page-harness.js'

let app: AuthTestApp
const cast = new Cast(['author', 'reader'], 'ac820')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-820 a Task travels under the Section it was under', () => {
  test('two Sections, work under each, and a paragraph at the root after them', async () => {
    const [author, reader] = (await cast.of(app)) as [Actor, Actor]
    const sourceId = await createFolder(author, 'ac820 launch')

    const before = randomUUID()
    const after = randomUUID()
    const note = randomUUID()
    const loose = randomUUID()
    const first = randomUUID()
    const second = randomUUID()

    await compose(
      author,
      sourceId,
      [
        put(before, 'section', 'ac820 before the day'),
        put(note, 'paragraph', 'ac820 read this first'),
        put(after, 'section', 'ac820 on the day'),
        put(loose, 'paragraph', 'ac820 and afterwards'),
        { op: 'create_task', id: first, title: 'ac820 book the room' },
        { op: 'create_task', id: second, title: 'ac820 send the invite' },
        {
          op: 'set_outline',
          items: [
            at(before),
            task(first, before),
            at(note, before),
            at(after),
            task(second, after),
            /* The page root, *after* a Section. The one arrangement a purely
               positional file cannot say without lying about it. */
            at(loose),
          ],
        },
      ],
      'the fixture page must compose through the document transaction (7.16)',
    )

    const sourceShape = shapeOf(await pageRows(app.db, sourceId))
    expect(
      sourceShape,
      'the fixture must actually put the work under the headings, or nothing below proves anything',
    ).toEqual([
      { kind: 'section', text: 'ac820 before the day', under: null, nested_under: null },
      { kind: 'task', text: 'ac820 book the room', under: 'ac820 before the day', nested_under: null },
      { kind: 'paragraph', text: 'ac820 read this first', under: 'ac820 before the day', nested_under: null },
      { kind: 'section', text: 'ac820 on the day', under: null, nested_under: null },
      { kind: 'task', text: 'ac820 send the invite', under: 'ac820 on the day', nested_under: null },
      { kind: 'paragraph', text: 'ac820 and afterwards', under: null, nested_under: null },
    ])

    const saved = await savedWorkflow(author, sourceId, 'ac820 launch')
    expect(
      saved.file.folders[0]?.page?.blocks.map((block) =>
        block.kind === 'task'
          ? ['task', block.title, block.section]
          : [block.kind, 'text' in block ? block.text : null, 'section' in block ? block.section : undefined],
      ),
      'the file says membership by position, and says `section` only where position would be wrong: the two Tasks and the paragraph under a heading carry no key at all, and the root paragraph carries `section: null` (#185)',
    ).toEqual([
      ['section', 'ac820 before the day', undefined],
      ['task', 'ac820 book the room', undefined],
      ['paragraph', 'ac820 read this first', undefined],
      ['section', 'ac820 on the day', undefined],
      ['task', 'ac820 send the invite', undefined],
      ['paragraph', 'ac820 and afterwards', null],
    ])

    /* Into a **different account**, which is what a template is for and is the
       case in which a carried id would be a row the reader cannot read. */
    const madeId = await importWorkflowOk(reader, asFile(saved))
    expect(
      shapeOf(await pageRows(app.db, madeId)),
      'every Task is under the Section it was under, the paragraph under its own heading, and the root paragraph at the root — read off tasks.section_block_id and page_blocks.section_block_id rather than off the answer (spec 7.16, 4.17)',
    ).toEqual(sourceShape)

    const madeRows = await pageRows(app.db, madeId)
    const sourceRows = await pageRows(app.db, sourceId)
    expect(
      madeRows.some((row) => sourceRows.some((was) => was.id === row.id)),
      'and not one identity came across: a template names no row of the account that wrote it (#185)',
    ).toBe(false)
  })
})
