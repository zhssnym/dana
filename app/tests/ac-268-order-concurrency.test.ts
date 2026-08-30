/*
AC-268: two members placing two different tasks into the same gap of one
folder's unscheduled list at the same time both survive, the section lists
every task exactly once, and two reads answer the identical sequence.

The concurrency question was raised at item 44's sitting and agreed in terms:
"two people dragging one shared list must not corrupt each other's order".
This is the file that holds that sentence to something. The race is run as a
race, under Promise.all; a sequential pair would pass against any
implementation whatsoever.

**What this file can and cannot prove on the default backend.** 11.15 records
that PGlite is single-connection and that one connection serializes
statements rather than handler logic, so what genuinely needs a second
connection is a second concurrent transaction. Each placement runs in exactly
one transaction, so on PGlite the two queue and on CI's postgres:18 leg they
genuinely overlap. The assertions below are satisfied identically by both
legs and are the criterion's own: both placements survive, no task is lost or
doubled, and two reads agree. Asserting that an overlap was observed would be
a false red about the backend rather than a finding about the code. This is
the shape AC-021, AC-077 and AC-124 already carry.

**Why the answer is a tie rather than a lock.** Two placements into one gap
compute the same key by construction, which is a tie in `position`, and
section 6's preamble ends every order with id so that any two agents produce
byte-identical sequences. The tie is therefore resolved rather than
corrupting: what must never happen is a row losing its place or two readers
disagreeing, and both are asserted.

Spec: 6's preamble (the id tie-break), 6 Q7 as amended, 7.6's order endpoint,
11.15 and 11.10 (what each leg can show).
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import {
  Cast,
  addMemberOk,
  connect,
  createFolder,
} from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import { placeTask, seedOrderedTask, unscheduledTitles } from './s22a-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'partner'], 's22a')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-268 two people arranging one list at once', () => {
  test('both placements survive, nothing is lost or doubled, and two reads agree', async () => {
    const [owner, partner] = (await cast.of(app)) as [Actor, Actor]
    await connect(app.db, owner.id, partner.id)
    const folder = await createFolder(owner, 's22a ac268 folder')
    await addMemberOk(owner, folder, partner.id)

    // Q2 lists oldest first (newest until the polish round of 2026-08-30),
    // so the ages below descend and the seeded sequence reads head, mover
    // one, mover two, tail.
    const titles = ['head', 'mover one', 'mover two', 'tail'].map(
      (name) => `s22a ac268 ${name}`,
    )
    const ids: string[] = []
    for (const [index, title] of titles.entries()) {
      ids.push(
        await seedOrderedTask(app.db, {
          folderId: folder,
          createdBy: owner.id,
          title,
          agoMinutes: 40 - index * 10,
        }),
      )
    }
    const [head, moverOne, moverTwo, tail] = ids as [
      string,
      string,
      string,
      string,
    ]

    // Both movers are dropped into the one gap between the outer pair, from
    // two different sessions, at the same time.
    const [first, second] = await Promise.all([
      placeTask(owner, moverOne, { after_id: head, before_id: tail }),
      placeTask(partner, moverTwo, { after_id: head, before_id: tail }),
    ])
    expect(
      [first.status, second.status],
      'neither placement is refused: they are not in conflict, they are in one gap',
    ).toEqual([200, 200])

    const sequence = await unscheduledTitles(owner, folder)
    expect(
      [...sequence].sort(),
      'the section still holds every task exactly once',
    ).toEqual([...titles].sort())
    expect(
      sequence.indexOf('s22a ac268 head'),
      'the row above the gap is still above both movers',
    ).toBe(0)
    expect(
      sequence.indexOf('s22a ac268 tail'),
      'the row below the gap is still below both movers',
    ).toBe(3)

    const partnerSequence = await unscheduledTitles(partner, folder)
    expect(
      partnerSequence,
      'two readers of one list read one sequence: the order ends in id (spec 6 preamble)',
    ).toEqual(sequence)
  })
})
