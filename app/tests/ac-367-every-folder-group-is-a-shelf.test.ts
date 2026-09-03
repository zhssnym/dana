/*
AC-367: given a folder carrying a personal label, then that label names a
shelf the viewer can open — for a label written through 7.4 now, and for a
label that was already stored before shelves existed, which migration 0011
repairs.

**The defect this is written from (issue #65).** A shelf in the sidebar could
not be opened as its own page. Everything a session would look at first was
already there and correct: `GET /shelves/:id` and `GET /shelves/:id/page`
have been mounted since S5, the client has `/app/shelves/:id`, `ShelfPage`
and the query hooks, and the Library's heading is a `<Link>` — but only where
a shelves row backs the label, and plain text where none does. The thing that
was never there is the row. `folder_members.label` has existed since
0000_core_schema; `shelves` arrived empty in 0003_v2_expand and nothing has
ever filled it from the labels already stored, so every folder group an
account made before 7.16 shipped is a heading with no id, no page, no mark
and none of 9.10's acts.

That is a contract failure and not only a client one. 9.1 says the Library
"holds the viewer's shelves and folders as one ordered list" and that "a
shelf is a collapsible group of folder rows headed by its name", and its
roles table makes every shelf row a link; 4.18 says the membership of a shelf
*is* that label and that the API holds the two in step. A label with no shelf
satisfies none of those sentences.

**Two halves, because the fix has two.** The standing half is
`setMyMembership`, which now makes the shelf a label names if there is not
one, so the state cannot be reached again. The one-off half is migration
0011, and the second case below executes **that file's own SQL, read off
disk**, rather than a second copy of it written here: a data migration whose
test restates its statement proves the test, not the migration. It is
re-runnable by construction (ON CONFLICT DO NOTHING), which is what makes
reading it back safe.

Spec: 4.18, 4.4, 7.4, 7.16, 9.1, 9.10.
*/
import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast, createFolder, expectStatus } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import { rows } from './helpers.js'

let app: AuthTestApp
const cast = new Cast(['owner'])

/** The label the API writes, which must make its shelf as it is written. */
const WRITTEN = 'ac367 written label'
/** The label seeded straight into the column, as a pre-7.16 account holds it. */
const LEGACY = 'ac367 legacy label'

const MIGRATION = path.resolve(
  process.cwd(),
  'db',
  'migrations',
  '0011_shelves_for_every_group_label.sql',
)

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

interface ShelfLine {
  id: string
  name: string
}

async function shelvesOf(actor: Actor): Promise<ShelfLine[]> {
  const listed = await actor.browser.json('/shelves', 'GET')
  expectStatus(listed, 200, 'the viewer reads their shelves (spec 7.16)')
  return listed.json() as ShelfLine[]
}

describe('AC-367 every folder group is a shelf with a page', () => {
  test('AC-367: a label written through 7.4 names a shelf that opens', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const folderId = await createFolder(owner, 'ac367 written folder')

    const placed = await owner.browser.json(
      `/folders/${folderId}/my-membership`,
      'PATCH',
      { label: WRITTEN },
    )
    expectStatus(placed, 200, 'the folder takes the label (spec 7.4)')
    expect(
      (placed.json() as { my_label?: unknown }).my_label,
      'the membership carries the label the viewer wrote (spec 4.4)',
    ).toBe(WRITTEN)

    const shelf = (await shelvesOf(owner)).find((row) => row.name === WRITTEN)
    expect(
      shelf,
      'a label the Library draws as a group must name a shelf, so that the heading has ' +
        'an id to link to (spec 4.18, 9.1)',
    ).toBeDefined()

    const page = await owner.browser.json(`/shelves/${String(shelf?.id)}/page`, 'GET')
    expectStatus(
      page,
      200,
      'the shelf that label names has a page of its own, which is what pressing the ' +
        'heading opens (spec 9.10, 7.16)',
    )
  })

  test('AC-367: migration 0011 gives a label stored before 7.16 its shelf', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const folderId = await createFolder(owner, 'ac367 legacy folder')

    /* Straight into the column, which is the shape a pre-7.16 account is in:
       the label is stored and no shelves row names it. Written here rather
       than through 7.4 precisely because 7.4 now makes the shelf, so the
       endpoint can no longer produce the state this case repairs. */
    await app.db.execute(
      sql`UPDATE folder_members SET label = ${LEGACY}
          WHERE folder_id = ${folderId} AND user_id = ${owner.id}::uuid`,
    )

    expect(
      (await shelvesOf(owner)).map((row) => row.name),
      'the seeded state is the defect: a label the Library groups by, with no shelf ' +
        'behind it and therefore no page (issue #65)',
    ).not.toContain(LEGACY)

    const statement = await readFile(MIGRATION, 'utf8')
    expect(
      statement,
      'the case must be executing the shipped migration rather than a copy of it',
    ).toContain('INSERT INTO shelves')
    await app.db.execute(sql.raw(statement))

    const healed = (await shelvesOf(owner)).find((row) => row.name === LEGACY)
    expect(
      healed,
      'migration 0011 gives every stored label the shelf 4.18 says it is the membership ' +
        'of, so the group the Library already drew now has an id (issue #65)',
    ).toBeDefined()

    const page = await owner.browser.json(`/shelves/${String(healed?.id)}/page`, 'GET')
    expectStatus(page, 200, 'and that shelf opens as its own page (spec 9.10)')

    /* Re-running it is a no-op, which is what "forward only, and it will run
       against production the moment the merge deploys" makes worth proving:
       a second application must not double the rows or fail on the 4.18
       unique. */
    await app.db.execute(sql.raw(statement))
    const again = (await shelvesOf(owner)).filter((row) => row.name === LEGACY)
    expect(
      again.length,
      'the backfill is re-runnable and adds nothing the second time (spec 11.5)',
    ).toBe(1)
  })

  test('AC-367: the label side is untouched, and clearing it keeps the shelf', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const folders = await owner.browser.json('/folders', 'GET')
    expectStatus(folders, 200, 'the folder list reads (spec 7.4)')
    const labelled = (
      folders.json() as { id: string; my_label: string | null }[]
    ).filter((folder) => folder.my_label === WRITTEN || folder.my_label === LEGACY)
    expect(
      labelled.length,
      'making the shelf must not have moved, cleared or duplicated any membership ' +
        'label, which stays 4.4 and frozen',
    ).toBe(2)

    const target = labelled.find((folder) => folder.my_label === WRITTEN)
    const stored = await rows(
      app.db,
      sql`SELECT id FROM shelves WHERE user_id = ${owner.id}::uuid AND name = ${WRITTEN}`,
    )
    expect(stored.length, 'exactly one shelf carries that name (spec 4.18)').toBe(1)

    const cleared = await owner.browser.json(
      `/folders/${String(target?.id)}/my-membership`,
      'PATCH',
      { label: null },
    )
    expectStatus(cleared, 200, 'a label clears to null (spec 7.4)')
    expect(
      (await shelvesOf(owner)).map((row) => row.name),
      'a shelf outlives its folders (spec 9.1 since S17b), so taking the last folder ' +
        'off one empties it rather than deleting it',
    ).toContain(WRITTEN)
  })
})
