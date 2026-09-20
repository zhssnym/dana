/*
AC-447: given a dependency, when either end asks for it to be removed, then
it is; a second removal answers 404; and an edge that does not touch the task
in the path cannot be removed through it.

**Removal takes the repository's normal delete semantics rather than an
idempotent 204**, which is the endpoint decision this criterion pins:
`DELETE /connections/:userId` and `DELETE /tasks/:id` both answer 404 for a
thing that is not there, and a fourth grammar on the same surface would be one
more thing for a client to remember. A caller naming an edge that is not there
has asked for something that was never true, which is different from a create
asking for something that is already true — that one is answered, because the
state it asked for holds.

**Either end may remove it**, which follows from there being one row. A
relation is as much the blocker's as the dependent's, and there is no reading
of 5.4 under which a member may add a blocker and not take one off.

**The last case is the authorization one**, and it is the reason the statement
carries a predicate rather than trusting the id: dependency ids are uuids like
any other, and a member of one folder must not be able to cut a relation
between two tasks in another by naming its edge on a task of their own.

Spec: 7.3's delete grammar, 5.4, 10.2. Issue #224.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast, createFolder, expectStatus } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import { createTaskOk } from '../support/tasks-harness.js'
import {
  countEdgesTouching,
  createDependencyOk,
  deleteDependency,
  readDependencies,
} from '../support/task-dependencies-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner'], 'ac447')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-447 either end removes the relation, once', () => {
  test('the dependent removes it, and a second removal is 404', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const folderId = await createFolder(owner, 'ac447 the undo')
    const dependent = await createTaskOk(
      owner,
      { title: 'ac447 the dependent', folder_id: folderId },
      'the dependent task must stage (spec 7.6)',
    )
    const blocker = await createTaskOk(
      owner,
      { title: 'ac447 the blocker', folder_id: folderId },
      'the blocking task must stage (spec 7.6)',
    )
    const edge = await createDependencyOk(
      owner,
      dependent.id,
      blocker.id,
      'the relation is made (issue #224)',
    )

    expectStatus(
      await deleteDependency(owner, dependent.id, edge.id),
      204,
      'the dependent removes the blocker it no longer waits on',
    )
    expect(
      await countEdgesTouching(app.db, dependent.id),
      'and the row is gone',
    ).toBe(0)
    expectStatus(
      await deleteDependency(owner, dependent.id, edge.id),
      404,
      'a second removal names an edge that is not there, which is 404 on this repository\'s ordinary delete grammar',
    )
  })

  test('the blocker removes it too', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const folderId = await createFolder(owner, 'ac447 the other end')
    const dependent = await createTaskOk(
      owner,
      { title: 'ac447 waiting', folder_id: folderId },
      'the dependent task must stage (spec 7.6)',
    )
    const blocker = await createTaskOk(
      owner,
      { title: 'ac447 blocking', folder_id: folderId },
      'the blocking task must stage (spec 7.6)',
    )
    const edge = await createDependencyOk(
      owner,
      dependent.id,
      blocker.id,
      'the relation is made (issue #224)',
    )

    expectStatus(
      await deleteDependency(owner, blocker.id, edge.id),
      204,
      'the blocking end removes it, there being one row and both tasks party to it',
    )
    const read = await readDependencies(owner, dependent.id)
    expect(read.depends_on, 'and both ends see it gone').toEqual([])
  })

  test('an edge that does not touch the task in the path cannot be removed through it', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const folderId = await createFolder(owner, 'ac447 the bystander')
    const dependent = await createTaskOk(
      owner,
      { title: 'ac447 related A', folder_id: folderId },
      'a related task must stage (spec 7.6)',
    )
    const blocker = await createTaskOk(
      owner,
      { title: 'ac447 related B', folder_id: folderId },
      'a related task must stage (spec 7.6)',
    )
    const bystander = await createTaskOk(
      owner,
      { title: 'ac447 unrelated', folder_id: folderId },
      'an unrelated task must stage (spec 7.6)',
    )
    const edge = await createDependencyOk(
      owner,
      dependent.id,
      blocker.id,
      'the relation is made between the other two (issue #224)',
    )

    expectStatus(
      await deleteDependency(owner, bystander.id, edge.id),
      404,
      'the edge is real and the caller can read every task involved, and it still refuses: the statement removes an edge only through a task it actually touches, which is what stops an id from being enough',
    )
    expect(
      await countEdgesTouching(app.db, dependent.id),
      'and the relation stands',
    ).toBe(1)
  })
})
