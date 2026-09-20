/*
AC-540: a Task duplicated inside its own Folder wears the Folder Labels the
source wore, **under the same ids**, and the duplicator's own Personal Labels,
and nothing else.

## Why "the same ids" is the assertion and not "the same names"

The copy stays in the source's Folder, so the Folder's vocabulary is already
the copy's vocabulary. An implementation that created a second "Urgent" beside
the first would look right in every screenshot and would be the name-merging
#208 forbids, read backwards: two Labels a person cannot tell apart, in one
catalog that is supposed to refuse exactly that. So this file reads the
`task_folder_labels` rows and compares ids, not the projection and its names.

## And why it reads the rows at all

`GET /tasks/:id` shows the viewer their own Personal Labels and the Folder's.
It cannot show a Personal row belonging to somebody else — that is the whole
point of the projection — so a duplicate that copied a co-member's private
classification would be invisible to every API read this criterion could make.
AC-544 is the criterion for that rule and it reads the table; this one reads
the table too, so that "and nothing else" means the rows rather than the view.

Spec: 7.16 (`POST /tasks/:id/duplicate`), 7.0, 10.2. Issue #227 area 1,
#208 R4 and R6A.
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
  createFolderLabel,
  createPersonalLabel,
  putTaskLabel,
  taskLabelsOf,
} from '../support/labels-harness.js'
import {
  duplicateTaskOk,
  taskFolderLabelIds,
  taskPersonalLabelIds,
} from '../support/label-lifecycle-harness.js'
import { expectStatus } from '../support/folders-harness.js'
import { createTaskOk } from '../support/tasks-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'member'], 'ac520')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-540 a task duplicate keeps its classification', () => {
  test('folder labels keep their ids, the duplicator’s personal labels come too', async () => {
    const [owner, member] = (await cast.of(app)) as [Actor, Actor]
    await connect(app.db, owner.id, member.id)
    const folderId = await createFolder(owner, 'ac520 launch')
    await addMemberOk(owner, folderId, member.id)

    const shared = await createFolderLabel(owner, folderId, { name: 'Urgent' })
    const unused = await createFolderLabel(owner, folderId, { name: 'Later' })
    const mine = await createPersonalLabel(owner, { name: 'Reading' })

    const task = await createTaskOk(
      owner,
      { title: 'ac520 book the room', folder_id: folderId },
      'the source task must stage (spec 7.6)',
    )
    expectStatus(
      await putTaskLabel(owner, task.id, shared.id),
      200,
      'the folder label must attach to the source (spec 7.0)',
    )
    expectStatus(
      await putTaskLabel(owner, task.id, mine.id),
      200,
      'the personal label must attach to the source (spec 7.0)',
    )

    const copyId = await duplicateTaskOk(owner, task.id)
    expect(copyId, 'the copy is a new row').not.toBe(task.id)

    expect(
      await taskFolderLabelIds(app.db, copyId),
      'the copy wears the source’s Folder Label, under the same id: the copy is in the same Folder, so the vocabulary is already its own (#227 area 1)',
    ).toEqual([shared.id])
    expect(
      await taskPersonalLabelIds(app.db, copyId, owner.id),
      'the duplicator’s own Personal Label comes across (#227 area 1)',
    ).toEqual([mine.id])

    /* The projection agrees with the rows, which is what a person actually
       sees; and the Folder Label nobody applied is still nobody's. */
    const projected = await taskLabelsOf(owner, copyId)
    expect(
      projected.folder.map((label) => label.id),
      'the copy’s TaskDetail shows the same Folder Label',
    ).toEqual([shared.id])
    expect(
      projected.personal.map((label) => label.id),
      'and the duplicator’s own Personal Label',
    ).toEqual([mine.id])
    expect(
      projected.folder.some((label) => label.id === unused.id),
      'a Folder Label the source never wore is not applied by the copy',
    ).toBe(false)
  })

  test('a member duplicating carries their own personal labels, not the author’s', async () => {
    const [owner, member] = (await cast.of(app)) as [Actor, Actor]
    await connect(app.db, owner.id, member.id)
    const folderId = await createFolder(owner, 'ac520 second')
    await addMemberOk(owner, folderId, member.id)

    const shared = await createFolderLabel(owner, folderId, { name: 'Blocked' })
    const ownersOwn = await createPersonalLabel(owner, { name: 'Owner axis' })
    const membersOwn = await createPersonalLabel(member, { name: 'Member axis' })

    const task = await createTaskOk(
      owner,
      { title: 'ac520 shared work', folder_id: folderId },
      'the source task must stage (spec 7.6)',
    )
    for (const [actor, labelId] of [
      [owner, shared.id],
      [owner, ownersOwn.id],
      [member, membersOwn.id],
    ] as const) {
      expectStatus(
        await putTaskLabel(actor, task.id, labelId),
        200,
        'every fixture assignment must attach (spec 7.0)',
      )
    }

    /* The **member** makes the copy. Driven from the member's side rather than
       the owner's because an implementation that copied "the labels on the
       task" rather than "the duplicator's labels on the task" passes every
       case an owner drives. */
    const copyId = await duplicateTaskOk(member, task.id)

    expect(
      await taskPersonalLabelIds(app.db, copyId, member.id),
      'the duplicator’s own Personal Label crosses',
    ).toEqual([membersOwn.id])
    expect(
      await taskPersonalLabelIds(app.db, copyId, owner.id),
      'and the author’s does not, read from the table because no API read of the member’s could show it either way (#227 area 1)',
    ).toEqual([])
    expect(
      await taskFolderLabelIds(app.db, copyId),
      'the Folder Label is the Folder’s and crosses whoever copied',
    ).toEqual([shared.id])
  })
})
