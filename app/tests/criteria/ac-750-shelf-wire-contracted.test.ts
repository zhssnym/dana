/*
AC-750: the Shelf wire pair is contracted, so the retired spellings are inert
rather than still working (issue #247, the contract half of #226).

## What this replaces, and why a contraction needs a test at all

AC-481 asserted the **expand** half: that `PATCH /folders/:id/my-membership`
accepted either `shelf` or `label`, that a body sending only `label` stored the
value, and that the Folder object carried `my_shelf` and `my_label` with equal
values in every producer. That criterion is retired, under hard stop 7 and on
the decision named in #247: the pair was a compatibility shim for one deploy
window, and the window closed when migration 0022 went live. AC-481's text is
kept and marked retired in 12.24, as that section's append-only rule requires.

**Retiring it is not the same as replacing it, and this file is the
replacement.** A contraction performed and a contraction forgotten look
identical from the outside: in both cases nothing in the suite mentions the old
spelling, and in both cases the suite is green. The only difference is whether
the old spelling still does something, and nothing asserts that unless
something asks. So the four arms below are AC-481's four, inverted.

## The trap this file is written around

The easy version of every arm here passes for the wrong reason. `expect(card.my_label).toBeUndefined()`
passes over a card that was never fetched, over a folder that does not exist,
and over a 500. A PATCH that "changes nothing" passes over a row that was never
written in the first place.

So every arm **establishes a known non-null state first, through the surviving
spelling, and then shows that state surviving the retired one**. A shelf is set
to a value this file names; the retired key is sent carrying a different value;
and the assertion is that the first value is still there — on the row, on the
card, and in the shelves list. An arm that passed because nothing was reachable
would fail the setup rather than the assertion.

## The four arms

1. **A body sending only `label` changes nothing.** It answers 200 rather than
   422 — 7.0 tolerates unknown keys and 11.14 rules that no shared schema
   becomes strict, so the retired key is now an ordinary unknown one, stripped
   and logged. The shelf it names is not written, and 4.18's shelf-making
   sentence does not fire, so no shelf by that name appears.
2. **`label: null` does not clear.** The half a half-done contraction is most
   likely to leave working, because a collapse that mapped `label` onto `shelf`
   would still be reachable through the clear path alone.
3. **The surviving spelling still writes**, name and clear. Removing a field
   beside another field is exactly the change that breaks the other field.
4. **No producer of the Folder object answers `my_label`.** All three: the
   PATCH response, `GET /folders` and `GET /folders/:id`. `my_shelf` carries
   the value, so the key is absent rather than the object being empty.

The column half is AC-479's, in
`ac-474-label-projections-stay-bounded.test.ts`. **It is not "one column"
yet**, and the reason is 11.5: this release stops writing
`folder_members.label` and the release after it drops the column, because the
instance Render has not drained yet is still writing that column while the
new one serves. So AC-479 asserts, for this release, that the column is there
and that no write path touches it; the drop and the 42703 refusal arrive with
the migration.

Spec: 4.4, 4.18, 7.0, 7.4, 11.11, 11.14. Issue #247, #226, #208 R9.
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast, createFolder, expectStatus } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner'], 'ac750')

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
 * The viewer's own membership, straight from the table.
 *
 * The wire has never shown this column under any name, and a PATCH answers the
 * Folder object, so a response that reports the old value is evidence of a
 * read and not of a write. Every arm below reads the row.
 *
 * `shelf_name` is the only column the application writes, since #247. The
 * retired `folder_members.label` is still in the table for one more release
 * and no longer written; AC-479 is what asserts both halves of that.
 */
