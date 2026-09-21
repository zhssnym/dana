/*
AC-824: given a version 4 workflow file whose page claims something format 4
does not define — a block kind, a reference that resolves to nothing, or work
written twice — then the import answers 422 naming the field, and no folder is
created.

## "The file cannot silently claim structure the importer discards"

That is #185's acceptance, word for word, and it is the rule that separates
format 4 from the three before it. Versions 1 to 3 **drop** what they cannot
read, and rightly: a version 1 file declares nothing about a page, so a foreign
page item is a foreign arrangement and AC-201's rule applies — refusing would
make honest older exports unimportable. A version 4 file has said its reader
understands this page, so a kind it does not define is the file contradicting
itself, and dropping it would leave a person holding a file that looked
imported and was not.

## Seven shapes, and each one is a different way to claim too much

- **A kind nobody carries.** An `image` block written into a version 4 page is
  the one a hand-edited or third-party file is most likely to carry, since it
  is what the page it was copied from actually held. The placeholder is how a
  picture is said; an `image` block is a claim the import cannot honour.
- **A kind nobody has heard of**, which is the same refusal reached from the
  other side and is what stops the discriminator being widened by accident.
- **A page beside a collection.** A version 4 folder says everything in its
  page, so a `tasks` key next to one is work the import would not create.
- **A page beside a collection under its older name.** DES-206 calls that
  collection `items`, and a key nothing declares is *stripped* before any rule
  can see it — so this one imported 201 with the `items` silently gone, which is
  the behaviour the case above it exists to refuse, reached by spelling the key
  the way the older serialiser did. `items` is declared on the folder schema for
  this rule and for nothing else.
- **An index that resolves to nothing.** `list_parent: 9` in a two-block page is
  a nesting the file asserts and the import cannot build.
- **An index that resolves to something, in the wrong direction.** A page's
  ancestry is determined by what precedes a block, so a `list_parent` naming a
  bullet written *later* is a page no order can produce. It is the case that
  observes the bound: the out-of-range index above is refused by the same walk
  whether or not the ordering check is there, since a missing block is refused
  for being missing, and a forward reference is refused by the ordering check
  alone.
- **A Task nested under a list item**, which #219 says is not a thing. This one
  is the reason `pageTaskBlock` declares `list_parent` at all: an undeclared key
  is *stripped*, so without the declaration the file would import with the
  nesting silently gone, which is the single behaviour format 4 exists to end.

## No folder is created, and that is asserted rather than assumed

Every one of these is a body-level refusal, so the transaction never starts —
but "422" and "422 and nothing was written" are different claims and only the
second is worth anything. The folder count is read before and after each.

## The field path is this repository's own and not a server's prose

`sendValidationError` builds `folders.0.page.blocks.1.kind` out of the zod
issue's path, which is a path this codebase constructs. Nothing here asserts a
sentence a PostgreSQL server or a locale could rewrite, which is the rule
`tests/guards/guard-postgres-leg-isolation.test.ts` holds.

Spec: 7.16, 10.3, 7.0. Issue #185.
*/
import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast, countRows, expectStatus } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import { importWorkflow } from '../support/workflow-page-harness.js'

let app: AuthTestApp
const cast = new Cast(['importer'], 'ac824')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

function fileWith(folder: Record<string, unknown>): unknown {
  return {
    dana: 'workflow',
    version: 4,
    name: 'ac824 the impossible page',
    folders: [{ name: 'ac824 the impossible page', ...folder }],
  }
}

async function ownedFolders(importerId: string): Promise<number> {
  return countRows(
    app.db,
    sql`SELECT count(*)::int AS n FROM folders
         WHERE owner_id = ${importerId}::uuid AND deleted_at IS NULL`,
  )
}

