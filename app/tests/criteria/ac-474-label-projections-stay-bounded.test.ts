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

`folder_members.label` became `shelf_name` and `Folder.my_label` became
`my_shelf`, across the database, the shared contract, the server and the
client. #226 is explicit that this is terminology cleanup and that Shelf
semantics must not change. The way a rename like this goes wrong is not a
compile error — the compiler catches those — it is one of the three places
that hold membership and shelf name **in step** being missed, because each is
a separate UPDATE in a different file. So this walks all three: a membership
written through 7.4 makes the shelf, a shelf rename rewrites the memberships,
and a shelf delete clears them.

Spec: 4.4, 4.18, 6.1, 7.4, 7.10, 7.16. Issue #226, #208 R9.
*/
import { sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { listFolders } from '../../src/server/domain/folders.js'
import type { Executor } from '../../src/server/database.js'
import { folderOpenView } from '../../src/server/views/index.js'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
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

  test('AC-479: both membership columns exist and agree, on every write path', async () => {
    /*
    **The expand half of an expand-and-contract pair, asserted as such.**
    Migration 0022 adds `shelf_name` beside `label` and backfills it; it does
    not rename, because Render waits for the new instance to pass health
    checks before draining the old one, so a rename would leave the old
    instance selecting a column that no longer exists for the length of a
    deploy — `GET /folders`, the sidebar and every folder page.

    So for this release the application reads `shelf_name` and **writes
    both**, and what this case asserts is that the two agree after each of the
    three write paths rather than that the old column is gone. Issue #247 is
    the contract half, and when it lands this case becomes the assertion the
    obvious reading expects: one column, and nothing answering to the old
    name. The decision it pins is "where the membership lives", and that
    decision moves in #247 rather than here.
    */
    const actor = await owner()
    const folderId = await createFolder(actor, 'ac479 column')

    /** Both columns of the viewer's own membership row, straight from the
     * table: the wire cannot see `label` at all, so only a read of the row
     * can say whether the second write happened. */
    const columns = async (): Promise<{
      shelf_name: string | null
      label: string | null
    }> => {
      const found = (await app.db.execute(
        sql`SELECT shelf_name, label FROM folder_members
            WHERE folder_id = ${folderId}::uuid
              AND user_id = ${actor.id}::uuid`,
      )) as unknown as {
        rows: { shelf_name: string | null; label: string | null }[]
      }
      const row = found.rows[0]
      expect(row, 'the membership row must exist').toBeDefined()
      return row as { shelf_name: string | null; label: string | null }
    }

    // Path one: the membership write of 7.4.
    expectStatus(
      await actor.browser.json(`/folders/${folderId}/my-membership`, 'PATCH', {
        shelf: 'ac479 Bench',
      }),
      200,
      'placed on a shelf',
    )
    expect(
      await columns(),
      'the value written through the renamed request field lands in shelf_name, and in label beside it so that an instance Render has not drained yet still reads current data',
    ).toEqual({ shelf_name: 'ac479 Bench', label: 'ac479 Bench' })

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
      await columns(),
      'and the rename moved both columns, not just the one the predicate reads',
    ).toEqual({ shelf_name: 'ac479 Workbench', label: 'ac479 Workbench' })

    // Path three: the shelf delete, which clears them.
    expect(
      (await actor.browser.api(`/shelves/${bench?.id ?? ''}`, { method: 'DELETE' }))
        .status,
      'the shelf deletes',
    ).toBe(204)
    expect(
      await columns(),
      'and cleared both, so neither column is left holding a shelf that is gone',
    ).toEqual({ shelf_name: null, label: null })

    // Back on a shelf, so the unknown-key case below has a value to not change.
    expectStatus(
      await actor.browser.json(`/folders/${folderId}/my-membership`, 'PATCH', {
        shelf: 'ac479 Bench',
      }),
      200,
      'placed again',
    )

    /* And the old request field is now an unknown key, which 7.0 tolerates by
       stripping — so it writes nothing rather than writing the wrong column.
       Asserted because a rename that left both names working would be a
       second way to write one column, which is the thing the rename was for. */
    expectStatus(
      await actor.browser.json(`/folders/${folderId}/my-membership`, 'PATCH', {
        label: 'ac479 Ignored',
      }),
      200,
      '7.0 tolerates an unknown key rather than refusing it (11.14)',
    )
    expect(
      await myShelf(actor, folderId),
      'and the stripped key changed nothing, which is what "tolerated" has to mean here',
    ).toBe('ac479 Bench')
    expect(
      await columns(),
      'and neither column moved, which is the assertion that matters while both are there: a stripped key that happened to reach the old column would leave the two disagreeing, and nothing on the wire could see it',
    ).toEqual({ shelf_name: 'ac479 Bench', label: 'ac479 Bench' })
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
