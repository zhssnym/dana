/*
AC-266: given a folder with no hand order, its unscheduled section reads in
Q2's row order; when a task is placed between two neighbours, the section
reads with it there, the sequence survives a fresh request, a repeat of the
same call changes nothing, and a task placed with no neighbour above it reads
first.

The last clause is the one that catches the cheap implementation. Until a
folder is arranged, every row's `position` is null and a null leads, so an
endpoint that wrote only the dragged row would put a task dropped at the top
below every unplaced row and the gesture would visibly fail. The amendment
therefore has the call assign keys to the rest of the list, in the order the
list already reads, before it places the moved one.

The repeat clause is the second guard: placing a task where it already is is
the drop a person makes by accident, and it must be a no-op rather than a
key that drifts a little every time.

`after_id` is the row immediately above the drop and `before_id` the row
immediately below, either being null where the drop had no neighbour on that
side.

Spec: 6 Q7 section 2 as amended, 7.6's order endpoint, 4.5's `position`
(RFC 0005 change control items 44 B4 and 46).
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast, createFolder } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import {
  placeTask,
  placeTaskOk,
  seedOrderedTask,
  unscheduledTitles,
} from './s22a-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner'], 's22a')

const ALPHA = 's22a ac266 alpha'
const BRAVO = 's22a ac266 bravo'
const CHARLIE = 's22a ac266 charlie'

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-266 a folder’s unscheduled list holds a hand order', () => {
  test('Q2 until arranged, then the arrangement, idempotent and reachable at the top', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const folder = await createFolder(owner, 's22a ac266 folder')

    const alpha = await seedOrderedTask(app.db, {
      folderId: folder,
      createdBy: owner.id,
      title: ALPHA,
      agoMinutes: 30,
    })
    const bravo = await seedOrderedTask(app.db, {
      folderId: folder,
      createdBy: owner.id,
      title: BRAVO,
      agoMinutes: 20,
    })
    const charlie = await seedOrderedTask(app.db, {
      folderId: folder,
      createdBy: owner.id,
      title: CHARLIE,
      agoMinutes: 10,
    })

    expect(
      await unscheduledTitles(owner, folder),
      'with no hand order the section is Q2’s: newest first (spec 6 Q2, Q7)',
    ).toEqual([CHARLIE, BRAVO, ALPHA])

    // Alpha moves from last to the middle, named by the two rows it landed
    // between rather than by an index into a list read a moment ago.
    await placeTaskOk(owner, alpha, {
      after_id: charlie,
      before_id: bravo,
    })
    const arranged = [CHARLIE, ALPHA, BRAVO]
    expect(
      await unscheduledTitles(owner, folder),
      'the placed task reads between exactly the two it was dropped between',
    ).toEqual(arranged)
    expect(
      await unscheduledTitles(owner, folder),
      'the arrangement is stored, not a property of one response',
    ).toEqual(arranged)

    const repeated = await placeTask(owner, alpha, {
      after_id: charlie,
      before_id: bravo,
    })
    expect(
      repeated.status,
      'placing a task where it already is is a no-op, not a drift',
    ).toBe(200)
    expect(
      await unscheduledTitles(owner, folder),
      'the repeat left the sequence alone',
    ).toEqual(arranged)

    // The top of an arranged list is reachable, which is the clause the
    // seeding pass exists for.
    await placeTaskOk(owner, bravo, { after_id: null, before_id: charlie })
    expect(
      await unscheduledTitles(owner, folder),
      'a task dropped with nothing above it reads first',
    ).toEqual([BRAVO, CHARLIE, ALPHA])
  })
})
