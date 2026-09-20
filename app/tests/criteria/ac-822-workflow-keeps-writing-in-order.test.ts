/*
AC-822: given a folder page holding paragraphs and #219's structured writing —
nested lists, a ticked checklist item, a quote, a callout, a code block — and a
Section inside a Section, when it is saved as a workflow file and imported,
then every block arrives with its kind, its place in the order, its heading
depth and its list parent intact.

## The two relations are asserted separately, because they are separate

4.17 and #219 are explicit that `section_block_id` is Work grouping and
`list_parent_block_id` is writing structure, that a nested list item inside a
Section carries both, and that neither is inferred from the other. A format
that carried one index and called it "the parent" would round trip a page that
has only one of them and lose the pages that have both — which is why the
fixture has a list nested three deep **inside** a level-2 Section and the
assertion names both parents on the same row.

## Heading depth survives as depth rather than as a number nobody checks

Format 4 says a heading's nesting with `level`, which is the whole of how
Sections nest in the file. The fixture nests a Section inside a Section, and
the assertion reads the imported `page_blocks.section_block_id` chain — so a
writer that emitted `level` and an importer that ignored it would fail here
rather than pass on a key nobody read.

## Order is the page's order and is read from the database

Every row is read in `page_position` order, which is the order 4.17 says blocks
and Tasks share, and compared as a list. Nothing reads the response.

Spec: 7.16, 4.17 as amended by #218 and #219. Issue #185.
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
} from '../support/workflow-page-harness.js'

let app: AuthTestApp
const cast = new Cast(['author', 'reader'], 'ac822')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-822 writing keeps its kind, its order and both of its parents', () => {
  test('a nested list inside a nested Section, a quote, a callout and code', async () => {
    const [author, reader] = (await cast.of(app)) as [Actor, Actor]
    const sourceId = await createFolder(author, 'ac822 handbook')

    const outer = randomUUID()
    const inner = randomUUID()
    const lead = randomUUID()
    const bullet = randomUUID()
    const nested = randomUUID()
    const ticked = randomUUID()
    const quote = randomUUID()
    const callout = randomUUID()
    const code = randomUUID()
    const tail = randomUUID()

    await compose(
      author,
      sourceId,
      [
        put(outer, 'section', 'ac822 the handbook'),
        put(inner, 'section', 'ac822 the morning'),
        put(lead, 'paragraph', 'ac822 read this first'),
        put(bullet, 'bullet', 'ac822 open the room'),
        put(nested, 'numbered', 'ac822 unlock the cupboard'),
        put(ticked, 'checklist', 'ac822 count the chairs', { checked: true }),
        put(quote, 'quote', 'ac822 nothing is ever finished'),
        put(callout, 'callout', 'ac822 mind the step'),
        put(code, 'code', 'ac822 npm run gate'),
        put(tail, 'paragraph', 'ac822 and afterwards'),
        {
          op: 'set_outline',
          items: [
            at(outer),
            /* A level-2 Section: the depth format 4 has to say with `level`. */
            at(inner, outer),
            at(lead, inner),
            at(bullet, inner),
            /* Both parents at once, which is the case a one-parent format
               loses: this item is in the inner Section *and* nested under the
               bullet above it (#219). */
            at(nested, inner, bullet),
            at(ticked, inner, nested),
            at(quote, inner),
            at(callout, outer),
            at(code, outer),
            at(tail),
          ],
        },
      ],
      'the fixture page must compose through the document transaction (7.16)',
    )

    const sourceShape = shapeOf(await pageRows(app.db, sourceId))
    expect(
      sourceShape.map((row) => [row.kind, row.under, row.nested_under]),
      'the fixture must actually hold the structure, or the round trip below proves nothing',
    ).toEqual([
      ['section', null, null],
      ['section', 'ac822 the handbook', null],
      ['paragraph', 'ac822 the morning', null],
      ['bullet', 'ac822 the morning', null],
      ['numbered', 'ac822 the morning', 'ac822 open the room'],
      ['checklist', 'ac822 the morning', 'ac822 unlock the cupboard'],
      ['quote', 'ac822 the morning', null],
      ['callout', 'ac822 the handbook', null],
      ['code', 'ac822 the handbook', null],
      ['paragraph', null, null],
    ])

    const saved = await savedWorkflow(author, sourceId, 'ac822 handbook')
    expect(
      saved.file.folders[0]?.page?.blocks.map((block) =>
        block.kind === 'task' || block.kind === 'omitted'
          ? [block.kind]
          : [block.kind, block.level ?? 1, block.list_parent ?? null, block.section],
      ),
      'the file says depth with `level`, nesting with `list_parent` by position, and names a Section only where the order would be wrong (#185, #219)',
    ).toEqual([
      ['section', 1, null, undefined],
      ['section', 2, null, undefined],
      ['paragraph', 1, null, undefined],
      ['bullet', 1, null, undefined],
      ['numbered', 1, 3, undefined],
      ['checklist', 1, 4, undefined],
      ['quote', 1, null, undefined],
      ['callout', 1, null, 0],
      ['code', 1, null, undefined],
      ['paragraph', 1, null, null],
    ])

    const madeId = await importWorkflowOk(reader, asFile(saved))
    expect(
      shapeOf(await pageRows(app.db, madeId)),
      'and every block arrives with its kind, its order, its heading and its list parent, read out of page_blocks (spec 4.17, 7.16)',
    ).toEqual(sourceShape)

    const made = await pageRows(app.db, madeId)
    expect(
      made.find((row) => row.kind === 'checklist')?.checked,
      'the tick is authored content and travels with the item (#219 R1 decision 3)',
    ).toBe(true)
  })
})
