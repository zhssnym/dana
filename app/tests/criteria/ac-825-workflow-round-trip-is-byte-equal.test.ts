/*
AC-825: given the exact file "Save as workflow" writes from a composed folder
page, when it is imported and the imported folder is saved again, then the
second file is byte for byte the first less its placeholders — and saving that
one again is byte for byte itself, however many times round.

## The one thing that does not come back, and why that is the contract

A placeholder is a **record of loss** rather than content. It says "a picture
was here and is not in this file", it creates nothing on the way in, and the
page it makes therefore has no picture for the next save to record. A file
whose placeholders round tripped would be a file claiming to still carry a
picture that no longer exists anywhere in it, which is the opposite of what the
placeholder is for. So the equality is stated exactly: the second file is the
first with the placeholders taken out and every index that pointed past one
moved down, re-derived in this file from the format alone, and the chain is a
fixpoint from the second file onward.

## What byte equality catches, and what it does not — measured, not assumed

**It catches every way the writer and the reader can disagree.** A relation the
file says and the import does not build, or builds differently, shows up as a
diff on the second save. Format 4 makes that available for the first time: a
file with no ids and no timestamps in it has nothing that is *allowed* to differ
between two accounts, so "modulo ids and timestamps" is modulo nothing at all.

**It does not catch a loss the two halves agree about, and that was measured
rather than reasoned.** Writing this criterion, the exporter was mutated to stop
emitting `rich_content` at all: the imported page lost every bold run and this
file stayed **green**, because a consistently lossy writer round trips
perfectly. The same held for list nesting. So a symmetric loss needs an
assertion against the *source*, which is what AC-822 is for the structure and
what the last two assertions here are for rich content — and the note is left in
this header rather than in a commit message, because the next person to reach
for byte equality as a catch-all should know what it is blind to.

What it does catch that nothing else here would: any asymmetry, anywhere in a
file this large, including in keys nobody thought to name.

## What is in the fixture, and why each thing is there

One heading inside another, so `level` travels. A list nested two deep inside
the inner heading, so both parents travel at once. A ticked checklist item, a
quote and a code block, so #219's kinds travel. A paragraph carrying rich
content, so the run vocabulary travels and its text projection still matches. A
picture, so a placeholder travels. Two Tasks — one with notes, a star, a
repeat, a reminder, steps and a Folder Label, one with nothing — so 7.16's
whole keep-set travels. And a paragraph at the page root after both headings,
so the `section` escape travels.

Anything that failed to round trip would show up as a diff in one of those
lines, and the failure message prints both files.

## Read in the second account, which is the case that matters

The second save is made by the importer, through the same three endpoints the
folder page reads, so what is compared is two files written by the same code
from two different accounts' rows.

Spec: 7.16, 4.17. Issue #185.
*/
import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { rows } from '../support/helpers.js'
import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast, createFolder, expectStatus } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import { createFolderLabel, putTaskLabel } from '../support/labels-harness.js'
import { createTaskOk } from '../support/tasks-harness.js'
import { uploadImageOk } from '../support/uploads-harness.js'
import type { ImportWorkflowBody } from '../../src/shared/workflows.js'
import {
  asFile,
  at,
  compose,
  importWorkflowOk,
  put,
  savedWorkflow,
  task,
} from '../support/workflow-page-harness.js'

let app: AuthTestApp
const cast = new Cast(['author', 'reader'], 'ac825')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

const NAME = 'ac825 the whole page'

