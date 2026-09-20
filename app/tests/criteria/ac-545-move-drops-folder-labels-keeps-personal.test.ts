/*
AC-545: when a Task changes Folder, its source Folder Label assignments are
removed atomically with the move, and its Personal Label assignments are
untouched.

## Two different things happen to two different kinds of row, for one reason

A Folder Label belongs to its Folder. It classifies that Folder's work, its
catalog is that Folder's catalog, and migration 0022 holds the assignment to
the Folder with a composite key — so an assignment cannot even survive the
move as a stored row. It goes.

A Personal Label is the viewer's own and spans Folders by design. The Task is
still the same Task, the viewer still calls it what they called it, and #208
R6A says so in as many words. It stays.

## "Atomically" is the part worth asserting rather than assuming

The move is one `UPDATE tasks` inside a transaction, and the DELETE runs
before it. If that ordering were reversed, or the DELETE were moved outside,
the database would refuse the pair rather than silently mis-scope it — which
means the honest assertion is not "no orphan row" but **the move succeeded and
the rows are gone**, since a failed move is how the wrong order presents. So
this file asserts the task's new folder_id and the emptiness of
`task_folder_labels` together, and a third arm asserts that a *refused* move
leaves the assignments standing.

Spec: 7.6, 4.5. Issue #227 area 3, #208 R6A.
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
import {
  createFolderLabel,
  createPersonalLabel,
  putTaskLabel,
  taskLabelsOf,
} from '../support/labels-harness.js'
import {
  moveTask,
  moveTaskOk,
  taskFolderLabelIds,
  taskPersonalLabelIds,
} from '../support/label-lifecycle-harness.js'
import { createTaskOk, requireTaskRow } from '../support/tasks-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'stranger'], 'ac525')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-545 a move leaves the folder’s labels behind and keeps the viewer’s', () => {
  test('source folder labels go, personal labels stay, and the task arrives', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const sourceId = await createFolder(owner, 'ac525 source')
    const destinationId = await createFolder(owner, 'ac525 destination')

    const shared = await createFolderLabel(owner, sourceId, {
      name: 'Source only',
    })
    const mine = await createPersonalLabel(owner, { name: 'ac525 mine' })

    const task = await createTaskOk(
      owner,
      { title: 'ac525 travelling work', folder_id: sourceId },
      'the task must stage (spec 7.6)',
    )
    expectStatus(
      await putTaskLabel(owner, task.id, shared.id),
      200,
      'the folder label attaches (spec 7.0)',
    )
    expectStatus(
      await putTaskLabel(owner, task.id, mine.id),
      200,
      'the personal label attaches (spec 7.0)',
    )

    await moveTaskOk(owner, task.id, destinationId)

    const row = await requireTaskRow(app.db, task.id)
    expect(
      String(row.folder_id),
      'the move happened: a wrong ordering of the DELETE and the UPDATE presents as a refused move rather than as a stale row (#227 area 3)',
    ).toBe(destinationId)
    expect(
      await taskFolderLabelIds(app.db, task.id),
      'and the source Folder Label assignment is gone with it',
    ).toEqual([])
    expect(
      await taskPersonalLabelIds(app.db, task.id, owner.id),
      'while the viewer’s own Personal assignment is exactly where it was: the Task is still the same Task (#208 R6A)',
    ).toEqual([mine.id])

    const projected = await taskLabelsOf(owner, task.id)
    expect(projected.folder, 'the read agrees: no Folder Labels').toEqual([])
    expect(
      projected.personal.map((label) => label.id),
      'and the Personal one still shows',
    ).toEqual([mine.id])
  })

  test('a co-member’s personal assignment survives a move made by someone else', async () => {
    const [owner, other] = (await cast.of(app)) as [Actor, Actor]
    await connect(app.db, owner.id, other.id)
    const sourceId = await createFolder(owner, 'ac525 shared source')
    const destinationId = await createFolder(owner, 'ac525 shared destination')
    await addMemberOk(owner, sourceId, other.id)
    await addMemberOk(owner, destinationId, other.id)

    const theirs = await createPersonalLabel(other, { name: 'ac525 theirs' })
    const task = await createTaskOk(
      owner,
      { title: 'ac525 their reading', folder_id: sourceId },
      'the task must stage (spec 7.6)',
    )
    expectStatus(
      await putTaskLabel(other, task.id, theirs.id),
      200,
      'the co-member labels it privately (spec 7.0)',
    )

    await moveTaskOk(owner, task.id, destinationId)

    expect(
      await taskPersonalLabelIds(app.db, task.id, other.id),
      'the mover does not clear somebody else’s private classification: "preserve Personal Label assignment rows" is about every owner’s, not the caller’s (#227 area 3)',
    ).toEqual([theirs.id])
    expect(
      (await taskLabelsOf(other, task.id)).personal.map((label) => label.id),
      'and the co-member still reads it on the moved task',
    ).toEqual([theirs.id])
  })

  test('a refused move leaves the assignments standing', async () => {
    const [owner, stranger] = (await cast.of(app)) as [Actor, Actor]
    const sourceId = await createFolder(owner, 'ac525 held source')
    const elsewhere = await createFolder(stranger, 'ac525 not yours')

    const shared = await createFolderLabel(owner, sourceId, { name: 'Held' })
    const task = await createTaskOk(
      owner,
      { title: 'ac525 stays put', folder_id: sourceId },
      'the task must stage (spec 7.6)',
    )
    expectStatus(
      await putTaskLabel(owner, task.id, shared.id),
      200,
      'the folder label attaches (spec 7.0)',
    )

    /* A destination the caller cannot reach. The move is refused, so nothing
       about the task changed — including its classification. A DELETE that
       ran outside the transaction, or ahead of the access check, would strip
       the labels off a task that never moved. */
    const refused = await moveTask(owner, task.id, elsewhere)
    expect(
      refused.status,
      'a move into a folder the caller is not in is refused (spec 10.2)',
    ).toBeGreaterThanOrEqual(400)
    expect(
      await taskFolderLabelIds(app.db, task.id),
      'and the source assignment is still there, the request being one unit',
    ).toEqual([shared.id])
  })
})
