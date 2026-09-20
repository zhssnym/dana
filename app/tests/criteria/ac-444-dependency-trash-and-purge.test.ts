/*
AC-444: given a task with dependencies, when it is trashed and restored, then
every relation it was part of comes back with it; and when it is deleted
permanently, then the relations that named it are gone.

The two halves of 7.13's "one path, two graves" seen from the relation. A soft
delete keeps the row so that a restore is lossless — a person who trashes a
task by accident and restores it should not have to rebuild what it was
waiting on — and only the permanent delete, which is a `DELETE FROM tasks`,
takes the rows with it through
`task_dependencies_dependent_task_id_fkey` and its sibling.

**The relation is invisible while the task is trashed, and that is not the
same as gone.** A trashed task is not readable, so the surviving end's read
redacts it exactly as it redacts a task in a folder the viewer is not in: the
edge is listed with `task` null and `state` unknown. The stored row is
asserted separately, because the wire cannot tell "kept but unreadable" from
"deleted" and only one of those is a lossless restore.

Spec: 7.13, 4.5. Issue #224.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast, createFolder, expectStatus } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import {
  createTaskOk,
  deleteTask,
  transitionOk,
} from '../support/tasks-harness.js'
import {
  countEdgesTouching,
  createDependencyOk,
  readDependencies,
} from '../support/task-dependencies-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner'], 'ac444')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-444 trash keeps the relation, the permanent delete takes it', () => {
  test('a trashed task keeps its relations and a restore brings them back', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const folderId = await createFolder(owner, 'ac444 the restoration')
    const dependent = await createTaskOk(
      owner,
      { title: 'ac444 send the invitations', folder_id: folderId },
      'the dependent task must stage (spec 7.6)',
    )
    const blocker = await createTaskOk(
      owner,
      { title: 'ac444 book the hall', folder_id: folderId },
      'the blocking task must stage (spec 7.6)',
    )
    const alsoBlocked = await createTaskOk(
      owner,
      { title: 'ac444 order the cake', folder_id: folderId },
      'a second dependent must stage, so the trashed task is an end of two relations (spec 7.6)',
    )
    const first = await createDependencyOk(
      owner,
      dependent.id,
      blocker.id,
      'the invitations wait on the hall (issue #224)',
    )
    const second = await createDependencyOk(
      owner,
      alsoBlocked.id,
      blocker.id,
      'and so does the cake (issue #224)',
    )

    const trashed = await deleteTask(owner, blocker.id)
    expectStatus(trashed, 204, 'DELETE /tasks/:id trashes the task (spec 7.13)')

    expect(
      await countEdgesTouching(app.db, blocker.id),
      'both rows are still there: a soft delete is a state on the task and touches no relation, which is what makes the restore lossless',
    ).toBe(2)

    const whileTrashed = await readDependencies(owner, dependent.id)
    expect(
      whileTrashed.depends_on[0]?.task,
      'the surviving end still sees an edge, with the trashed task withheld like any task it cannot read',
    ).toBeNull()
    expect(
      whileTrashed.depends_on[0]?.state,
      'and no state, the blocker not being readable',
    ).toBe('unknown')

    await transitionOk(
      owner,
      blocker.id,
      'restore',
      'the task comes back out of the trash (spec 7.13)',
    )

    const afterRestore = await readDependencies(owner, dependent.id)
    expect(
      afterRestore.depends_on.map((entry) => entry.id),
      'the same edge, by identity: nothing was rebuilt',
    ).toEqual([first.id])
    expect(
      afterRestore.depends_on[0]?.task?.id,
      'and it names the restored task again',
    ).toBe(blocker.id)
    expect(
      afterRestore.depends_on[0]?.state,
      'and reads its real state again',
    ).toBe('active')

    const fromBlocker = await readDependencies(owner, blocker.id)
    expect(
      fromBlocker.blocks.map((entry) => entry.id).sort(),
      'both relations the restored task was part of came back with it',
    ).toEqual([first.id, second.id].sort())
  })

  test('a permanent delete takes the relations with it', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const folderId = await createFolder(owner, 'ac444 the destruction')
    const survivor = await createTaskOk(
      owner,
      { title: 'ac444 the survivor', folder_id: folderId },
      'the dependent task must stage (spec 7.6)',
    )
    const doomed = await createTaskOk(
      owner,
      { title: 'ac444 the doomed', folder_id: folderId },
      'the blocking task must stage (spec 7.6)',
    )
    await createDependencyOk(
      owner,
      survivor.id,
      doomed.id,
      'the survivor waits on the doomed (issue #224)',
    )

    expectStatus(
      await deleteTask(owner, doomed.id),
      204,
      'the task is trashed first, the permanent delete being the second grave (spec 7.13)',
    )
    const destroyed = await owner.browser.api(`/trash/tasks/${doomed.id}`, {
      method: 'DELETE',
    })
    expectStatus(
      destroyed,
      204,
      'DELETE /trash/tasks/:id destroys the row (spec 7.13)',
    )

    expect(
      await countEdgesTouching(app.db, doomed.id),
      'the row is gone and its relations with it, which is the cascade doing what a hard delete means',
    ).toBe(0)
    const read = await readDependencies(owner, survivor.id)
    expect(
      read.depends_on,
      'and the survivor waits on nothing, rather than waiting on a ghost',
    ).toEqual([])
  })
})