describe('AC-825 export, import, export again, and the bytes are the same', () => {
  test('a page holding every kind that travels round trips exactly', async () => {
    const [author, reader] = (await cast.of(app)) as [Actor, Actor]
    const sourceId = await createFolder(author, NAME)
    const picture = await uploadImageOk(author, sourceId, 'ac825-room.png')

    const urgent = await createFolderLabel(author, sourceId, {
      name: 'ac825 urgent',
      color: '#AA1122',
      description: 'before the rest',
    })
    /* A category nothing wears: the half a vocabulary read off the Tasks
       would lose, and it has to survive both halves of this trip. */
    await createFolderLabel(author, sourceId, { name: 'ac825 someday' })

    const heavy = await createTaskOk(
      author,
      {
        title: 'ac825 book the room',
        folder_id: sourceId,
        notes: 'ac825 ask for the big one',
        important: true,
        /* 4.5 admits no repeat without a date, so the fixture has one. It is
           deliberately not in the file: 7.16 carries no date, the import
           anchors on the import day, and the second save writes no date
           either — which is why this criterion can demand byte equality at
           all. */
        due_date: '2027-03-01',
        recurrence_rule: 'FREQ=WEEKLY;BYDAY=MO',
      },
      'the fixture task must stage (spec 7.6)',
    )
    const plain = await createTaskOk(
      author,
      { title: 'ac825 send the invite', folder_id: sourceId },
      'the second fixture task must stage (spec 7.6)',
    )
    expectStatus(
      await author.browser.json(`/tasks/${heavy.id}/steps`, 'POST', {
        title: 'ac825 check the calendar',
      }),
      201,
      'the first step must stage (spec 7.7)',
    )
    expectStatus(
      await author.browser.json(`/tasks/${heavy.id}/steps`, 'POST', {
        title: 'ac825 send the note',
      }),
      201,
      'the second step must stage (spec 7.7)',
    )
    expectStatus(
      await author.browser.json(`/tasks/${heavy.id}/reminder`, 'PUT', {
        time_of_day: '08:30',
      }),
      200,
      'the reminder must stage (spec 7.9)',
    )
    expectStatus(
      await putTaskLabel(author, heavy.id, urgent.id),
      200,
      'the label must attach (spec 7.26)',
    )

    const outer = randomUUID()
    const inner = randomUUID()
    const rich = randomUUID()
    const bullet = randomUUID()
    const nested = randomUUID()
    const ticked = randomUUID()
    const quote = randomUUID()
    const code = randomUUID()
    const image = randomUUID()
    const tail = randomUUID()

    await compose(
      author,
      sourceId,
      [
        put(outer, 'section', 'ac825 the handbook'),
        put(inner, 'section', 'ac825 the morning'),
        put(rich, 'paragraph', 'ac825 read this first', {
          rich_content: {
            version: 1,
            runs: [
              { text: 'ac825 read ', bold: true },
              { text: 'this first' },
            ],
          },
        }),
        put(bullet, 'bullet', 'ac825 open the room'),
        put(nested, 'numbered', 'ac825 unlock the cupboard'),
        put(ticked, 'checklist', 'ac825 count the chairs', { checked: true }),
        put(quote, 'quote', 'ac825 nothing is ever finished'),
        put(code, 'code', 'ac825 npm run gate'),
        put(image, 'image', 'ac825 the big table', { file_id: picture, width_pct: 50 }),
        put(tail, 'paragraph', 'ac825 and afterwards'),
        {
          op: 'set_outline',
          items: [
            at(outer),
            at(inner, outer),
            at(rich, inner),
            at(bullet, inner),
            at(nested, inner, bullet),
            at(ticked, inner, nested),
            task(heavy.id, inner),
            at(quote, outer),
            at(image, outer),
            at(code, outer),
            task(plain.id, outer),
            /* The page root after both headings, which is the `section`
               escape. */
            at(tail),
          ],
        },
      ],
      'the fixture page must compose through the document transaction (7.16)',
    )

    const first = await savedWorkflow(author, sourceId, NAME)
    expect(
      first.omitted,
      'the fixture must actually carry a picture, or the placeholder half of this trip proves nothing',
    ).toBe(1)

    const madeId = await importWorkflowOk(reader, asFile(first))
    const second = await savedWorkflow(reader, madeId, NAME)

    expect(
      JSON.stringify(second.file, null, 2),
      'the file the importing account writes back is the file it was given, byte for byte, less the one thing that is a record of loss rather than content: format 4 carries no id and no timestamp, so nothing else in it is allowed to differ between two accounts (7.16)',
    ).toBe(JSON.stringify(withoutPlaceholders(first.file), null, 2))
    expect(
      second.omitted,
      'and the second save omits nothing, because the first one already did: a placeholder imports as nothing, so there is no picture left for it to drop',
    ).toBe(0)

    /*
    The one loss byte equality is blind to, asserted against the source instead.

    A writer that stopped emitting `rich_content` would leave both files
    agreeing perfectly and every bold run gone from the product — measured, not
    supposed, while this criterion was written. So the imported rows are read
    and compared with the source's.
    */
    const runsOf = async (folderId: string): Promise<unknown> => {
      const found = await rows(
        app.db,
        sql`SELECT rich_content FROM page_blocks
             WHERE folder_id = ${folderId}::uuid AND rich_content IS NOT NULL
             ORDER BY page_position`,
      )
      return found.map((row) => row.rich_content)
    }
    expect(
      await runsOf(madeId),
      'rich content travels and arrives whole, its runs and its text projection intact: a file that dropped it would round trip perfectly and lose every bold word in the product (4.17)',
    ).toEqual(await runsOf(sourceId))
    expect(
      (await runsOf(madeId)) as unknown[],
      'and the fixture must actually carry some, or the line above compares two empty lists',
    ).toHaveLength(1)

    /* And the fixpoint, which is #185's acceptance in its own words — export,
       import, export, byte-equal. It holds from the second file on, the first
       being the only one in the chain written from a page that had a picture
       on it. */
    const againId = await importWorkflowOk(reader, asFile(second))
    const third = await savedWorkflow(reader, againId, NAME)
    expect(
      JSON.stringify(third.file, null, 2),
      'a file with no placeholders left in it is a fixpoint: import it and save it and you have the same bytes, however many times round',
    ).toBe(JSON.stringify(second.file, null, 2))
  })
})

/*
The first file as it *would* have been written from a page with no picture on
it: the placeholders gone, and every index that pointed past one moved down to
follow.

**Re-derived here rather than taken from the writer**, which is the whole value
of it. If this walked the same code `folderToWorkflowFile` walks, the assertion
above would compare an implementation with itself; twelve lines that know only
the format are what make it a check. Spreading over the block keeps each key
where it was, so the comparison stays byte-for-byte rather than merely deep.
*/
function withoutPlaceholders(file: ImportWorkflowBody): ImportWorkflowBody {
  const folder = file.folders[0] as NonNullable<ImportWorkflowBody['folders'][0]>
  const blocks = folder.page?.blocks ?? []
  const kept: [(typeof blocks)[number], number][] = blocks
    .map((block, index): [(typeof blocks)[number], number] => [block, index])
    .filter(([block]) => block.kind !== 'omitted')
  const movedTo = new Map(kept.map(([, was], now) => [was, now]))
  return {
    ...file,
    folders: [
      {
        ...folder,
        page: {
          blocks: kept.map(([block]) => {
            const moved = (at: number): number => movedTo.get(at) as number
            /* Filtered out above; the branch is here because the union still
               carries it and a cast would be a way to be wrong quietly. */
            if (block.kind === 'omitted') return block
            if (block.kind === 'task') {
              return typeof block.section === 'number'
                ? { ...block, section: moved(block.section) }
                : block
            }
            return {
              ...block,
              ...(typeof block.section === 'number'
                ? { section: moved(block.section) }
                : {}),
              ...(typeof block.list_parent === 'number'
                ? { list_parent: moved(block.list_parent) }
                : {}),
            }
          }),
        },
      },
    ],
  }
}
