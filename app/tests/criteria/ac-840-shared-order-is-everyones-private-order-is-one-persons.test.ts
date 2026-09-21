/*
AC-840: one shared-order write changes the order every member reads; one
private-order write changes only its author's; and a list that is not the whole
order is 422.

Issue #210 (M1-F), invariant 11 of Hassan's technical ruling of 2026-09-21,
https://github.com/zhssnym/dana/issues/210#issuecomment-5756722756.
Spec 7.27; #228's personal-actions rule.

## Two orders, and the assertion that keeps them apart

The pair of them is the point. A single stored `position` serves both — private
order needs no table of its own precisely because it rewrites rows nobody else
can read — so the failure mode is one write leaking into the other. Every case
below therefore reads **both** members after **every** write, not just the one
that made it.

## "The whole truth" is asserted by the refusals rather than by the success

`PUT /facets/order` carries the complete sequence, as 7.16's `set_outline`
does. A handler that merged a partial list would answer 200 and put the facets
in an order the caller did not ask for; the four 422s below are what say it
does not, and each is checked for writing nothing.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast, expectStatus } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import {
  createFacetOk,
  facetsOf,
  forcePreset,
  putFacetOrder,
  putMyFacetOrder,
  sharedFolder,
} from '../support/facets-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'member', 'third'], 'ac840')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 120_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

/** The shared facets of a Folder, in the order one member reads them. */
async function sharedOrder(actor: Actor, folderId: string): Promise<string[]> {
  return (await facetsOf(actor, folderId))
    .filter((facet) => !facet.private)
    .map((facet) => facet.id)
}

