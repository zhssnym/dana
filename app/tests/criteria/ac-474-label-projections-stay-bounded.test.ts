/*
AC-474 and AC-479: the Label projections stay bounded-query, and the Shelf
rename changed nothing but the word (issue #226, parent #208).

## AC-474 measures statements, not seconds

#226 asks for this by name — "avoid N+1 reads across list/view endpoints,
extend the existing batch assembly so all Task lists remain bounded-query
operations" — and the only honest way to check it is to count the statements
a read issues and show that the count does not move with the number of rows.
A timing assertion would be a flake, and an assertion that "the batch function
was called" would pass a batch function called once per row.

So this drives the real view functions through a recording executor, twice,
against a folder holding **three** tasks and then against one holding
**twenty-four**, and asserts the two runs issue the same number of statements.
That is the shape `src/server/domain/cap-guards.test.ts` uses for the caps and
for the same reason: the property is about the statements a path issues, and
no run of the suite can see it from the outside.

**Why the view functions rather than the HTTP endpoints.** The mounted
application reaches its database through a client this file cannot wrap
without reaching inside it, and what is under test is the seam in
`views/cards.ts` rather than the route that calls it. `views.test.ts` beside
the router is what proves the endpoints answer through these functions.

## AC-479 is the rename's whole risk

`folder_members.label` became `shelf_name` and the Folder object's membership
key became `my_shelf`, across the database, the shared contract, the server and
the client. #226 is explicit that this is terminology cleanup and that Shelf
semantics must not change. The way a rename like this goes wrong is not a
compile error — the compiler catches those — it is one of the three places
that hold membership and shelf name **in step** being missed, because each is
a separate UPDATE in a different file. So this walks all three: a membership
written through 7.4 makes the shelf, a shelf rename rewrites the memberships,
and a shelf delete clears them.

**The second case moved twice with issue #247, and this is the second move.**
The database side shipped as expand and contract: migration 0022 added
`shelf_name` beside `label`, and until #247 this case asserted that the two
**agreed** after each write path, saying in terms that when the contract half
landed it would become the assertion one column is left. That half is two
releases rather than one, which is what 11.5 asks for: the first stopped every
write to `label` and left the column standing, and this case asserted for that
release that `shelf_name` took every write while `label` was never touched.
This is the second, and it is the form the original text named. The decision
being pinned — where the membership lives — is what moved, and it moved across
#247's two releases rather than in this file.

Spec: 4.4, 4.18, 6.1, 7.4, 7.10, 7.16. Issue #226, #247, #208 R9.
*/
import { sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { listFolders } from '../../src/server/domain/folders.js'
import type { Executor } from '../../src/server/database.js'
import { folderOpenView } from '../../src/server/views/index.js'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { expectRejectedWith } from '../support/helpers.js'
import {
  Cast,
  createFolder,
  expectStatus,
  seedTask,
} from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import {
  createFolderLabel,
  createPersonalLabel,
  putFolderLabel,
  putTaskLabel,
} from '../support/labels-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner'], 'ac474')

async function owner(): Promise<Actor> {
  const [actor] = await cast.of(app)
  if (actor === undefined) throw new Error('the cast must produce one actor')
  return actor
}

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

/* ------------------------------------------------------------------ *
 * The recorder
 * ------------------------------------------------------------------ */

/**
 * A Db that counts what it is asked to run and then runs it.
 *
 * The domain and view modules reach their database through two methods, so
 * wrapping those two is the whole surface; this is `cap-guards.test.ts`'s
 * recorder with the rendering dropped, because what this file needs is the
 * count rather than the text.
 */
function counting(real: unknown, log: string[]): never | { execute: Executor['execute'] } {
  const wrap = (target: Executor): Executor => ({
    execute: async (statement: SQL) => {
      log.push('statement')
      return target.execute(statement)
    },
  })
  const transactional = real as {
    transaction?: <T>(run: (tx: Executor) => Promise<T>) => Promise<T>
  }
  return {
    execute: wrap(real as Executor).execute,
    ...(transactional.transaction === undefined
      ? {}
      : {
          transaction: async <T>(run: (tx: Executor) => Promise<T>): Promise<T> =>
            (transactional.transaction as NonNullable<typeof transactional.transaction>)(
              (tx) => run(wrap(tx)),
            ),
        }),
  } as never
}

