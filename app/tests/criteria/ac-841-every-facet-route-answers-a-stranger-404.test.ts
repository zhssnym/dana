/*
AC-841: every route of 7.27 answers a signed-in stranger 404 and never 403, and
a member below the bar each route asks is answered 403 with the reason while
the row is unchanged.

Issue #210 (M1-F), invariant 12 of Hassan's technical ruling of 2026-09-21,
https://github.com/zhssnym/dana/issues/210#issuecomment-5756722756.
Spec 7.27, 10.2, 5.4; accepted #209 R8A.

## What this adds to `ac-397`, which sweeps the same routes

`ac-397` is **structural**: it enumerates every id-bearing route on the mounted
application and drives each once as a stranger, so a route added without a
decision about strangers fails there. It cannot say anything about presets — it
knows one member, at Can edit — and it drives each route once.

This is **behavioural** and is the other half. It drives a member at each preset
below the bar, asserts 403 rather than 404 (they can see the Folder, so the
refusal owes them a reason), and reads the row afterwards to prove the refusal
wrote nothing. Neither file is the other, and the ruling's invariant 12 is
written as both halves in one sentence.

## The presets each route asks for

Create, rename, hide, reorder and delete are `can_edit` (ruling section 2). The
permanent delete is `task.destroy`, which is `full_control` with ownership
ignored — 7.13's 2026-09-20 correction applied to a third kind — so a Can-edit
member is the actor that proves it. `my-order` is membership alone and has no
bar to be below, which is asserted as a success rather than left unsaid.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast, expectStatus, signInActor } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import {
  createFacetOk,
  deleteFacet,
  destroyFacet,
  facetRow,
  facetsOf,
  forcePreset,
  getFacetPage,
  getFacets,
  patchFacet,
  postFacet,
  putFacetOrder,
  putMyFacetOrder,
  restoreFacet,
  shareFacet,
  sharedFolder,
  writeFolderHeading,
} from '../support/facets-harness.js'
import type { RawResponse } from '../support/http-client.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'member', 'stranger'], 'ac841')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 120_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-841 a stranger is 404 everywhere and a member below the bar is 403', () => {
  test('all eleven routes answer a signed-in stranger 404, never 403', async () => {
    const [owner, member, stranger] = (await cast.of(app)) as [
      Actor,
      Actor,
      Actor,
    ]
    const folderId = await sharedFolder(app, owner, 'AC-841 stranger', [
      [member, 'can_edit'],
    ])
    const heading = await writeFolderHeading(owner, folderId, 'A heading')
    const blank = await createFacetOk(owner, folderId, {
      kind: 'shared_blank',
      display_name: 'Notes',
    })
    const doomed = await createFacetOk(owner, folderId, {
      kind: 'shared_blank',
      display_name: 'Doomed',
    })
    await deleteFacet(owner, folderId, doomed.id)

    const attempts: [string, () => Promise<RawResponse>][] = [
      ['GET /folders/:id/facets', () => getFacets(stranger, folderId)],
      [
        'POST /folders/:id/facets',
        () =>
          postFacet(stranger, folderId, {
            kind: 'work',
            h1_block_id: heading,
          }),
      ],
      [
        'PATCH /folders/:id/facets/:facetId',
        () => patchFacet(stranger, folderId, blank.id, { display_name: 'no' }),
      ],
      [
        'DELETE /folders/:id/facets/:facetId',
        () => deleteFacet(stranger, folderId, blank.id),
      ],
      [
        'PUT /folders/:id/facets/order',
        () => putFacetOrder(stranger, folderId, [blank.id]),
      ],
      [
        'PUT /folders/:id/facets/my-order',
        () =>
          putMyFacetOrder(stranger, folderId, [
            { facet_id: blank.id, after_facet_id: null },
          ]),
      ],
      [
        'POST /folders/:id/facets/:facetId/share',
        () => shareFacet(stranger, folderId, blank.id),
      ],
      [
        'GET /folders/:id/facets/:facetId/page',
        () => getFacetPage(stranger, folderId, blank.id),
      ],
      [
        'POST /folders/:id/facets/:facetId/page/actions',
        () =>
          stranger.browser.json(
            `/folders/${folderId}/facets/${blank.id}/page/actions`,
            'POST',
            {
              action: 'document_transaction',
              mutation_id: crypto.randomUUID(),
              base_revision: 'anything',
              operations: [{ op: 'set_outline', items: [] }],
            },
          ),
      ],
      ['POST /facets/:id/restore', () => restoreFacet(stranger, doomed.id)],
      ['DELETE /trash/facets/:id', () => destroyFacet(stranger, doomed.id)],
    ]

    expect(
      attempts.length,
      "7.27 is eleven routes, and every one of them takes an id. `ac-397` enumerates them structurally against the mounted router; this drives them, and the two counts agreeing is what says neither has lost sight of one",
    ).toBe(11)

    for (const [route, attempt] of attempts) {
      const response = await attempt()
      expectStatus(
        response,
        404,
        `10.2: ${route} must not confirm to a non-member that this Folder exists, so the answer is 404 rather than 403`,
      )
      expect(
        response.body,
        `and ${route}'s refusal carries neither the Folder's id nor the facet's`,
      ).not.toContain(folderId)
    }

    /* Nothing a stranger touched moved, which is the half a status check
       alone leaves open: a route could answer 404 after writing. */
    expect(
      (await facetRow(app.db, blank.id))?.display_name,
      'the facet a stranger tried to rename, delete and share is exactly what it was',
    ).toBe('Notes')
    expect(
      (await facetRow(app.db, doomed.id))?.deleted_at,
      'and the trashed one is still in Trash rather than restored or destroyed',
    ).not.toBeNull()
  })

  test('a member below the bar is 403 with a reason, and the row is unchanged', async () => {
    const [owner, member] = (await cast.of(app)) as [Actor, Actor]
    const folderId = await sharedFolder(app, owner, 'AC-841 below', [
      [member, 'can_edit'],
    ])
    const heading = await writeFolderHeading(owner, folderId, 'A heading')
    const blank = await createFacetOk(owner, folderId, {
      kind: 'shared_blank',
      display_name: 'Notes',
    })
    const listed = await facetsOf(owner, folderId)
    const order = listed.map((facet) => facet.id)
    /* The hide below is driven against **Purpose** rather than against the
       blank facet, because 7.27 puts the body before the preset: `hidden` on a
       blank facet is 422 ("a custom facet is deleted rather than hidden") and
       the actor never reaches the authority question. A criterion about the
       bar has to hand the route a body it would otherwise accept. */
    const purpose = listed.find((facet) => facet.kind === 'purpose')!

    /* Create, rename, hide, reorder and delete are Can edit (the ruling's
       section 2), so every preset below it is refused. Driven at all four
       rather than at one, because a bar written as `can_contribute` by mistake
       would refuse Can view and admit Can contribute. */
    for (const preset of [
      'can_contribute',
      'assigned_work',
      'can_comment',
      'can_view',
    ] as const) {
      await forcePreset(app.db, folderId, member.id, preset)

      const refusals: [string, RawResponse][] = [
        [
          'create',
          await postFacet(member, folderId, {
            kind: 'work',
            h1_block_id: heading,
          }),
        ],
        [
          'rename',
          await patchFacet(member, folderId, blank.id, {
            display_name: 'theirs now',
          }),
        ],
        [
          'hide',
          await patchFacet(member, folderId, purpose.id, { hidden: true }),
        ],
        ['reorder', await putFacetOrder(member, folderId, order)],
        ['delete', await deleteFacet(member, folderId, blank.id)],
      ]

      for (const [what, response] of refusals) {
        expectStatus(
          response,
          403,
          `#228's Can-contribute list: ${what} of a shared facet is Can edit's, and ${preset} is below it. 403 rather than 404 because this person can see the Folder, so the refusal owes them a reason`,
        )
        expect(
          (response.json() as { error: { message: string } }).error.message,
          'and it carries the resolver\'s own sentence rather than an empty refusal (7.0)',
        ).not.toBe('')
      }

      /* `my-order` has no bar to be below: `personal.view_preferences` is
         membership and nothing else, which is #228's personal-actions rule.
         Asserted as a success at every one of these presets, because a route
         that refused it would be putting a member's own arrangement inside
         Folder Access. */
      const own = await createFacetOk(member, folderId, {
        kind: 'private_blank',
        display_name: `Mine at ${preset}`,
      })
      expectStatus(
        await putMyFacetOrder(member, folderId, [
          { facet_id: own.id, after_facet_id: null },
        ]),
        200,
        `#228's personal-actions rule: at ${preset}, arranging your own private facets is still yours`,
      )
    }

    const after = await facetRow(app.db, blank.id)
    expect(
      [after?.display_name, after?.hidden, after?.deleted_at],
      'twenty refusals later, the shared facet is exactly what it was',
    ).toEqual(['Notes', false, null])
    expect(
      (await facetRow(app.db, purpose.id))?.hidden,
      'and Purpose was not hidden by any of the four refusals either',
    ).toBe(false)
    expect(
      (await facetsOf(owner, folderId))
        .filter((facet) => !facet.private)
        .map((facet) => facet.id),
      'and so is the shared order',
    ).toEqual(order)
  })

  test('the permanent delete is Full control with ownership ignored', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const administrator = await signInActor(app, 'administrator', 'ac841')
    cast.trackUser(administrator.id)
    const folderId = await sharedFolder(app, owner, 'AC-841 destroy', [
      [administrator, 'full_control'],
    ])
    const facet = await createFacetOk(owner, folderId, {
      kind: 'shared_blank',
      display_name: 'Doomed',
    })
    await deleteFacet(owner, folderId, facet.id)

    /* A Can-edit member is the actor that separates this rule from the
       Folder's: `folder.destroy` needs custody *and* Full control, while a
       facet's permanent delete is the **Task** rule -- Full control with
       ownership ignored (7.13's 2026-09-20 correction). */
    await forcePreset(app.db, folderId, administrator.id, 'can_edit')
    expectStatus(
      await destroyFacet(administrator, facet.id),
      403,
      "7.13 and #228: permanently deleting is Full control's, and Can edit is below it",
    )
    expect(
      await facetRow(app.db, facet.id),
      'and the refusal destroyed nothing',
    ).toBeDefined()

    await forcePreset(app.db, folderId, administrator.id, 'full_control')
    expectStatus(
      await destroyFacet(administrator, facet.id),
      204,
      '**and ownership is ignored**: this actor holds Full control and owns nothing, which is exactly the case `folder.destroy` would refuse',
    )
    expect(
      await facetRow(app.db, facet.id),
      'the row is gone, through the 11.7 collection rather than a delete beside it',
    ).toBeUndefined()
  })
})