describe('AC-840 the shared order is everybody\'s and the private order is one person\'s', () => {
  test('one shared write changes what every member reads', async () => {
    const [owner, member] = (await cast.of(app)) as [Actor, Actor]
    const folderId = await sharedFolder(app, owner, 'AC-840 shared', [
      [member, 'can_edit'],
    ])
    await createFacetOk(owner, folderId, {
      kind: 'shared_blank',
      display_name: 'Notes',
    })

    const before = await sharedOrder(owner, folderId)
    expect(
      await sharedOrder(member, folderId),
      'both members start from the same sequence, which is what makes the change below observable',
    ).toEqual(before)

    const reordered = [before[0]!, ...before.slice(1).reverse()]
    expectStatus(
      await putFacetOrder(owner, folderId, reordered),
      200,
      "#210: the shared facet order is Folder data, and Can edit changes it for everyone",
    )

    expect(
      await sharedOrder(owner, folderId),
      'the writer reads the sequence they asked for, exactly',
    ).toEqual(reordered)
    expect(
      await sharedOrder(member, folderId),
      'and so does every other member: it is one order rather than one each',
    ).toEqual(reordered)
  })

  test('a list that is not the whole order is refused, four ways, writing nothing', async () => {
    const [owner, member] = (await cast.of(app)) as [Actor, Actor]
    const folderId = await sharedFolder(app, owner, 'AC-840 refusals', [
      [member, 'can_edit'],
    ])
    await createFacetOk(owner, folderId, {
      kind: 'shared_blank',
      display_name: 'Notes',
    })
    const priv = (
      await createFacetOk(member, folderId, {
        kind: 'private_blank',
        display_name: 'Mine',
      })
    ).id

    const order = await sharedOrder(owner, folderId)
    const main = order[0]!

    for (const [why, list] of [
      ['omitting a shared facet', order.slice(0, -1)],
      ['naming one twice', [...order, main]],
      ['putting something before Main', [order[1]!, ...order.slice(2), main]],
      ['carrying a private id', [...order, priv]],
    ] as const) {
      const refused = await putFacetOrder(member, folderId, list)
      expectStatus(
        refused,
        422,
        `7.27: the list is complete and is the whole truth, as 7.16's set_outline is -- ${why} is refused rather than merged`,
      )
      expect(
        JSON.stringify(refused.json()),
        'and the refusal names the field',
      ).toContain('order')
      expect(
        await sharedOrder(owner, folderId),
        `and ${why} wrote nothing: the order is what it was`,
      ).toEqual(order)
    }
  })

  test("one private write changes only its author's arrangement", async () => {
    const [owner, member, third] = (await cast.of(app)) as [Actor, Actor, Actor]
    const folderId = await sharedFolder(app, owner, 'AC-840 private', [
      [member, 'can_view'],
      [third, 'can_edit'],
    ])
    const notes = (
      await createFacetOk(owner, folderId, {
        kind: 'shared_blank',
        display_name: 'Notes',
      })
    ).id
    const mine = (
      await createFacetOk(member, folderId, {
        kind: 'private_blank',
        display_name: 'Mine',
      })
    ).id
    const theirs = (
      await createFacetOk(third, folderId, {
        kind: 'private_blank',
        display_name: 'Theirs',
      })
    ).id

    const ownerBefore = (await facetsOf(owner, folderId)).map((f) => f.id)
    const thirdBefore = (await facetsOf(third, folderId)).map((f) => f.id)

    /* **Gated on membership alone**, which is #228's personal-actions rule:
       `personal.view_preferences` is `can_view` and `personal: true`, so the
       Can-view member below arranges their own facets exactly as a
       Full-control one would. */
    expectStatus(
      await putMyFacetOrder(member, folderId, [
        { facet_id: mine, after_facet_id: null },
      ]),
      200,
      '7.27: arranging your own private facets is membership-gated and nothing more',
    )

    const memberAfter = (await facetsOf(member, folderId)).map((f) => f.id)
    expect(
      memberAfter[0],
      '#210: Main stays first for everybody, whatever anybody arranges',
    ).toBe(ownerBefore[0])
    expect(
      memberAfter[1],
      "and the author's own private facet is where they put it -- first among the rest",
    ).toBe(mine)

    expect(
      (await facetsOf(owner, folderId)).map((f) => f.id),
      "the Folder's owner reads exactly what they read before: a private write touches no shared key",
    ).toEqual(ownerBefore)
    expect(
      (await facetsOf(third, folderId)).map((f) => f.id),
      "and the third member's own arrangement, private facet and all, is untouched",
    ).toEqual(thirdBefore)
    expect(
      thirdBefore,
      "which is worth stating: the third member sees their own private facet and not the second member's",
    ).toContain(theirs)
    expect(thirdBefore, 'and not the other member\'s').not.toContain(mine)
    expect(ownerBefore, 'the owner sees the shared one').toContain(notes)
  })

  test('a shared write afterwards still leaves the private arrangement alone', async () => {
    const [owner, member] = (await cast.of(app)) as [Actor, Actor]
    const folderId = await sharedFolder(app, owner, 'AC-840 both', [
      [member, 'can_edit'],
    ])
    await createFacetOk(owner, folderId, {
      kind: 'shared_blank',
      display_name: 'Notes',
    })
    const mine = (
      await createFacetOk(member, folderId, {
        kind: 'private_blank',
        display_name: 'Mine',
      })
    ).id
    await putMyFacetOrder(member, folderId, [
      { facet_id: mine, after_facet_id: null },
    ])

    const order = await sharedOrder(owner, folderId)
    const reordered = [order[0]!, ...order.slice(1).reverse()]
    expectStatus(await putFacetOrder(owner, folderId, reordered), 200, 'the shared write')

    const memberSees = (await facetsOf(member, folderId)).map((f) => f.id)
    expect(
      memberSees.filter((id) => id !== mine),
      "the member reads the new shared sequence, because it is the Folder's",
    ).toEqual(reordered)
    expect(
      memberSees.includes(mine),
      'and their own private facet is still theirs to see',
    ).toBe(true)

    /* One private-order write afterwards puts it back where they want it, and
       the shared sequence is still the one the Folder agreed on. This is the
       interleaving working rather than the two orders fighting. */
    expectStatus(
      await putMyFacetOrder(member, folderId, [
        { facet_id: mine, after_facet_id: null },
      ]),
      200,
      'and re-arranging after a shared write still works',
    )
    const again = (await facetsOf(member, folderId)).map((f) => f.id)
    expect(again[1], 'their facet is first among the rest again').toBe(mine)
    expect(
      again.filter((id) => id !== mine),
      "and the shared order underneath it did not move",
    ).toEqual(reordered)
    expect(
      await sharedOrder(owner, folderId),
      "nor did the owner's read of it",
    ).toEqual(reordered)
  })

  test("the shared order tells nobody that another member's private facet exists", async () => {
    /*
    **A 10.2 oracle, found by the adversarial review of 16ce81b.** The
    shared-order write answers a helpful "a private facet's place is its
    owner's and is written through my-order" for a private id, and that is
    worth having -- for the caller's **own** private facet, where it names a
    thing they already know about. It used to be asked of every private row of
    the Folder, so sending another member's id came back with a different
    sentence from sending a uuid that names nothing, and a prober learned that
    a private facet was there. That is the one fact `facet.read` admits no
    preset in order to withhold.

    The assertion is that the two answers are **byte-identical**, not merely
    that both are 422: a status comparison would have been green on the
    defect.
    */
    const [owner, member] = (await cast.of(app)) as [Actor, Actor]
    const folderId = await sharedFolder(app, owner, 'AC-840 oracle', [
      [member, 'can_edit'],
    ])
    const theirs = (
      await createFacetOk(member, folderId, {
        kind: 'private_blank',
        display_name: 'Theirs',
      })
    ).id
    const order = await sharedOrder(owner, folderId)

    const aboutTheirs = await putFacetOrder(owner, folderId, [...order, theirs])
    const aboutNothing = await putFacetOrder(owner, folderId, [
      ...order,
      '00000000-0000-4000-8000-000000000840',
    ])
    expectStatus(aboutTheirs, 422, "another member's private id is refused")
    expectStatus(aboutNothing, 422, 'and so is a uuid that names nothing')
    expect(
      aboutTheirs.body,
      "and the two refusals are the same words: the Folder's owner learns nothing from the difference, because there is none",
    ).toBe(aboutNothing.body)

    /* The other half, which is what makes the sentence above a scoping rather
       than a deletion: the caller's **own** private id still gets the helpful
       answer, and it is a different one. */
    const mine = (
      await createFacetOk(owner, folderId, {
        kind: 'private_blank',
        display_name: 'Mine',
      })
    ).id
    const aboutMine = await putFacetOrder(owner, folderId, [...order, mine])
    expectStatus(aboutMine, 422, "the caller's own private id is refused too")
    expect(
      aboutMine.body,
      'but with the sentence that says which route to use instead, which discloses nothing they did not already know',
    ).not.toBe(aboutNothing.body)
    expect(aboutMine.body).toContain('my-order')
  })

  test("another member's private facet cannot be placed by anybody", async () => {
    const [owner, member] = (await cast.of(app)) as [Actor, Actor]
    const folderId = await sharedFolder(app, owner, 'AC-840 not yours', [
      [member, 'can_edit'],
    ])
    const mine = (
      await createFacetOk(member, folderId, {
        kind: 'private_blank',
        display_name: 'Mine',
      })
    ).id

    const refused = await putMyFacetOrder(owner, folderId, [
      { facet_id: mine, after_facet_id: null },
    ])
    expectStatus(
      refused,
      404,
      "7.27: another member's id answers 404, which is 10.2's grammar for a row whose existence the caller may not learn",
    )
    expect(
      refused.body,
      'and the refusal does not carry the id it refused',
    ).not.toContain(mine)

    /* A shared facet in a private-order placement is the same answer, because
       my-order writes only rows the caller owns: there is nothing here that is
       theirs to place. */
    const shared = await createFacetOk(owner, folderId, {
      kind: 'shared_blank',
      display_name: 'Notes',
    })
    expectStatus(
      await putMyFacetOrder(owner, folderId, [
        { facet_id: shared.id, after_facet_id: null },
      ]),
      404,
      "a shared facet's place is the Folder's and is written through /facets/order",
    )

    /* And it is not that the route refuses everything: the member's own
       placement still works, which is what makes the two refusals above
       refusals. */
    await forcePreset(app.db, folderId, member.id, 'can_view')
    expectStatus(
      await putMyFacetOrder(member, folderId, [
        { facet_id: mine, after_facet_id: null },
      ]),
      200,
      'the owner of the private facet places it, at Can view',
    )
  })
})
