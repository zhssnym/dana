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
import { Cast, createFolder, expectStatus } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import { transition } from '../support/tasks-harness.js'
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

  /*
  A completed Task on the page, which is the case that used to make Dana refuse
  its own export.

  **This is a defect #185 closes rather than a rule it introduces, and it is
  written down because nothing watched it.** 7.16 carries no state, so the
  folder page hands the writer its **pending** work only — while the page's
  `items` name every Task on it, completed ones included. Version 2 wrote both:
  `task_ids` from the pending list and the outline from the items, so a folder
  with one finished Task produced a file whose outline named a Task the file did
  not carry, and importing it met
  `422 Workflow outline references missing content.` Read from `folderToWorkflowFile`
  and `importWorkflow` as they stood at 9682d14.

  Format 4 has one array, so a Task the writer was not given is simply not
  written, and nothing anywhere names it. What this case pins is both halves:
  the file imports, and the finished work does not travel.
  */
  test('a completed Task on the page is not written, and the rest still imports', async () => {
    const [author, reader] = (await cast.of(app)) as [Actor, Actor]
    const sourceId = await createFolder(author, 'ac820 half done')

    const heading = randomUUID()
    const done = randomUUID()
    const open = randomUUID()

    await compose(
      author,
      sourceId,
      [
        put(heading, 'section', 'ac820 the morning'),
        { op: 'create_task', id: done, title: 'ac820 already finished' },
        { op: 'create_task', id: open, title: 'ac820 still to do' },
        {
          op: 'set_outline',
          items: [at(heading), task(done, heading), task(open, heading)],
        },
      ],
      'the fixture page must compose (7.16)',
    )
    expectStatus(
      await transition(author, done, 'complete'),
      200,
      'the fixture Task must complete through 7.6’s own transition',
    )

    const saved = await savedWorkflow(author, sourceId, 'ac820 half done')
    expect(
      (saved.file.folders[0]?.page?.blocks ?? []).map((block) =>
        block.kind === 'task' ? block.title : block.kind,
      ),
      'the finished Task is not in the file at all: 7.16 carries no state, and a template of work already done is not a template',
    ).toEqual(['section', 'ac820 still to do'])
    /*
    **And it is counted, since 2026-09-21.** The decision above stands and is
    7.16's; what did not stand is that it happened with nothing said, which is
    #185's own defect — a file that quietly holds less than the page it was made
    from — in the one place the format could not fix it, since a finished Task is
    excluded by rule at every version and has no placeholder to be written as.
    The count is the writer's own answer, so the export toast cannot drift out of
    step with what the file actually holds; 7.16 carries the reasoning.
    */
    expect(
      saved.withheldTasks,
      'and the writer says how much finished work it was not given, so the person saving is told rather than finding out',
    ).toBe(1)

    const madeId = await importWorkflowOk(reader, asFile(saved))
    expect(
      shapeOf(await pageRows(app.db, madeId)),
      'and the file imports rather than naming work it does not carry — which is what a version 2 file did, its outline being written from the page while its Task list was written from the pending work alone (#185)',
    ).toEqual([
      { kind: 'section', text: 'ac820 the morning', under: null, nested_under: null },
      { kind: 'task', text: 'ac820 still to do', under: 'ac820 the morning', nested_under: null },
    ])
  })
})
