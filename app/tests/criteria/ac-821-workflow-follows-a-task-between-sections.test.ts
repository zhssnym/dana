/*
AC-821: given a Task moved from one Section to another, when the folder is
saved as a workflow file after the move, then the file carries the Task under
the Section it was moved to, and an import puts it there.

## Why this is a second criterion and not a second assertion in AC-820

AC-820 exports a page that was composed once. A writer that read a Task's
Section from anything stale — the detail it was handed rather than the page, a
cached placement, the order the Tasks happen to be listed in — would pass it
and fail this. #185's acceptance names the two separately for that reason: "move
a task from one Section to another before export; the imported workflow
preserves the new Section."

**Both exports are driven, and the first is what makes the second mean
anything.** The same folder is saved before the move and after it, and the two
files are asserted to differ in exactly that Task's placement. A criterion that
only exported after the move would be green against a writer that always said
"the second Section", which is the failure this shape rules out.

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
const cast = new Cast(['author', 'reader'], 'ac821')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

/** Which heading each Task sits under, as the file says it — read by walking
 * the page the way a reader does rather than by trusting a key. */
function placementsIn(blocks: readonly unknown[]): [string, string | null][] {
  const found: [string, string | null][] = []
  let open: string | null = null
  for (const entry of blocks) {
    const block = entry as { kind: string; text?: string; title?: string; section?: unknown }
    if (block.kind === 'section') {
      open = block.text ?? null
      continue
    }
    const named = 'section' in block ? block.section : undefined
    const under = named === undefined ? open : named === null ? null : 'by index'
    if (block.kind === 'task') found.push([block.title ?? '', under])
    if (named === null) open = null
  }
  return found
}

describe('AC-821 a move between Sections is what the file carries', () => {
  test('saved before and after the move, and the import follows the move', async () => {
    const [author, reader] = (await cast.of(app)) as [Actor, Actor]
    const sourceId = await createFolder(author, 'ac821 launch')

    const morning = randomUUID()
    const evening = randomUUID()
    const moving = randomUUID()
    const staying = randomUUID()

    await compose(
      author,
      sourceId,
      [
        put(morning, 'section', 'ac821 morning'),
        put(evening, 'section', 'ac821 evening'),
        { op: 'create_task', id: moving, title: 'ac821 book the room' },
        { op: 'create_task', id: staying, title: 'ac821 send the invite' },
        {
          op: 'set_outline',
          items: [
            at(morning),
            task(moving, morning),
            task(staying, morning),
            at(evening),
          ],
        },
      ],
      'the fixture page must compose (7.16)',
    )

    const first = await savedWorkflow(author, sourceId, 'ac821 launch')
    expect(
      placementsIn(first.file.folders[0]?.page?.blocks ?? []),
      'before the move, both Tasks are under the morning heading',
    ).toEqual([
      ['ac821 book the room', 'ac821 morning'],
      ['ac821 send the invite', 'ac821 morning'],
    ])

    /* The move, as the page performs it: one Task leaves one Section's
       contiguous run and joins another's. */
    await compose(
      author,
      sourceId,
      [
        {
          op: 'set_outline',
          items: [
            at(morning),
            task(staying, morning),
            at(evening),
            task(moving, evening),
          ],
        },
      ],
      'the move must save (7.16)',
    )

    const moved = await savedWorkflow(author, sourceId, 'ac821 launch')
    expect(
      placementsIn(moved.file.folders[0]?.page?.blocks ?? []),
      'after the move, the file says the moved Task is under the evening heading: the writer reads the page rather than anything it was handed earlier (#185)',
    ).toEqual([
      ['ac821 send the invite', 'ac821 morning'],
      ['ac821 book the room', 'ac821 evening'],
    ])

    const madeId = await importWorkflowOk(reader, asFile(moved))
    expect(
      shapeOf(await pageRows(app.db, madeId)),
      'and the import puts it there, read off tasks.section_block_id (spec 7.16, 4.17)',
    ).toEqual([
      { kind: 'section', text: 'ac821 morning', under: null, nested_under: null },
      { kind: 'task', text: 'ac821 send the invite', under: 'ac821 morning', nested_under: null },
      { kind: 'section', text: 'ac821 evening', under: null, nested_under: null },
      { kind: 'task', text: 'ac821 book the room', under: 'ac821 evening', nested_under: null },
    ])
  })
})
