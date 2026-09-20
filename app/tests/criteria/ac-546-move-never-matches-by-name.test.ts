/*
AC-546: a destination Folder holding a Label of exactly the same name, colour
and description as one the moved Task wore does not acquire it. Nothing about
a move infers, maps or merges a Label by name.

## Why this needs a criterion of its own

Because it is the helpful thing to do, and because it looks right. A Task
leaves "Launch", where it was "Urgent", and arrives in "Relaunch", which also
has an "Urgent". Carrying the classification across is what a reasonable person
would ask for and it is what a reasonable implementation would add — and it is
exactly what #208 forbids, because **scope is part of identity**: Launch's
"Urgent" and Relaunch's "Urgent" are two Labels, with two ids, meaning whatever
their own Folders' members decided they mean. A move that guessed they were the
same would be asserting something nobody said.

AC-545 proves the source assignments go. This file proves that nothing then
puts an equivalent one back — which AC-545 cannot see, since a destination with
no matching Label gives the mapping nothing to do.

The fixture makes the two Labels indistinguishable in every field a matcher
could read: same name, same case, same colour, same description. What is left
is the id, which is what identity is.

Spec: 7.6, 7.0. Issue #227 area 3, #208 R4 and R6A.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast, createFolder, expectStatus } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import {
  createFolderLabel,
  putTaskLabel,
  taskLabelsOf,
} from '../support/labels-harness.js'
import {
  moveTaskOk,
  taskFolderLabelIds,
} from '../support/label-lifecycle-harness.js'
import { createTaskOk } from '../support/tasks-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner'], 'ac526')

/** Identical in every field a name-matcher could compare. */
const TWIN = {
  name: 'Urgent',
  color: '#C02B2B',
  description: 'needs doing before the rest',
} as const

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-546 a same-named destination label is not applied', () => {
  test('two identical "Urgent"s stay two labels across a move', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const sourceId = await createFolder(owner, 'ac526 launch')
    const destinationId = await createFolder(owner, 'ac526 relaunch')

    const sourceUrgent = await createFolderLabel(owner, sourceId, TWIN)
    const destinationUrgent = await createFolderLabel(owner, destinationId, TWIN)
    expect(
      sourceUrgent.id,
      'two folders may each hold an "Urgent" and they are two Labels (#208 R4)',
    ).not.toBe(destinationUrgent.id)

    const task = await createTaskOk(
      owner,
      { title: 'ac526 the moving work', folder_id: sourceId },
      'the task must stage (spec 7.6)',
    )
    expectStatus(
      await putTaskLabel(owner, task.id, sourceUrgent.id),
      200,
      'the source’s Urgent attaches (spec 7.0)',
    )

    await moveTaskOk(owner, task.id, destinationId)

    expect(
      await taskFolderLabelIds(app.db, task.id),
      'the moved task wears no Folder Label at all: the source’s went with the Folder it belongs to, and the destination’s identically-named one was never applied, because a name is not an identity (#227 area 3, #208 R4)',
    ).toEqual([])
    expect(
      (await taskLabelsOf(owner, task.id)).folder,
      'and the read says the same',
    ).toEqual([])

    /* And the destination's own Label is untouched — not deleted, not
       renamed, not merged into anything. A person opening Relaunch still has
       their "Urgent" to apply by hand if that is what they meant. */
    const destinationTask = await createTaskOk(
      owner,
      { title: 'ac526 proof the label is usable', folder_id: destinationId },
      'a second task must stage (spec 7.6)',
    )
    expectStatus(
      await putTaskLabel(owner, destinationTask.id, destinationUrgent.id),
      200,
      'the destination’s own Urgent is still there and still applicable',
    )
  })

  test('nor across a move back, where the source label is the twin', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const first = await createFolder(owner, 'ac526 there')
    const second = await createFolder(owner, 'ac526 back')

    const there = await createFolderLabel(owner, first, TWIN)
    await createFolderLabel(owner, second, TWIN)

    const task = await createTaskOk(
      owner,
      { title: 'ac526 round trip', folder_id: first },
      'the task must stage (spec 7.6)',
    )
    expectStatus(
      await putTaskLabel(owner, task.id, there.id),
      200,
      'the first folder’s Urgent attaches (spec 7.0)',
    )

    await moveTaskOk(owner, task.id, second)
    await moveTaskOk(owner, task.id, first)

    expect(
      await taskFolderLabelIds(app.db, task.id),
      'a round trip does not restore it either: the assignment was deleted on the way out and nothing on the way back knows it existed (#227 area 3)',
    ).toEqual([])
  })
})
