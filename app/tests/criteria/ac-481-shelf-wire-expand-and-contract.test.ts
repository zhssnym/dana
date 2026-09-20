/*
AC-481: the Shelf wire rename is expand-and-contract, so a browser tab that
outlives a deploy still writes (issue #226, ruling of 2026-09-20; #247 is the
contract half).

## What this is for, which is not what AC-479 is for

AC-479 asks whether the terminology move changed Shelf *semantics* — three
directions of 4.18 still holding membership and shelf name in step. This asks
whether the move can be **deployed** without losing somebody's edit, which is a
different question about the same rename and has a different failure mode.

Dana is one deployable serving the SPA and the API together, and 11.11 has
Render bring the new instance up and pass its health checks before draining the
old one. The column underneath is already expand-and-contract for that reason:
migration 0022 adds `shelf_name` beside `label` rather than renaming, because a
rename would leave the old instance selecting a column that is gone for the
length of a deploy.

**The wire has the same hazard and a worse failure mode, unbounded by the
deploy window.** A browser tab open across a deploy keeps its old bundle and
goes on calling the new API, and a tab lives as long as somebody leaves it
open. The read half is cosmetic and self-heals on reload. The write half does
not. `patchFolderMyMembershipBody` is a `z.object`, and 7.0 tolerates unknown
keys while 11.14 rules that no schema in `app/src/shared/` becomes strict — so
a stale tab's **`label`** would be *stripped*, `shelf` would then be absent,
`setMyMembership` would read that as "not provided", and the request would
answer **200 having stored nothing**. The person renames their shelf, sees it
accepted, and loses the edit. That is hard stop 3's failure mode exactly, and
it is the class `app/src/shared/tasks.ts` records as having cost this project
four packages: a field accepted, dropped, and answered 200 with nothing on the
wire saying so.

**The compatibility key is `label`, and the ruling of 2026-09-20 calls it
`personalLabel`.** Recorded here rather than silently corrected, because taking
the ruling at its word would have produced a criterion passing green over a key
no client has ever sent while the real hazard shipped unfixed. `personalLabel`
was the name of the *zod primitive* that typed the value, renamed to
`shelfName` by this branch; it was never the name of the field on the wire.
Frozen 7.4 writes the body as `{ label, color }`, the parent commit's schema
reads `label: personalLabel.nullable().optional()`, and `tests/e2e/harness.ts`
sent `{ label }` until this branch changed it. So `label` is what an old bundle
sends and `label` is what is declared.

## Why the assertions read the row and not only the response

`PATCH /folders/:id/my-membership` answers the Folder object, so a response
that reports the new shelf is *already* evidence — but it is evidence of a read
rather than of a write, and the bug this criterion exists for is one where the
response looks right. Every arm below therefore reads `folder_members` directly
after the call. The old column is invisible to the wire in any case, so only a
read of the row can say whether the expand half's second write happened.

## The four arms

1. **A body sending only `label` stores the value.** The stale-tab path, and
   the whole reason the ruling exists.
2. **A body sending only `shelf` stores it.** The surviving spelling, which the
   compatibility field must not have broken.
3. **A body sending both stores the `shelf` one.** The ruling's tie-break: a
   client sending both is a new bundle, and the new name is what a new bundle
   means.
4. **The FolderCard answers both keys with equal values.** The read half. 7.0
   asserts the card key-exact and the contract tests carry the pair in their
   key lists; what those cannot say is that the two keys hold the *same* value,
   which is the only thing that makes one of them safe to drop in #247.

A fifth thing is asserted in passing and is not an arm: `null` clears through
either spelling. A compatibility field that accepted a name but not a clear
would lose exactly the edit that takes a folder off a shelf.

Spec: 4.4, 4.18, 7.0, 7.4, 11.11, 11.14. Issue #226, #247, #208 R9.
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast, createFolder, expectStatus } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner'], 'ac481')

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

/**
 * Both membership columns of one viewer's own row, straight from the table.
 *
 * The wire cannot see `label` at all, so a response body cannot answer the
 * question this criterion asks. `shelf_name` is what the application reads and
 * `label` is the expand half's second write, which #247 removes.
 */
async function columnsOf(
  actor: Actor,
  folderId: string,
): Promise<{ shelf_name: string | null; label: string | null }> {
  const found = (await app.db.execute(
    sql`SELECT shelf_name, label FROM folder_members
        WHERE folder_id = ${folderId}::uuid AND user_id = ${actor.id}::uuid`,
  )) as unknown as {
    rows: { shelf_name: string | null; label: string | null }[]
  }
  const row = found.rows[0]
  expect(row, 'the viewer must have a membership row on their own folder').toBeDefined()
  return row as { shelf_name: string | null; label: string | null }
}

/** The viewer's own row of `GET /folders`, which is the card 7.0 fixes. */
async function cardOf(
  actor: Actor,
  folderId: string,
): Promise<Record<string, unknown>> {
  const answer = await actor.browser.api('/folders')
  expectStatus(answer, 200, 'GET /folders answers the list of Folder objects')
  const row = (answer.json() as Record<string, unknown>[]).find(
    (candidate) => candidate.id === folderId,
  )
  expect(row, `the folder list must carry ${folderId}`).toBeDefined()
  return row as Record<string, unknown>
}