describe('AC-474 a Label projection costs statements, not statements per row', () => {
  test('AC-474: a folder read issues the same number of statements for 3 tasks and for 24', async () => {
    const actor = await owner()

    /** Builds a folder of `count` labelled tasks and returns the statements
     * the folder read issues over it. */
    const statementsFor = async (count: number): Promise<number> => {
      const folderId = await createFolder(actor, `ac474 folder of ${String(count)}`)
      const shared = await createFolderLabel(actor, folderId, {
        name: `ac474 shared ${String(count)}`,
      })
      const mine = await createPersonalLabel(actor, {
        name: `ac474 mine ${String(count)}`,
      })
      for (let n = 0; n < count; n += 1) {
        const taskId = await seedTask(app.db, {
          folderId,
          createdBy: actor.id,
          title: `ac474 task ${String(n)}`,
        })
        /* Every task carries one of each kind, so the projection has real
           work to do on every row. A run over unlabelled tasks would be
           bounded by accident. */
        expectStatus(
          await putTaskLabel(actor, taskId, shared.id),
          200,
          'the folder label goes on',
        )
        expectStatus(
          await putTaskLabel(actor, taskId, mine.id),
          200,
          'and the personal one',
        )
      }

      const log: string[] = []
      const answer = await folderOpenView(
        counting(app.db, log) as unknown as Executor,
        actor.id,
        folderId,
      )
      expect(
        answer.unscheduled.length,
        `the read must actually return the ${String(count)} tasks, or the count below is measuring an empty page`,
      ).toBe(count)
      expect(
        answer.unscheduled.every((card) => card.labels.folder.length === 1),
        'and every card must carry its labels, or the batch was skipped rather than bounded',
      ).toBe(true)
      return log.length
    }

    const small = await statementsFor(3)
    const large = await statementsFor(24)

    expect(
      large,
      `the folder read issued ${String(small)} statements over 3 tasks and ${String(large)} over 24. Equality is the property #226 asks for: the Label projection is one extra batched statement whatever the row count, and an N+1 would show here as a difference of about twenty-one. If this is red, the likely cause is a per-row read added inside cardFromRow or taskView`,
    ).toBe(small)
  })

  test('AC-474: the folder list is bounded the same way', async () => {
    const actor = await owner()
    const mine = await createPersonalLabel(actor, { name: 'ac474 across folders' })

    const statements = async (): Promise<number> => {
      const log: string[] = []
      const answer = await listFolders(
        counting(app.db, log) as never,
        actor.id,
      )
      expect(
        answer.length,
        'the list must return folders, or the count is measuring nothing',
      ).toBeGreaterThan(0)
      return log.length
    }

    const before = await statements()
    /* Six more folders, each carrying the viewer's Personal Label, so the
       second run has six more rows and six more projections to assemble. */
    for (let n = 0; n < 6; n += 1) {
      const folderId = await createFolder(actor, `ac474 listed ${String(n)}`)
      expectStatus(
        await putFolderLabel(actor, folderId, mine.id),
        200,
        'each new folder wears the label',
      )
    }
    const after = await statements()

    expect(
      after,
      `GET /folders issued ${String(before)} statements and then ${String(after)} with six more labelled folders. The Personal-Label projection is one batched statement over every folder the first query returned, so the number does not move`,
    ).toBe(before)
  })
})

/* ------------------------------------------------------------------ *
 * AC-479
 * ------------------------------------------------------------------ */

