/*
AC-267: the order endpoint refuses a dated task and a completed one with 409,
refuses a neighbour that is not in the same list with 422, and answers the
10.2 not-found shape to a caller who is not a member.

Three refusals, three reasons, and they are deliberately not one status.

**409 for a dated or completed task** because a hand order belongs to the
folder's unscheduled section alone, which is the one order B4 moved: a
scheduled row is ordered by its date and a completed one by when it was
finished, and neither is a list a person arranges. That is a state conflict
in 7.0's taxonomy, not a malformed request.

**422 for a neighbour that is not a peer**, naming the field, because the
body parsed and its value is wrong. A neighbour in another folder is the
interesting case: it exists, and answering anything that distinguishes it
from an id that does not exist would leak that it does. Both answer 422 on
the field, which says nothing either way.

**404 for a non-member**, never 403, because 10.2 forbids the existence leak
and the whole surface is uniform about it.

Every refusal is asserted to have written nothing, because a refusal that
half-applies is worse than one that does not refuse at all.

Spec: 7.6's order endpoint as amended, 7.0's taxonomy, 10.2, 6 Q7.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast, createFolder, expectStatus } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import { placeTask, seedOrderedTask, unscheduledTitles } from './s22a-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'stranger'], 's22a')

const ONE = 's22a ac267 one'
const TWO = 's22a ac267 two'

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-267 the order endpoint refuses what has no hand order', () => {
  test('409 off the list, 422 for a neighbour that is not a peer, 404 for a stranger', async () => {
    const [owner, stranger] = (await cast.of(app)) as [Actor, Actor]
    const folder = await createFolder(owner, 's22a ac267 folder')
    const other = await createFolder(owner, 's22a ac267 other folder')

    const one = await seedOrderedTask(app.db, {
      folderId: folder,
      createdBy: owner.id,
      title: ONE,
      agoMinutes: 20,
    })
    const two = await seedOrderedTask(app.db, {
      folderId: folder,
      createdBy: owner.id,
      title: TWO,
      agoMinutes: 10,
    })
    const dated = await seedOrderedTask(app.db, {
      folderId: folder,
      createdBy: owner.id,
      title: 's22a ac267 dated',
      agoMinutes: 15,
      dueDate: '2026-12-01',
    })
    const done = await seedOrderedTask(app.db, {
      folderId: folder,
      createdBy: owner.id,
      title: 's22a ac267 done',
      agoMinutes: 15,
      status: 'completed',
    })
    const elsewhere = await seedOrderedTask(app.db, {
      folderId: other,
      createdBy: owner.id,
      title: 's22a ac267 elsewhere',
      agoMinutes: 10,
    })

    const before = await unscheduledTitles(owner, folder)
    expect(before, 'the list starts in Q2’s order, oldest first since the polish round of 2026-08-30').toEqual([ONE, TWO])

    expectStatus(
      await placeTask(owner, dated, { after_id: null, before_id: two }),
      409,
      'a dated task has no hand order: it is ordered by its date (spec 6 Q3, Q7)',
    )
    expectStatus(
      await placeTask(owner, done, { after_id: null, before_id: two }),
      409,
      'a completed task has no hand order: it is ordered by when it was finished (spec 6 Q6)',
    )
    expectStatus(
      await placeTask(owner, one, { after_id: elsewhere, before_id: null }),
      422,
      'a neighbour in another folder is not a peer, and the refusal must not say whether it exists (spec 10.2)',
    )
    expectStatus(
      await placeTask(owner, one, {
        after_id: '00000000-0000-4000-8000-000000000009',
        before_id: null,
      }),
      422,
      'a neighbour that does not exist is refused the same way as one that does',
    )
    expectStatus(
      await placeTask(owner, one, { after_id: one, before_id: null }),
      422,
      'a task is not its own neighbour',
    )
    expectStatus(
      await placeTask(owner, dated, { after_id: null, before_id: null }),
      409,
      'a body naming no neighbour at all still meets the state guard first',
    )

    expect(
      await unscheduledTitles(owner, folder),
      'every refusal wrote nothing: the sequence is the one it started with',
    ).toEqual(before)

    const outsider = await placeTask(stranger, one, {
      after_id: null,
      before_id: two,
    })
    expectStatus(
      outsider,
      404,
      'a non-member meets the 10.2 not-found shape, never 403',
    )
  })
})