describe('AC-481 the Shelf wire rename survives a deploy', () => {
  test('AC-481: a stale tab sending only `label` stores the value', async () => {
    const actor = await owner()
    const folderId = await createFolder(actor, 'ac481 stale tab')

    /* The request an old bundle makes. Before the ruling this was a key the
       schema did not declare, so `z.object` stripped it, `shelf` was absent,
       and the handler wrote nothing — while answering 200. */
    const answered = await actor.browser.json(
      `/folders/${folderId}/my-membership`,
      'PATCH',
      { label: 'ac481 Attic' },
    )
    expectStatus(
      answered,
      200,
      'the compatibility field is declared, so the body is valid',
    )

    expect(
      await columnsOf(actor, folderId),
      'the stale-tab write reached the row under both columns. A 200 here with nulls underneath is the exact defect this criterion exists for: the person renamed their shelf, was told it was accepted, and lost the edit',
    ).toEqual({ shelf_name: 'ac481 Attic', label: 'ac481 Attic' })

    /* 4.18's own rule, which the compatibility path must not have skipped:
       writing a membership makes the shelf if there is not one (issue #65).
       A compatibility field that reached the column but not the shelves table
       would leave a heading in the Library with nothing behind it. */
    const shelves = await actor.browser.api('/shelves')
    expectStatus(shelves, 200, 'the shelves list answers')
    expect(
      (shelves.json() as { name: string }[]).some(
        (shelf) => shelf.name === 'ac481 Attic',
      ),
      '4.18: a membership written through 7.4 makes the shelf, whichever spelling the body used. The compatibility field collapses into `shelf` before the domain sees it, so there is one write path and not two',
    ).toBe(true)

    /* And it clears, which is the half a compatibility field is most likely to
       miss: absent and null are different in this body, so a collapse that
       treated a null `label` as "not provided" would silently refuse to take a
       folder off a shelf. */
    expectStatus(
      await actor.browser.json(`/folders/${folderId}/my-membership`, 'PATCH', {
        label: null,
      }),
      200,
      'null clears through the compatibility spelling too',
    )
    expect(
      await columnsOf(actor, folderId),
      'and the clear reached both columns',
    ).toEqual({ shelf_name: null, label: null })
  })

  test('AC-481: a body sending only `shelf` stores it', async () => {
    const actor = await owner()
    const folderId = await createFolder(actor, 'ac481 new bundle')

    expectStatus(
      await actor.browser.json(`/folders/${folderId}/my-membership`, 'PATCH', {
        shelf: 'ac481 Bench',
      }),
      200,
      'the surviving spelling writes',
    )
    expect(
      await columnsOf(actor, folderId),
      'the surviving spelling still writes both columns. Adding a compatibility field is the kind of change that breaks the field it was added beside',
    ).toEqual({ shelf_name: 'ac481 Bench', label: 'ac481 Bench' })
  })

  test('AC-481: a body sending both stores the `shelf` one', async () => {
    const actor = await owner()
    const folderId = await createFolder(actor, 'ac481 both')

    expectStatus(
      await actor.browser.json(`/folders/${folderId}/my-membership`, 'PATCH', {
        shelf: 'ac481 Chosen',
        label: 'ac481 Discarded',
      }),
      200,
      'a body carrying both is valid rather than refused',
    )
    expect(
      await columnsOf(actor, folderId),
      "the ruling's tie-break: `shelf` wins. A client sending both is a new bundle, and the new name is what a new bundle means — reading the old one would let a stale value written by a compatibility path overwrite a deliberate one",
    ).toEqual({ shelf_name: 'ac481 Chosen', label: 'ac481 Chosen' })
  })

  test('AC-481: the FolderCard answers both keys with equal values', async () => {
    const actor = await owner()
    const folderId = await createFolder(actor, 'ac481 card')

    /* Set through the surviving spelling, so that the card's old key is being
       read from the live value rather than from a value written under its own
       name. That is the direction a stale tab reads in. */
    const written = await actor.browser.json(
      `/folders/${folderId}/my-membership`,
      'PATCH',
      { shelf: 'ac481 Shelf' },
    )
    expectStatus(written, 200, 'the membership write answers the Folder object')

    for (const [where, card] of [
      ['the PATCH response', written.json() as Record<string, unknown>],
      ['GET /folders', await cardOf(actor, folderId)],
      [
        'GET /folders/:id',
        await (async () => {
          const one = await actor.browser.api(`/folders/${folderId}`)
          expectStatus(one, 200, 'GET /folders/:id answers the Folder object')
          return one.json() as Record<string, unknown>
        })(),
      ],
    ] as const) {
      expect(
        card.my_shelf,
        `${where} must carry the shelf under its surviving key`,
      ).toBe('ac481 Shelf')
      expect(
        card.my_label,
        `${where} must carry the same value under the key a browser tab holding an old bundle reads. One column, two keys: an unequal pair would mean the card had grown a second fact, and #247 could not then drop either one`,
      ).toBe(card.my_shelf)
    }

    /* Cleared, because a pair that agrees on a value and disagrees on absence
       is the same defect one case later. */
    expectStatus(
      await actor.browser.json(`/folders/${folderId}/my-membership`, 'PATCH', {
        shelf: null,
      }),
      200,
      'the shelf clears',
    )
    const cleared = await cardOf(actor, folderId)
    expect(cleared.my_shelf, 'cleared under the surviving key').toBeNull()
    expect(
      cleared.my_label,
      'and cleared under the compatibility key, which is the same column',
    ).toBeNull()
  })
})