describe('AC-479 the Shelf rename moved the word and nothing else', () => {
  test('AC-479: all three directions still hold membership and shelf name in step', async () => {
    const actor = await owner()
    const folderId = await createFolder(actor, 'ac479 shelved')

    /* Direction one: a membership written through 7.4 makes the shelf if
       there is not one (issue #65). The field is `shelf` now and was `label`;
       what must not have changed is that the shelves row appears. */
    const placed = await actor.browser.json(
      `/folders/${folderId}/my-membership`,
      'PATCH',
      { shelf: 'ac479 Studio', color: '#AA33BB' },
    )
    expectStatus(placed, 200, 'the membership write answers the Folder object')
    const body = placed.json() as { my_shelf: string | null; my_color: string | null }
    expect(
      body.my_shelf,
      'the Folder object reports the membership under its new key, and it is the value that was sent',
    ).toBe('ac479 Studio')
    expect(body.my_color, 'and the colour beside it is untouched by any of this').toBe(
      '#AA33BB',
    )

    const shelves = await actor.browser.api('/shelves')
    expectStatus(shelves, 200, 'the shelves list answers')
    const made = (shelves.json() as { id: string; name: string }[]).find(
      (shelf) => shelf.name === 'ac479 Studio',
    )
    expect(
      made,
      '4.18: the API holds membership and shelf name in step in one transaction, so writing the membership made the shelf. This is the direction issue #65 added and the one a rename is most likely to drop, because it is an INSERT in a different file from the UPDATE',
    ).toBeDefined()

    /* Direction two: renaming the shelf rewrites the viewer's memberships. */
    const renamed = await actor.browser.json(
      `/shelves/${made?.id ?? ''}`,
      'PATCH',
      { name: 'ac479 Atelier' },
    )
    expectStatus(renamed, 200, 'the shelf renames')
    expect(
      await myShelf(actor, folderId),
      '4.18 again, the direction that has always existed: the folder follows its shelf',
    ).toBe('ac479 Atelier')

    /* Direction three: deleting the shelf clears them, and the folder
       survives, which is 9.1's "a shelf outlives its folders" read the other
       way round. */
    const removed = await actor.browser.api(`/shelves/${made?.id ?? ''}`, {
      method: 'DELETE',
    })
    expect(
      removed.status,
      'the shelf deletes',
    ).toBe(204)
    expect(
      await myShelf(actor, folderId),
      'and the folder is off it rather than gone with it',
    ).toBeNull()
  })

  test('AC-479: one membership column is left, on every write path, and nothing answers to the old name', async () => {
    /*
    **The contract half's second release, asserted as such (issue #247).**

    Until #247 this case read "both membership columns exist and agree", and
    said in terms that when the contract half landed it would become "one
    column, and nothing answering to the old name". This is that, and it
    arrives one release after the code it belongs to. The decision it pins is
    **where the membership lives**, and that decision moved with #247 rather
    than with any edit made to keep a test green.

    The order is 11.5's and both halves of it are the same argument. Migration
    0022 added `shelf_name` beside `label` and backfilled it rather than
    renaming, because Render waits for the new instance to pass health checks
    before draining the old one and a rename would have left the old instance
    selecting a column that no longer exists for the length of a deploy —
    `GET /folders`, the sidebar and every folder page. Migration 0026 drops
    `label` and `folder_members_label_length_check`, and it waits for #247's
    first release for the mirror of that reason: the old instance there is one
    that still *writes* `label`, and a drop shipped beside the code would have
    answered 500 to every shelf write across the same window. This case's
    previous form — one column written, the retired one never touched — is
    what proved that first release had actually stopped the writes.

    Two halves, and they fail differently. The column read says the three
    write paths still hold membership and shelf name in step now that there is
    one column to hold it in; the refusal says the old name is gone from the
    table rather than merely gone from the code, which is the only thing that
    distinguishes a dropped column from a column nobody writes.
    */
    const actor = await owner()
    const folderId = await createFolder(actor, 'ac479 column')

    /** The viewer's own membership row, straight from the table. The wire
     * never showed this column under any name, so only a read of the row can
     * say which write paths reached it. */
    const membership = async (): Promise<{ shelf_name: string | null }> => {
      const found = (await app.db.execute(
        sql`SELECT shelf_name FROM folder_members
            WHERE folder_id = ${folderId}::uuid
              AND user_id = ${actor.id}::uuid`,
      )) as unknown as { rows: { shelf_name: string | null }[] }
      const row = found.rows[0]
      expect(row, 'the membership row must exist').toBeDefined()
      return row as { shelf_name: string | null }
    }

    /* The baseline, before any write path has run. Without it every
       assertion below is consistent with a shelf that was already there, and
       the case would no longer prove the PATCH is what wrote it. It read
       `{ shelf_name: null, label: null }` while both columns stood; migration
       0026 narrowed it to the surviving column rather than retiring it. */
    expect(
      await membership(),
      'the membership a new folder creates leaves the shelf unset, so each write below is the write path under test and not a value that was already in the row',
    ).toEqual({ shelf_name: null })

    // Path one: the membership write of 7.4.
    expectStatus(
      await actor.browser.json(`/folders/${folderId}/my-membership`, 'PATCH', {
        shelf: 'ac479 Bench',
      }),
      200,
      'placed on a shelf',
    )
    expect(
      await membership(),
      'the value written through the renamed request field lands in shelf_name, which is now the only column it can land in',
    ).toEqual({ shelf_name: 'ac479 Bench' })

    // Path two: the shelf rename, which rewrites the viewer's memberships.
    const shelves = await actor.browser.api('/shelves')
    expectStatus(shelves, 200, 'the shelves list answers')
    const bench = (shelves.json() as { id: string; name: string }[]).find(
      (shelf) => shelf.name === 'ac479 Bench',
    )
    expect(bench, 'the membership write made the shelf (4.18)').toBeDefined()
    expectStatus(
      await actor.browser.json(`/shelves/${bench?.id ?? ''}`, 'PATCH', {
        name: 'ac479 Workbench',
      }),
      200,
      'the shelf renames',
    )
    expect(
      await membership(),
      'and the rename moved the surviving column, which is the one the predicate reads',
    ).toEqual({ shelf_name: 'ac479 Workbench' })

    // Path three: the shelf delete, which clears them.
    expect(
      (await actor.browser.api(`/shelves/${bench?.id ?? ''}`, { method: 'DELETE' }))
        .status,
      'the shelf deletes',
    ).toBe(204)
    expect(
      await membership(),
      'and cleared it, so no column is left holding a shelf that is gone',
    ).toEqual({ shelf_name: null })

    /* Back on a shelf, so this case ends on a written row rather than a
       cleared one. */
    expectStatus(
      await actor.browser.json(`/folders/${folderId}/my-membership`, 'PATCH', {
        shelf: 'ac479 Bench',
      }),
      200,
      'placed again',
    )
    expect(
      await membership(),
      'and the third write path reaches the surviving column too',
    ).toEqual({ shelf_name: 'ac479 Bench' })

    /*
    And the old name is gone from the table.

    **Two reads rather than one, because each is weak alone.** The catalog
    read says the column is absent and could pass over a table that never had
    it; the statement says the server refuses the name and would pass over a
    typo. Together they say the drop happened here.

    SQLSTATE rather than the message: the databases this leg creates answer in
    the cluster's language, and `tests/guards/guard-postgres-leg-isolation.test.ts`
    fails by name any file that reads server prose. 42703 is undefined_column
    on both engines the suite runs on.
    */
    const columns = (await app.db.execute(
      sql`SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'folder_members'
            AND column_name IN ('shelf_name', 'label')
          ORDER BY column_name`,
    )) as unknown as { rows: { column_name: string }[] }
    expect(
      columns.rows.map((row) => row.column_name),
      'folder_members carries the membership under one name, and `label` is not it. Migration 0026 dropped that column; a catalog still holding it would mean this migration never ran, which is what a journal `when` lower than an already-applied one does — silently, permanently, and with nothing else in the suite to say so',
    ).toEqual(['shelf_name'])

    await expectRejectedWith(
      () => app.db.execute(sql`SELECT label FROM folder_members LIMIT 1`),
      { code: '42703' },
    )
  })
})

/** The viewer's Shelf membership on one folder, read from the folder list. */
async function myShelf(actor: Actor, folderId: string): Promise<string | null> {
  const answer = await actor.browser.api('/folders')
  expectStatus(answer, 200, 'GET /folders answers the list')
  const row = (answer.json() as { id: string; my_shelf: string | null }[]).find(
    (candidate) => candidate.id === folderId,
  )
  expect(row, `the folder list must carry ${folderId}`).toBeDefined()
  return row?.my_shelf ?? null
}
