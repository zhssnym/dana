/*
AC-269: arranging a folder's unscheduled list by hand changes no other
query's answer, and an abandoned task inside an arranged folder keeps its
hand place rather than sorting below the pending ones.

This is the safety half of B4 and it asserts an absence, which is why it is
its own file. Item 44's ruling keeps "every one of section 6's eleven queries
and their byte-identical ordering guarantee untouched except the one that
reads a folder's unscheduled list", so the failure this catches is an
implementation that reached for `position` in an ORDER BY it did not have to
touch. Every view is read before the arrangement and again after it, and the
whole response body must be byte-identical, not merely the same set of rows
in the same order.

**Comparing whole bodies pins a second decision on purpose.** A placement
does not touch the moved task's `updated_at`: that column's two documented
consumers are the field-level last-write-wins tiebreak and Q8's search
recency key (4.5), and a row's place in one list is evidence for neither, so
an implementation that touched it would push every task of a rearranged
folder to the top of that person's search results. Byte-identical bodies
also catch `position` leaking onto TaskCard, which frozen 7.0 does not carry
and which no client needs, section 6 answering every view already ordered.

The second clause is the change, stated as sharply as the absence. Q2's row
order leads with status_rank, so an abandoned task sorts below the pending
ones; a hand order means it does not, inside the one section that carries
one. Both halves are here because a reader who saw only the absence would
conclude nothing had changed at all.

Spec: 6 (Q2, Q3, Q4, Q5, Q6, Q7, Q8 and the preamble's byte-identical
guarantee), 7.10, 7.6's order endpoint, RFC 0005 change control item 44 B4.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast, createFolder, expectStatus } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import {
  placeTaskOk,
  scheduledTitles,
  seedOrderedTask,
  unscheduledTitles,
} from './s22a-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner'], 's22a')

/** The six reads B4 must leave alone, each as the raw body it answers. All
 * carry tz because 7.0 requires it of every view endpoint, four of them
 * without reading a date. */
const UNTOUCHED = [
  '/views/tasks?tz=UTC',
  '/views/planned?tz=UTC',
  '/views/important?tz=UTC',
  '/views/all?tz=UTC',
  '/views/done?tz=UTC',
  '/search?tz=UTC&q=s22a%20ac269',
] as const

async function readAll(actor: Actor): Promise<string[]> {
  const bodies: string[] = []
  for (const path of UNTOUCHED) {
    const response = await actor.browser.json(path, 'GET')
    expectStatus(response, 200, `${path} answers before and after alike`)
    bodies.push(response.body)
  }
  return bodies
}

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-269 the hand order reaches exactly one query', () => {
  test('every other view answers what it answered, and the arranged section holds an abandoned row in place', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const folder = await createFolder(owner, 's22a ac269 folder')

    const one = await seedOrderedTask(app.db, {
      folderId: folder,
      createdBy: owner.id,
      title: 's22a ac269 one',
      agoMinutes: 30,
    })
    const two = await seedOrderedTask(app.db, {
      folderId: folder,
      createdBy: owner.id,
      title: 's22a ac269 two',
      agoMinutes: 20,
    })
    const three = await seedOrderedTask(app.db, {
      folderId: folder,
      createdBy: owner.id,
      title: 's22a ac269 three',
      agoMinutes: 10,
    })
    await seedOrderedTask(app.db, {
      folderId: folder,
      createdBy: owner.id,
      title: 's22a ac269 dated',
      agoMinutes: 25,
      dueDate: '2026-11-02',
    })
    await seedOrderedTask(app.db, {
      folderId: folder,
      createdBy: owner.id,
      title: 's22a ac269 dated too',
      agoMinutes: 5,
      dueDate: '2026-11-01',
    })

    const before = await readAll(owner)
    const scheduledBefore = await scheduledTitles(owner, folder)

    // A hand order that moves every row: the last becomes the first.
    await placeTaskOk(owner, one, { after_id: null, before_id: three })
    expect(
      await unscheduledTitles(owner, folder),
      'the arrangement took',
    ).toEqual(['s22a ac269 one', 's22a ac269 three', 's22a ac269 two'])

    expect(
      await readAll(owner),
      'no other view moved: the bodies are byte-identical (spec 6 preamble)',
    ).toEqual(before)
    expect(
      before.join('').includes('"position"'),
      'no view carries the stored key: frozen 7.0’s TaskCard does not gain one',
    ).toBe(false)
    expect(
      await scheduledTitles(owner, folder),
      'the folder’s own scheduled section is untouched: it is Q3’s order',
    ).toEqual(scheduledBefore)

    // The change itself: status_rank no longer leads inside an arranged
    // section, so abandoning a row leaves it where the hand put it.
    const abandoned = await owner.browser.json(
      `/tasks/${three}/abandon?tz=UTC`,
      'POST',
    )
    expectStatus(abandoned, 200, 'the task abandons (spec 5.1, 7.6)')
    expect(
      await unscheduledTitles(owner, folder),
      'an abandoned row keeps its hand place; Q2’s status_rank does not reclaim it',
    ).toEqual(['s22a ac269 one', 's22a ac269 three', 's22a ac269 two'])
    expect(two, 'the middle task is the one that did not move').toBeDefined()
  })
})
