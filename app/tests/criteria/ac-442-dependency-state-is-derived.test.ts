/*
AC-442: given a dependency, when the blocking task changes status, then the
relation's state follows it with no write to the relation — pending is active,
completed is satisfied, abandoned is unresolved and never satisfied, and
reopening a completed blocker makes it active again — and a dependency write
changes no task's status, dates, assignment or membership.

**The whole criterion is one claim: the state is derived.** Each transition is
driven through 5.1's own endpoints and the relation is then read back, with
the row's `created_at` checked against the one the create answered so that
"followed without a write" is a fact rather than a phrasing — a row that was
deleted and re-inserted to carry the new state would read correctly and fail
here.

**Abandoned is the one worth spelling out.** It is a terminal status like
completed and it is not done: work that was dropped did not unblock what was
waiting on it, and reporting `satisfied` would tell a person their dependency
had cleared when what happened is that nobody is going to do it. `unresolved`
is that distinction, and it is why there are three states and not two.

The last case is the boundary the issue draws around this whole slice. A
dependency is a relation and not a scheduler: nothing here moves a date,
completes anything, forbids a completion, or touches who the work belongs to.
It is asserted against the TaskDetail of both ends, before and after.

Spec: 4.5, 5.1, 7.6. Issue #224.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import {
  Cast,
  addMemberOk,
  connect,
  createFolder,
} from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import {
  createTaskOk,
  readTask,
  transitionOk,
} from '../support/tasks-harness.js'
import {
  createDependencyOk,
  readDependencies,
} from '../support/task-dependencies-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'member'], 'ac442')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-442 the dependency state is derived from the blocker', () => {
  test('pending is active, completed is satisfied, reopened is active again', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const folderId = await createFolder(owner, 'ac442 the lifecycle')
    const paint = await createTaskOk(
      owner,
      { title: 'ac442 paint the wall', folder_id: folderId },
      'the dependent task must stage (spec 7.6)',
    )
    const plaster = await createTaskOk(
      owner,
      { title: 'ac442 plaster the wall', folder_id: folderId },
      'the blocking task must stage (spec 7.6)',
    )
    const edge = await createDependencyOk(
      owner,
      paint.id,
      plaster.id,
      'painting waits on plastering (issue #224)',
    )

    const stateNow = async (): Promise<string | undefined> => {
      const read = await readDependencies(owner, paint.id)
      expect(
        read.depends_on.map((entry) => entry.id),
        'the same row throughout: a state that followed by being rewritten would have a new identity',
      ).toEqual([edge.id])
      expect(
        read.depends_on[0]?.created_at,
        'and the same creation instant, which is what "no write" means here',
      ).toBe(edge.created_at)
      return read.depends_on[0]?.state
    }

    expect(await stateNow(), 'a pending blocker leaves the dependency active').toBe(
      'active',
    )

    await transitionOk(
      owner,
      plaster.id,
      'complete',
      'the blocker completes (spec 5.1)',
    )
    expect(
      await stateNow(),
      'a completed blocker satisfies the dependency',
    ).toBe('satisfied')

    await transitionOk(
      owner,
      plaster.id,
      'uncomplete',
      'the blocker is reopened (spec 5.1)',
    )
    expect(
      await stateNow(),
      'reopening the blocker makes the dependency active again, which is what a derived state does and a stored one has to be told to do',
    ).toBe('active')
  })

  test('an abandoned blocker leaves the dependency unresolved and not satisfied', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const folderId = await createFolder(owner, 'ac442 the dropped')
    const ship = await createTaskOk(
      owner,
      { title: 'ac442 ship the feature', folder_id: folderId },
      'the dependent task must stage (spec 7.6)',
    )
    const research = await createTaskOk(
      owner,
      { title: 'ac442 do the research', folder_id: folderId },
      'the blocking task must stage (spec 7.6)',
    )
    await createDependencyOk(
      owner,
      ship.id,
      research.id,
      'shipping waits on the research (issue #224)',
    )

    await transitionOk(
      owner,
      research.id,
      'abandon',
      'the blocker is abandoned (spec 5.1)',
    )
    const read = await readDependencies(owner, ship.id)
    expect(
      read.depends_on[0]?.state,
      'an abandoned blocker did not finish, so the dependency is unresolved: the work it was waiting for is not coming',
    ).toBe('unresolved')
    expect(
      read.depends_on[0]?.state,
      'and it is emphatically not satisfied, which would tell somebody their dependency had cleared',
    ).not.toBe('satisfied')

    // And restoring it from abandoned brings the dependency back to active,
    // the same derivation read the other way.
    await transitionOk(
      owner,
      research.id,
      'restore',
      'the blocker is restored to pending (spec 5.1)',
    )
    const after = await readDependencies(owner, ship.id)
    expect(
      after.depends_on[0]?.state,
      'and a restored blocker is pending again, so the dependency is active again',
    ).toBe('active')
  })

  test('a dependency write alters no status, date, assignment or membership', async () => {
    const [owner, member] = (await cast.of(app)) as [Actor, Actor]
    await connect(app.db, owner.id, member.id)
    const folderId = await createFolder(owner, 'ac442 the untouched')
    await addMemberOk(owner, folderId, member.id)

    const dependent = await createTaskOk(
      owner,
      {
        title: 'ac442 the dependent',
        folder_id: folderId,
        due_date: '2030-03-04',
        due_time: '09:30',
        assignee_id: member.id,
        important: true,
      },
      'a fully dressed dependent task must stage (spec 7.6)',
    )
    const blocker = await createTaskOk(
      owner,
      {
        title: 'ac442 the blocker',
        folder_id: folderId,
        due_date: '2030-02-01',
        assignee_id: owner.id,
      },
      'a fully dressed blocking task must stage (spec 7.6)',
    )

    const before = [
      await readTask(owner, dependent.id),
      await readTask(owner, blocker.id),
    ]
    await createDependencyOk(
      owner,
      dependent.id,
      blocker.id,
      'the relation is made (issue #224)',
    )
    const after = [
      await readTask(owner, dependent.id),
      await readTask(owner, blocker.id),
    ]

    for (const [index, task] of after.entries()) {
      expect(
        task,
        'a dependency write is one row in one table: no status moves, no date shifts, nothing is completed or forbidden from completing, and nobody is reassigned',
      ).toEqual(before[index])
    }
  })
})