async function shelfColumnOf(actor: Actor, folderId: string): Promise<string | null> {
  const found = (await app.db.execute(
    sql`SELECT shelf_name FROM folder_members
        WHERE folder_id = ${folderId}::uuid AND user_id = ${actor.id}::uuid`,
  )) as unknown as { rows: { shelf_name: string | null }[] }
  const row = found.rows[0]
  expect(row, 'the viewer must have a membership row on their own folder').toBeDefined()
  return row?.shelf_name ?? null
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

/** Every shelf name the viewer holds (4.18's own table, through 7.16). */
async function shelfNames(actor: Actor): Promise<string[]> {
  const answer = await actor.browser.api('/shelves')
  expectStatus(answer, 200, 'the shelves list answers')
  return (answer.json() as { name: string }[]).map((shelf) => shelf.name)
}

/** Places the folder on a named shelf through the surviving spelling, and
 * proves it landed. Every arm starts here, so that "nothing changed" below is
 * a statement about a state that demonstrably existed. */
async function placeOn(
  actor: Actor,
  folderId: string,
  name: string,
): Promise<void> {
  expectStatus(
    await actor.browser.json(`/folders/${folderId}/my-membership`, 'PATCH', {
      shelf: name,
    }),
    200,
    'the surviving spelling writes',
  )
  expect(
    await shelfColumnOf(actor, folderId),
    'the setup must have written, or every assertion after it is vacuous',
  ).toBe(name)
}

describe('AC-750 the Shelf wire pair is contracted', () => {
  test('AC-750: a body sending only `label` changes nothing', async () => {
    const actor = await owner()
    const folderId = await createFolder(actor, 'ac750 retired key')
    await placeOn(actor, folderId, 'ac750 Attic')

    /* The request a tab holding a pre-#226 bundle would make. While the pair
       stood this stored the value; the window has closed and it is an unknown
       key now. */
    expectStatus(
      await actor.browser.json(`/folders/${folderId}/my-membership`, 'PATCH', {
        label: 'ac750 Cellar',
      }),
      200,
      'the retired key gets the ordinary unknown-key treatment: 7.0 tolerates unknown fields and 11.14 rules that no shared schema becomes strict, so this is stripped rather than refused',
    )

    expect(
      await shelfColumnOf(actor, folderId),
      'the retired spelling wrote nothing. A row reading `ac750 Cellar` here means `label` is still collapsing into `shelf` somewhere, and the contraction only happened in the comments',
    ).toBe('ac750 Attic')

    expect(
      (await cardOf(actor, folderId)).my_shelf,
      'and the card still reports the shelf that was actually set',
    ).toBe('ac750 Attic')

    /* 4.18's shelf-making sentence is the second, independent witness: a
       membership written through 7.4 makes the shelf if there is not one
       (issue #65). If `label` had reached the domain, a shelf by that name
       would exist even had the UPDATE been lost. */
    expect(
      await shelfNames(actor),
      'no shelf was made for the retired spelling, so the value did not reach the domain at all rather than reaching it and failing to store',
    ).not.toContain('ac750 Cellar')
  })

  test('AC-750: `label: null` does not clear the shelf', async () => {
    const actor = await owner()
    const folderId = await createFolder(actor, 'ac750 retired clear')
    await placeOn(actor, folderId, 'ac750 Loft')

    expectStatus(
      await actor.browser.json(`/folders/${folderId}/my-membership`, 'PATCH', {
        label: null,
      }),
      200,
      'a null under the retired key is still an unknown key rather than a refusal',
    )

    expect(
      await shelfColumnOf(actor, folderId),
      'the clear did not go through the retired spelling. This is the arm a half-done contraction leaves working: absent and null are different in this body, so a collapse that survived only on the null path would take a folder off its shelf while the name path looked contracted',
    ).toBe('ac750 Loft')
  })

  test('AC-750: the surviving spelling still writes and still clears', async () => {
    const actor = await owner()
    const folderId = await createFolder(actor, 'ac750 surviving key')

    await placeOn(actor, folderId, 'ac750 Bench')
    expect(
      (await cardOf(actor, folderId)).my_shelf,
      'the surviving spelling reaches the card as well as the row. Removing a field beside another field is exactly the change that breaks the other field',
    ).toBe('ac750 Bench')

    expectStatus(
      await actor.browser.json(`/folders/${folderId}/my-membership`, 'PATCH', {
        shelf: null,
      }),
      200,
      'and null under the surviving key clears',
    )
    expect(
      await shelfColumnOf(actor, folderId),
      'the clear reached the one column that is left',
    ).toBeNull()

    /* A body carrying both is valid rather than refused, and the surviving
       key is what it writes. The precedence the expand half needed is gone
       along with the collapse that implemented it, so there is nothing left
       to get the tie-break wrong — which is the thing to check, because the
       obvious way to retire `label` is to refuse it, and refusing it would
       turn a stale tab's harmless 200 into a 422. */
    expectStatus(
      await actor.browser.json(`/folders/${folderId}/my-membership`, 'PATCH', {
        shelf: 'ac750 Chosen',
        label: 'ac750 Discarded',
      }),
      200,
      'a body carrying both is accepted, the retired key being unknown rather than forbidden',
    )
    expect(
      await shelfColumnOf(actor, folderId),
      'and the surviving key is what was stored',
    ).toBe('ac750 Chosen')
  })

  test('AC-750: no producer of the Folder object answers `my_label`', async () => {
    const actor = await owner()
    const folderId = await createFolder(actor, 'ac750 card')

    const written = await actor.browser.json(
      `/folders/${folderId}/my-membership`,
      'PATCH',
      { shelf: 'ac750 Shelf' },
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
        `${where} must carry the shelf under the surviving key, or the absence below is the absence of a folder rather than of a key`,
      ).toBe('ac750 Shelf')
      expect(
        Object.keys(card),
        `${where} still answers the retired key. 7.0 fixes this object key-exact, and a producer that kept \`my_label\` would keep a second name for one column alive past the deploy window it was added for`,
      ).not.toContain('my_label')
    }
  })
})