describe('AC-824 a version 4 page cannot claim what the import discards', () => {
  test('seven claims, seven 422s naming the field, and nothing written', async () => {
    const [importer] = (await cast.of(app)) as [Actor]

    const cases: [string, unknown, string][] = [
      [
        'a media kind written as a block rather than as a placeholder',
        fileWith({
          page: {
            blocks: [
              { kind: 'section', text: 'ac824 the room' },
              { kind: 'image', file_id: randomUUID() },
            ],
          },
        }),
        'folders.0.page.blocks.1.kind',
      ],
      [
        'a kind format 4 has never heard of',
        fileWith({
          page: {
            blocks: [
              { kind: 'section', text: 'ac824 the room' },
              { kind: 'spreadsheet', text: 'ac824 the numbers' },
            ],
          },
        }),
        'folders.0.page.blocks.1.kind',
      ],
      [
        'work written twice, once on the page and once beside it',
        fileWith({
          page: { blocks: [{ kind: 'task', title: 'ac824 book the room' }] },
          tasks: [{ title: 'ac824 send the invite' }],
        }),
        'folders.0.tasks',
      ],
      /*
      The same claim as the case above it, spelled the way DES-206's serialiser
      spelled the key. Until 2026-09-21 this file imported **201** with the
      `items` dropped in silence: `items` was undeclared on the folder schema,
      `z.object` strips an undeclared key before any refinement sees it, and the
      normaliser deliberately leaves `items` alone beside a page rather than
      folding it into `blocks` and inventing the contradiction. The fix is a
      declaration whose entire purpose is to be refused here.
      */
      [
        'work written twice, the second time under DES-206’s name for it',
        fileWith({
          page: { blocks: [{ kind: 'task', title: 'ac824 book the room' }] },
          items: [{ kind: 'paragraph', paragraph: { text: 'ac824 read this first' } }],
        }),
        'folders.0.items',
      ],
      [
        'a list parent that is not in the file',
        fileWith({
          page: {
            blocks: [
              { kind: 'bullet', text: 'ac824 open the room' },
              { kind: 'bullet', text: 'ac824 unlock the cupboard', list_parent: 9 },
            ],
          },
        }),
        'folders.0.page.blocks.1.list_parent',
      ],
      /*
      A list parent the file does carry, named in the direction a page cannot
      be read in. This is the case that **observes** the ordering bound, and it
      is here because the case above it does not: take the `list_parent >= index`
      test out of `readWorkflowPage` and a `list_parent: 9` in a two-block page
      is still refused, for naming a block that is not there. A forward
      reference names a real bullet, of a kind that can be a parent, and is
      wrong only about the order — so that one test is the whole of what
      refuses it, and removing it lets the file through the schema and into
      `applyDocument`, which answers a rule about a page rather than this
      field.

      **The commit that wrote this criterion claimed the opposite and was
      wrong.** `7420056` said AC-824 went "red when the index bounds go"; it
      did not, and could not, for the reason above. Corrected here by making
      the claim true rather than by restating it.
      */
      [
        'a list parent written after the item that nests under it',
        fileWith({
          page: {
            blocks: [
              { kind: 'bullet', text: 'ac824 unlock the cupboard', list_parent: 2 },
              { kind: 'paragraph', text: 'ac824 read this first' },
              { kind: 'bullet', text: 'ac824 open the room' },
            ],
          },
        }),
        'folders.0.page.blocks.0.list_parent',
      ],
      /*
      A Task nested under a bullet, which #219 says is not a thing. It is the
      one claim in this list that would otherwise be **stripped rather than
      refused** — `z.object` drops a key no branch declares, and 11.14 rules
      that nothing in `shared/` becomes strict — so `pageTaskBlock` declares it
      as `z.never().optional()`, which is that ruling's own answer for a field
      an endpoint means to refuse.
      */
      [
        'a Task nested under a list item',
        fileWith({
          page: {
            blocks: [
              { kind: 'bullet', text: 'ac824 open the room' },
              { kind: 'task', title: 'ac824 book the room', list_parent: 0 },
            ],
          },
        }),
        'folders.0.page.blocks.1.list_parent',
      ],
    ]

    for (const [what, file, field] of cases) {
      const before = await ownedFolders(importer.id)
      const refused = await importWorkflow(importer, file)
      expectStatus(refused, 422, `${what}: the file is refused rather than trimmed (#185)`)
      expect(
        refused.body,
        `${what}: and the caller is told which field of which block, by a path this repository builds (7.0)`,
      ).toContain(field)
      expect(
        await ownedFolders(importer.id),
        `${what}: and no folder was created — the refusal is the body’s, before the transaction starts`,
      ).toBe(before)
    }
  })

  /*
  The other side of the same line, and it is what keeps the refusals above from
  being a regression. A version 1 file has declared no page, so `page` there is
  a foreign arrangement: dropped, exactly as a `labels` key below version 3 is
  dropped, and the file imports rather than being told it is wrong about a
  claim it never made. AC-201's rule, scoped by the version.
  */
  test('the same page in a version 1 file is a foreign arrangement and is dropped', async () => {
    const [importer] = (await cast.of(app)) as [Actor]
    const older = await importWorkflow(importer, {
      dana: 'workflow',
      version: 1,
      name: 'ac824 an older export',
      folders: [
        {
          name: 'ac824 an older export',
          page: { blocks: [{ kind: 'spreadsheet', text: 'ac824 the numbers' }] },
          tasks: [{ title: 'ac824 older work' }],
        },
      ],
    })
    expectStatus(
      older,
      201,
      'a version 1 file is read by version 1 rules: an arrangement it does not declare is dropped rather than refused (AC-201)',
    )
    const madeId = String(
      (older.json() as { folders: { id: string }[] }).folders[0]?.id,
    )
    expect(
      await countRows(
        app.db,
        sql`SELECT count(*)::int AS n FROM page_blocks WHERE folder_id = ${madeId}::uuid`,
      ),
      'and the page it carried creates nothing, the version gating the key exactly as it gates a vocabulary (#227, #185)',
    ).toBe(0)
    expect(
      await countRows(
        app.db,
        sql`SELECT count(*)::int AS n FROM tasks WHERE folder_id = ${madeId}::uuid`,
      ),
      'while the work the version does declare arrives as it always did',
    ).toBe(1)
  })
})
