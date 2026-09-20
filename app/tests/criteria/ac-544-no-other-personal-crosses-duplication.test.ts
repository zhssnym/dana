/*
AC-544: no other member's Personal Label crosses a duplication, of either
kind, and the duplicate does not become a way to learn that they have one.

## Why this is its own criterion and not a clause of AC-540 and AC-542

Because of where the evidence has to come from. A Personal assignment is
invisible to everyone but its owner by construction — `taskLabelsFor` carries
`owner_user_id = <viewer>` — so a duplicate that copied a co-member's private
row would be invisible to **every API read this suite can make as the
duplicator**, and visible to the owner only as a Label appearing on a copy they
never touched. A criterion that reads the projection therefore proves nothing
here. This one reads `task_personal_labels` and `folder_personal_labels` whole,
by owner, which is the only query that can see the row that must not be there.

And then it reads the other person's own view as well, because the two failures
are different: a row written is caught by the table, and a row written into the
viewer's name is caught by the owner's read finding nothing new.

## Both directions

The owner duplicates, and then the member duplicates. An implementation that
copies "every Personal assignment on this task" is symmetric and fails both; an
implementation that copies "the folder owner's" passes one and fails the other.

Spec: 7.16, 7.0, 10.2. Issue #227 areas 1, 2 and 5, #208 R4.
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
  createPersonalLabel,
  putFolderLabel,
  putTaskLabel,
  taskLabelsOf,
} from '../support/labels-harness.js'
import {
  allFolderPersonalRows,
  allTaskPersonalRows,
  duplicateFolderOk,
  duplicateTaskOk,
  taskNamed,
  tasksByTitle,
} from '../support/label-lifecycle-harness.js'
import { createTaskOk } from '../support/tasks-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'member'], 'ac524')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-544 private classification stays with its owner', () => {
  test('neither duplicate carries the other person’s personal rows', async () => {
    const [owner, member] = (await cast.of(app)) as [Actor, Actor]
    await connect(app.db, owner.id, member.id)
    const sourceId = await createFolder(owner, 'ac524 shared folder')
    await addMemberOk(owner, sourceId, member.id)

    const ownersOwn = await createPersonalLabel(owner, { name: 'ac524 owner' })
    const membersOwn = await createPersonalLabel(member, {
      name: 'ac524 member',
    })

    const task = await createTaskOk(
      owner,
      { title: 'ac524 the work', folder_id: sourceId },
      'the task must stage (spec 7.6)',
    )
    expectStatus(
      await putTaskLabel(owner, task.id, ownersOwn.id),
      200,
      'the owner labels the task privately (spec 7.0)',
    )
    expectStatus(
      await putTaskLabel(member, task.id, membersOwn.id),
      200,
      'the member labels the same task privately (spec 7.0)',
    )
    expectStatus(
      await putFolderLabel(member, sourceId, membersOwn.id),
      200,
      'and labels the folder privately too (spec 7.0)',
    )

    /* The owner duplicates the task. */
    const taskCopyId = await duplicateTaskOk(owner, task.id)
    expect(
      await allTaskPersonalRows(app.db, taskCopyId),
      'the task copy holds exactly one Personal row, the duplicator’s: read over every owner, because the duplicator’s own view cannot show a row belonging to somebody else (#227 area 1)',
    ).toEqual([{ label_id: ownersOwn.id, owner_user_id: owner.id }])
    expect(
      (await taskLabelsOf(member, taskCopyId)).personal,
      'and the member, reading the copy themselves, sees none of their own on it',
    ).toEqual([])

    /* The owner duplicates the whole folder. */
    const folderCopyId = await duplicateFolderOk(owner, sourceId)
    expect(
      await allFolderPersonalRows(app.db, folderCopyId),
      'the folder copy holds no Personal row of the member’s, and the owner had none on the source (#227 area 2)',
    ).toEqual([])
    const copies = await tasksByTitle(app.db, folderCopyId)
    expect(
      await allTaskPersonalRows(app.db, taskNamed(copies, 'ac524 the work')),
      'and the copied task holds only the duplicator’s',
    ).toEqual([{ label_id: ownersOwn.id, owner_user_id: owner.id }])
  })

  test('the same holds when the member is the one duplicating', async () => {
    const [owner, member] = (await cast.of(app)) as [Actor, Actor]
    await connect(app.db, owner.id, member.id)
    const sourceId = await createFolder(owner, 'ac524 second folder')
    await addMemberOk(owner, sourceId, member.id)

    const ownersOwn = await createPersonalLabel(owner, { name: 'ac524 owner 2' })
    const membersOwn = await createPersonalLabel(member, {
      name: 'ac524 member 2',
    })

    const task = await createTaskOk(
      owner,
      { title: 'ac524 second work', folder_id: sourceId },
      'the task must stage (spec 7.6)',
    )
    expectStatus(
      await putTaskLabel(owner, task.id, ownersOwn.id),
      200,
      'the owner labels the task privately (spec 7.0)',
    )
    expectStatus(
      await putTaskLabel(member, task.id, membersOwn.id),
      200,
      'and so does the member (spec 7.0)',
    )
    expectStatus(
      await putFolderLabel(owner, sourceId, ownersOwn.id),
      200,
      'the owner labels the folder privately (spec 7.0)',
    )

    /* The **member** duplicates. A copy rule keyed on the folder owner rather
       than on the caller passes the case above and fails this one. */
    const taskCopyId = await duplicateTaskOk(member, task.id)
    expect(
      await allTaskPersonalRows(app.db, taskCopyId),
      'only the member’s own row is on their copy',
    ).toEqual([{ label_id: membersOwn.id, owner_user_id: member.id }])

    const folderCopyId = await duplicateFolderOk(member, sourceId)
    expect(
      await allFolderPersonalRows(app.db, folderCopyId),
      'the member’s folder copy carries none of the owner’s Personal rows: they had one on the source, and it is the owner’s (#227 area 2)',
    ).toEqual([])
    const copies = await tasksByTitle(app.db, folderCopyId)
    expect(
      await allTaskPersonalRows(app.db, taskNamed(copies, 'ac524 second work')),
      'and the copied task carries only the member’s',
    ).toEqual([{ label_id: membersOwn.id, owner_user_id: member.id }])
  })
})
