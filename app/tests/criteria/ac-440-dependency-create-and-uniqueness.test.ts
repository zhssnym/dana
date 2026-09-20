/*
AC-440: given two tasks a member can read, when one is given the other as a
blocker, then the relation is created once and read from both ends; a second
identical create adds nothing and answers the edge that is already there; and
one task carries as many blockers as it is given.

The three things a create has to get right, in one criterion because they are
one behaviour asked three ways. The pair is unique
(`task_dependencies_pair_key`), which is what makes the repeat harmless; the
relation is one row, which is what makes `depends_on` and `blocks` two views
rather than two tables; and the uniqueness is of the *pair*, which is what
lets a task have several blockers without any of them colliding.

**The repeat answers 200 rather than 201 or 409**, and that is the endpoint
decision this criterion pins. A retry after a lost response, and two people
adding the same blocker at once, are the same request twice; refusing the
second would make a client distinguish "my write failed" from "my write
already happened" by reading an error, which is the shape that produces
duplicate work everywhere else. The status is the whole of the difference: 201
means this call made it, 200 means it was already true.

Spec: 10.2, 10.3, 4.5. Issue #224.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast, createFolder, expectStatus } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import { createTaskOk } from '../support/tasks-harness.js'
import {
  createDependencyOk,
  expectEdgeShape,
  postDependency,
  readDependencies,
} from '../support/task-dependencies-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner'], 'ac440')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-440 one relation, created once, read from both ends', () => {
  test('a dependency is created and both projections show it', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const folderId = await createFolder(owner, 'ac440 the plan')
    const roof = await createTaskOk(
      owner,
      { title: 'ac440 put the roof on', folder_id: folderId },
      'the dependent task must stage (spec 7.6)',
    )
    const walls = await createTaskOk(
      owner,
      { title: 'ac440 build the walls', folder_id: folderId },
      'the blocking task must stage (spec 7.6)',
    )

    const edge = await createDependencyOk(
      owner,
      roof.id,
      walls.id,
      'a member of both ends creates the relation (issue #224)',
    )
    expect(
      edge.task?.id,
      'the created edge names the blocker as its far end, the dependent being the task in the path',
    ).toBe(walls.id)
    expect(
      edge.state,
      'a pending blocker leaves the dependency active (4.5 read as a relation state)',
    ).toBe('active')

    const fromDependent = await readDependencies(owner, roof.id)
    expect(
      fromDependent.depends_on.map((entry) => entry.task?.id),
      'the dependent waits on the blocker',
    ).toEqual([walls.id])
    expect(
      fromDependent.blocks,
      'and blocks nothing itself',
    ).toEqual([])

    const fromBlocker = await readDependencies(owner, walls.id)
    expect(
      fromBlocker.blocks.map((entry) => entry.task?.id),
      'the same row read from the other end is the blocker blocking the dependent, which is why there is one row and not two',
    ).toEqual([roof.id])
    expect(fromBlocker.depends_on, 'and the blocker waits on nothing').toEqual(
      [],
    )
    expect(
      fromBlocker.blocks[0]?.id,
      'both ends see one edge with one identity',
    ).toBe(edge.id)
  })

  test('a second identical create adds nothing and answers 200 with the edge', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const folderId = await createFolder(owner, 'ac440 the repeat')
    const later = await createTaskOk(
      owner,
      { title: 'ac440 hang the door', folder_id: folderId },
      'the dependent task must stage (spec 7.6)',
    )
    const earlier = await createTaskOk(
      owner,
      { title: 'ac440 fit the frame', folder_id: folderId },
      'the blocking task must stage (spec 7.6)',
    )

    const first = await createDependencyOk(
      owner,
      later.id,
      earlier.id,
      'the first create makes the relation (issue #224)',
    )
    const again = await postDependency(owner, later.id, earlier.id)
    expectStatus(
      again,
      200,
      'a create of a relation that already holds answers 200 rather than 201, nothing having been created, and rather than a conflict, the request having asked for a state that is already true',
    )
    const repeated = expectEdgeShape(again.json(), 'the repeated create body')
    expect(
      repeated.id,
      'and it answers the edge that was already there rather than a new one',
    ).toBe(first.id)

    const read = await readDependencies(owner, later.id)
    expect(
      read.depends_on.length,
      'the pair is unique, so the repeat left one row (task_dependencies_pair_key)',
    ).toBe(1)
  })

  test('one task carries several blockers', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const folderId = await createFolder(owner, 'ac440 the many')
    const launch = await createTaskOk(
      owner,
      { title: 'ac440 launch', folder_id: folderId },
      'the dependent task must stage (spec 7.6)',
    )
    const blockers: string[] = []
    for (const what of ['ac440 copy', 'ac440 pricing', 'ac440 legal']) {
      const blocker = await createTaskOk(
        owner,
        { title: what, folder_id: folderId },
        'a blocking task must stage (spec 7.6)',
      )
      blockers.push(blocker.id)
      await createDependencyOk(
        owner,
        launch.id,
        blocker.id,
        'uniqueness is of the pair, so a second blocker on the same task is an ordinary create',
      )
    }

    const read = await readDependencies(owner, launch.id)
    expect(
      read.depends_on.map((entry) => entry.task?.id).sort(),
      'every blocker is kept; the unique constraint is on the pair and not on the dependent',
    ).toEqual([...blockers].sort())
  })
})
