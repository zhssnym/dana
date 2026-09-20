/*
AC-443: given two folders, when a person who can read both makes a dependency
across them, then it is allowed; and when somebody who can read only one end
reads or writes that relation, then the far task's title, folder, status and
id are withheld, the state reads `unknown`, and naming that task in a create
is refused exactly as naming a task that does not exist.

**This is the criterion the structural sweep cannot be.** `ac-397` drives every
route whose *path* carries an id and is blind to an id taken from the body, and
`blocking_task_id` is taken from the body. The gate on it is hand-written in
`domain/task-dependencies.ts`; this file is what proves it is there.

**The redaction is asserted against a blocker whose status the viewer must not
learn.** The private blocker is completed before the member reads, so an
implementation that redacted the summary and derived the state anyway would
report `satisfied` here and be caught. That is the leak that is easy to write
and invisible to read: `state` is a function of the far task's status, so
answering it for an unreadable far task is answering a question about that
task.

**And the refusal is indistinguishable from "no such task".** Both attempts
below answer 404 with the same body, which is 10.2's rule: a 403 on the real
id and a 404 on the invented one would let anybody test whether a uuid names a
task in somebody else's folder.

Spec: 10.2, 7.0, 5.4. Issue #224.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import {
  Cast,
  addMemberOk,
  connect,
  createFolder,
  expectStatus,
} from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import { createTaskOk, transitionOk } from '../support/tasks-harness.js'
import {
  createDependencyOk,
  postDependency,
  readDependencies,
} from '../support/task-dependencies-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'member'], 'ac443')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

/** A uuid that names nothing, for the comparison that makes 404 mean 404. */
const NOWHERE = '00000000-0000-4000-8000-000000000000'

describe('AC-443 both ends must be readable, and the far end is redacted', () => {
  test('a cross-folder dependency is allowed when the actor can read both ends', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const first = await createFolder(owner, 'ac443 the shared work')
    const second = await createFolder(owner, 'ac443 the other project')
    const dependent = await createTaskOk(
      owner,
      { title: 'ac443 write the release note', folder_id: first },
      'the dependent task must stage (spec 7.6)',
    )
    const blocker = await createTaskOk(
      owner,
      { title: 'ac443 cut the release', folder_id: second },
      'the blocking task must stage in another folder (spec 7.6)',
    )

    const edge = await createDependencyOk(
      owner,
      dependent.id,
      blocker.id,
      'a dependency crosses folders when the person making it is a member of both (issue #224)',
    )
    expect(
      edge.task?.folder.id,
      'and the far end reports its own folder, which is the first thing a reader asks about a task that is not in front of them',
    ).toBe(second)
  })

  test('a reader of one end learns nothing about the other', async () => {
    const [owner, member] = (await cast.of(app)) as [Actor, Actor]
    await connect(app.db, owner.id, member.id)
    const shared = await createFolder(owner, 'ac443 shared with the member')
    await addMemberOk(owner, shared, member.id)
    const private_ = await createFolder(owner, 'ac443 the private folder')

    const visible = await createTaskOk(
      owner,
      { title: 'ac443 the visible task', folder_id: shared },
      'the dependent task must stage in the shared folder (spec 7.6)',
    )
    const hidden = await createTaskOk(
      owner,
      { title: 'ac443 the secret budget approval', folder_id: private_ },
      'the blocking task must stage in the private folder (spec 7.6)',
    )
    await createDependencyOk(
      owner,
      visible.id,
      hidden.id,
      'the owner can read both ends, so the owner may relate them (issue #224)',
    )
    /* Completed, so that a state derived from it would say `satisfied` and a
       redacted one cannot. This is the whole point of the case. */
    await transitionOk(
      owner,
      hidden.id,
      'complete',
      'the private blocker is completed (spec 5.1)',
    )

    const ownersRead = await readDependencies(owner, visible.id)
    expect(
      ownersRead.depends_on[0]?.state,
      'the owner, who can read both ends, sees the real state',
    ).toBe('satisfied')

    const membersRead = await readDependencies(member, visible.id)
    expect(
      membersRead.depends_on.length,
      'the member sees that the task they can read has a blocker: the edge is theirs to see, only the far task is not',
    ).toBe(1)
    const redacted = membersRead.depends_on[0]
    expect(
      redacted?.task,
      'and the far task is withheld whole: no title, no folder, no status, and no id to go looking with',
    ).toBeNull()
    expect(
      redacted?.state,
      'and the state reads unknown rather than the far task\'s real one, because the state is a function of that task\'s status',
    ).toBe('unknown')
    expect(
      JSON.stringify(membersRead),
      'nothing in the answer carries the hidden task\'s id',
    ).not.toContain(hidden.id)
    expect(
      JSON.stringify(membersRead),
      'nor its title',
    ).not.toContain('secret budget approval')
    expect(
      JSON.stringify(membersRead),
      'nor the folder it lives in',
    ).not.toContain(private_)
  })

  test('naming an unreadable task as a blocker is refused exactly as naming no task at all', async () => {
    const [owner, member] = (await cast.of(app)) as [Actor, Actor]
    await connect(app.db, owner.id, member.id)
    const shared = await createFolder(owner, 'ac443 the member\'s reach')
    await addMemberOk(owner, shared, member.id)
    const private_ = await createFolder(owner, 'ac443 out of reach')

    const reachable = await createTaskOk(
      owner,
      { title: 'ac443 the reachable task', folder_id: shared },
      'the dependent task must stage (spec 7.6)',
    )
    const unreachable = await createTaskOk(
      owner,
      { title: 'ac443 the unreachable task', folder_id: private_ },
      'the blocking task must stage out of the member\'s reach (spec 7.6)',
    )

    const refusedReal = await postDependency(
      member,
      reachable.id,
      unreachable.id,
    )
    expectStatus(
      refusedReal,
      404,
      'the member may not relate a task they can read to one they cannot: the id in the body is gated by hand, the path sweep being blind to it',
    )
    const refusedFake = await postDependency(member, reachable.id, NOWHERE)
    expectStatus(refusedFake, 404, 'and a uuid naming nothing is refused too')
    expect(
      refusedReal.body,
      'with the same body, so the status cannot be used to test whether a uuid names somebody else\'s task (10.2)',
    ).toBe(refusedFake.body)

    const read = await readDependencies(owner, reachable.id)
    expect(
      read.depends_on,
      'and neither attempt wrote anything',
    ).toEqual([])
  })
})
