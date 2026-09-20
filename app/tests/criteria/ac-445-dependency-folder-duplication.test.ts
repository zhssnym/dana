/*
AC-445: given a folder whose tasks depend on each other and on a task
elsewhere, when the folder is duplicated, then the relations between two
copied tasks are remade between the two copies, the relation with one end
outside the copied set does not travel, and no copied task points at an
original.

The accepted rule in one sentence: **relationships travel only when both ends
travel together.** Everything in this file is that sentence asked three ways.

**The third assertion is the one that matters most and is the easiest to pass
by accident.** A copy that kept the source's relation rows verbatim would
satisfy "the copy has a dependency" and would have bound the new folder's work
to the old folder's — every completion in the original silently unblocking
work in the copy, which is the outcome the rule exists to prevent. So the
edges are read as stored id pairs and every one of them is required to name
two tasks of the copy.

**The cross-folder edge is dropped rather than retained**, which is the other
half of the same rule: one end did not travel, so there is no relation to
remake, and keeping the original's task as the copy's blocker would be the
same binding seen from the other side.

Spec: 7.16, DES-198. Issue #224.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast, createFolder, expectStatus } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import { createTaskOk } from '../support/tasks-harness.js'
import {
  createDependencyOk,
  storedEdges,
  tasksByTitle,
} from '../support/task-dependencies-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner'], 'ac445')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-445 relations travel only when both ends travel', () => {
  test('a duplicated folder remaps its internal relations and drops the ones that straddle', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const source = await createFolder(owner, 'ac445 the template')
    const elsewhere = await createFolder(owner, 'ac445 somewhere else')

    const second = await createTaskOk(
      owner,
      { title: 'ac445 second coat', folder_id: source },
      'a task must stage (spec 7.6)',
    )
    const first = await createTaskOk(
      owner,
      { title: 'ac445 first coat', folder_id: source },
      'a task must stage (spec 7.6)',
    )
    const sanding = await createTaskOk(
      owner,
      { title: 'ac445 sanding', folder_id: source },
      'a task must stage (spec 7.6)',
    )
    const outside = await createTaskOk(
      owner,
      { title: 'ac445 buy the paint', folder_id: elsewhere },
      'the task that does not travel must stage in another folder (spec 7.6)',
    )

    // Two internal edges, forming a chain, and one that leaves the folder.
    await createDependencyOk(
      owner,
      second.id,
      first.id,
      'the second coat waits on the first (issue #224)',
    )
    await createDependencyOk(
      owner,
      first.id,
      sanding.id,
      'the first coat waits on the sanding (issue #224)',
    )
    await createDependencyOk(
      owner,
      sanding.id,
      outside.id,
      'and the sanding waits on a task in another folder (issue #224)',
    )

    const duplicated = await owner.browser.json(
      `/folders/${source}/duplicate`,
      'POST',
    )
    expectStatus(
      duplicated,
      201,
      'the folder duplicates (spec 7.16); no task here carries a date, so no zone is needed',
    )
    const copyId = String((duplicated.json() as { id?: unknown }).id)

    const copies = await tasksByTitle(app.db, copyId)
    const copiedSecond = copies.get('ac445 second coat')
    const copiedFirst = copies.get('ac445 first coat')
    const copiedSanding = copies.get('ac445 sanding')
    expect(
      [copiedSecond, copiedFirst, copiedSanding].every(
        (id) => typeof id === 'string',
      ),
      'the three tasks copied, which everything below is about',
    ).toBe(true)

    const copyIds = [
      String(copiedSecond),
      String(copiedFirst),
      String(copiedSanding),
    ]
    const carried = await storedEdges(app.db, copyIds)

    expect(
      carried.length,
      'two of the three relations travelled: the two with both ends inside the folder, and not the one reaching out of it',
    ).toBe(2)
    expect(
      carried
        .map((edge) => `${edge.dependent}->${edge.blocking}`)
        .sort(),
      'and they were remade between the copies, in the same shape the source had',
    ).toEqual(
      [
        `${String(copiedSecond)}->${String(copiedFirst)}`,
        `${String(copiedFirst)}->${String(copiedSanding)}`,
      ].sort(),
    )

    const originals = new Set([
      second.id,
      first.id,
      sanding.id,
      outside.id,
    ])
    const leaking = carried.filter(
      (edge) => originals.has(edge.dependent) || originals.has(edge.blocking),
    )
    expect(
      leaking,
      'and no copied task points at an original: a relation that kept the source\'s id would bind the new folder to the old one, every completion over there silently unblocking work over here',
    ).toEqual([])

    const outsideStill = await storedEdges(app.db, [outside.id])
    expect(
      outsideStill,
      'the source\'s own relation out of the folder is untouched; duplicating a folder changes nothing about the folder it was copied from',
    ).toEqual([{ dependent: sanding.id, blocking: outside.id }])
  })

  test('a single task duplicate carries no relation, one end not having travelled', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const folderId = await createFolder(owner, 'ac445 the one task')
    const dependent = await createTaskOk(
      owner,
      { title: 'ac445 the copied task', folder_id: folderId },
      'the dependent task must stage (spec 7.6)',
    )
    const blocker = await createTaskOk(
      owner,
      { title: 'ac445 the blocker that stays', folder_id: folderId },
      'the blocking task must stage (spec 7.6)',
    )
    await createDependencyOk(
      owner,
      dependent.id,
      blocker.id,
      'the relation is made before the copy (issue #224)',
    )

    const duplicated = await owner.browser.json(
      `/tasks/${dependent.id}/duplicate`,
      'POST',
    )
    expectStatus(duplicated, 201, 'the task duplicates (spec 7.16)')
    const copyId = String((duplicated.json() as { id?: unknown }).id)

    expect(
      await storedEdges(app.db, [copyId]),
      'and the copy waits on nothing: only one end travelled, so by the rule there is no relation to remake, and pointing the copy at the original\'s blocker is exactly what the rule forbids',
    ).toEqual([])
  })
})
