/*
AC-832: Purpose and Results rename by `display_name` and reset by writing null,
keeping their ids; Main, Consultation and a Work facet refuse any
`display_name` at all.

Issue #210 (M1-F), invariant 3 of Hassan's technical ruling of 2026-09-21,
https://github.com/zhssnym/dana/issues/210#issuecomment-5756722756.
Spec 4.30, 7.27.

## The thing this criterion is really about

**Null is the default name rather than an absence**, and Reset is a write of
null. That is the one sentence in 4.30 a reader is most likely to get backwards,
because every other nullable column in this schema means "nothing here". A
handler that treated a null `display_name` as "do not touch the name" would
make Reset unreachable and would answer 200 while storing nothing — which is
why every case below reads the **stored row** beside the response, and why the
absent case is asserted too: `{}` with no `display_name` key must not reset
anything.

## And the id, which is #210's core rule in one field

"Native facets keep their stable internal identity even when Purpose or Results
are renamed." So the id is captured before the first rename and compared after
the reset, rather than the criterion reading whatever facet happens to be
Purpose at the end.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast, expectStatus } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import {
  createFacetOk,
  facetOfKind,
  facetRow,
  facetsOf,
  folderWithFacets,
  patchFacet,
  writeFolderHeading,
} from '../support/facets-harness.js'
import { DEFAULT_FACET_NAMES, MAX_FACET_NAME } from '../../src/shared/facets.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'member'], 'ac832')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 120_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-832 Purpose and Results rename and reset, keeping their ids', () => {
  test('a rename is what every member reads, and the id has not moved', async () => {
    const [owner, member] = (await cast.of(app)) as [Actor, Actor]
    const { folderId, facets } = await folderWithFacets(
      app,
      owner,
      'AC-832 rename',
      [[member, 'can_edit']],
    )
    const purpose = facets[1]!
    const results = facets[3]!

    const renamed = await patchFacet(owner, folderId, purpose.id, {
      display_name: 'Why we are here',
    })
    expectStatus(renamed, 200, '7.27: Purpose renames by display_name')
    expect(
      (renamed.json() as { name: string; display_name: string | null }),
      'the response carries the resolved name and the stored override, which are two different facts',
    ).toMatchObject({
      id: purpose.id,
      name: 'Why we are here',
      display_name: 'Why we are here',
    })

    /* The stored row, because a handler that echoed its own request while
       writing nothing would satisfy every assertion above this line. */
    expect(
      (await facetRow(app.db, purpose.id))?.display_name,
      'the override is stored, not merely answered',
    ).toBe('Why we are here')

    const asMember = await facetOfKind(member, folderId, 'purpose')
    expect(
      [asMember?.id, asMember?.name],
      'the shared name is what every member reads, and the id is the one it always was',
    ).toEqual([purpose.id, 'Why we are here'])

    await patchFacet(owner, folderId, results.id, { display_name: 'What came of it' })
    const both = await facetsOf(member, folderId)
    expect(
      both.map((facet) => facet.name),
      'both renameable natives are theirs to name, and the two fixed ones are not touched by either',
    ).toEqual(['Main', 'Why we are here', 'Consultation', 'What came of it'])
  })

  test('writing null is Reset: the default name comes back and the id does not change', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const { folderId, facets } = await folderWithFacets(app, owner, 'AC-832 reset')
    const purpose = facets[1]!

    await patchFacet(owner, folderId, purpose.id, { display_name: 'Aim' })
    const reset = await patchFacet(owner, folderId, purpose.id, {
      display_name: null,
    })
    expectStatus(reset, 200, '4.30: null on Purpose is Reset, not "leave it alone"')
    expect(
      reset.json(),
      'the resolved name is the default again and the override is gone',
    ).toMatchObject({
      id: purpose.id,
      name: DEFAULT_FACET_NAMES.purpose,
      display_name: null,
    })
    expect(
      (await facetRow(app.db, purpose.id))?.display_name,
      'the column holds null, which is what makes the default the default rather than a stored copy of the word',
    ).toBeNull()

    /* **The absent case, which is the half that makes null mean something.**
       A patch that names only `hidden` must leave the name exactly where it
       is; a handler that could not tell absent from null would either make
       Reset unreachable or reset on every hide. */
    await patchFacet(owner, folderId, purpose.id, { display_name: 'Aim again' })
    const hidden = await patchFacet(owner, folderId, purpose.id, { hidden: true })
    expectStatus(hidden, 200, 'a patch naming only `hidden` is a hide')
    expect(
      (hidden.json() as { name: string }).name,
      'and it left the name alone: absent is not null',
    ).toBe('Aim again')
  })

  test('Main, Consultation and a Work facet refuse any display_name', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const { folderId, facets } = await folderWithFacets(app, owner, 'AC-832 fixed')
    const heading = await writeFolderHeading(owner, folderId, 'A heading')
    const work = await createFacetOk(owner, folderId, {
      kind: 'work',
      h1_block_id: heading,
    })

    for (const [what, id] of [
      ['main', facets[0]!.id],
      ['consultation', facets[2]!.id],
      ['work', work.id],
    ] as const) {
      for (const value of ['Something', null]) {
        const refused = await patchFacet(owner, folderId, id, {
          display_name: value,
        })
        expectStatus(
          refused,
          422,
          `7.27: a ${what} facet's name is not stored, so neither a value nor a reset can be written to it`,
        )
        expect(
          JSON.stringify(refused.json()),
          'the refusal names the field',
        ).toContain('display_name')
      }
      expect(
        (await facetRow(app.db, id))?.display_name,
        'and the column is still null, which is what the CHECK requires of these three kinds',
      ).toBeNull()
    }
  })

  test('a name outside 4.30 bounds is refused by the schema before it reaches the column', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const { folderId, facets } = await folderWithFacets(app, owner, 'AC-832 bounds')
    const purpose = facets[1]!

    for (const value of ['', 'x'.repeat(MAX_FACET_NAME + 1)]) {
      const refused = await patchFacet(owner, folderId, purpose.id, {
        display_name: value,
      })
      expectStatus(
        refused,
        422,
        '4.30: a facet name is 1 to 120 characters, which is 4.17 heading ceiling one table over',
      )
    }
    expect(
      (await facetRow(app.db, purpose.id))?.display_name,
      'neither refusal wrote anything',
    ).toBeNull()

    const atCeiling = await patchFacet(owner, folderId, purpose.id, {
      display_name: 'x'.repeat(MAX_FACET_NAME),
    })
    expectStatus(
      atCeiling,
      200,
      'and the ceiling itself is admitted, which is what makes the refusal above a bound rather than a ban',
    )
  })
})
