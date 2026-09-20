/*
AC-541: a Task duplicate does not newly attach an archived Label, of either
scope, while leaving the source's own archived assignments exactly where they
were.

## The rule, and the reason it is not "archived means gone"

#208 R5 makes archive non-destructive: an archived Label keeps every existing
assignment and keeps appearing on the Work that wears it, with `archived:
true`. What it loses is the right to be **newly applied** — `PUT` answers 409.
A duplicate is a new application: the copy did not exist a moment ago, and
every row written for it is a new row. So the copy comes out without them,
and the source is untouched.

**This is the half of "archived" that a Folder duplicate reads the other way**,
and AC-543 is that one. Both readings are in #227 area 9's single paragraph, so
the two criteria are written to be read together: if one of them is ever made
to agree with the other, one of the two rules has been lost.

Spec: 7.16, 7.0. Issue #227 areas 1 and 9, #208 R5.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast, createFolder, expectStatus } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import {
  archiveFolderLabel,
  archivePersonalLabel,
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
import { createTaskOk } from '../support/tasks-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner'], 'ac521')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-541 a duplicate is a new application, so archived labels stay behind', () => {
  test('archived folder and personal assignments do not travel; the active ones do', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const folderId = await createFolder(owner, 'ac521 retirements')

    const liveShared = await createFolderLabel(owner, folderId, {
      name: 'Live shared',
    })
    const retiredShared = await createFolderLabel(owner, folderId, {
      name: 'Retired shared',
    })
    const liveMine = await createPersonalLabel(owner, { name: 'Live mine' })
    const retiredMine = await createPersonalLabel(owner, {
      name: 'Retired mine',
    })

    const task = await createTaskOk(
      owner,
      { title: 'ac521 the source', folder_id: folderId },
      'the source task must stage (spec 7.6)',
    )
    /* Applied **before** the archive, because an archived Label cannot be
       newly applied at all: the fixture has to arrive the way a real one
       does, by being attached and then retired. */
    for (const labelId of [
      liveShared.id,
      retiredShared.id,
      liveMine.id,
      retiredMine.id,
    ]) {
      expectStatus(
        await putTaskLabel(owner, task.id, labelId),
        200,
        'every fixture assignment must attach while its label is active (spec 7.0)',
      )
    }
    expectStatus(
      await archiveFolderLabel(owner, folderId, retiredShared.id),
      200,
      'the folder label must archive (spec 7.0)',
    )
    expectStatus(
      await archivePersonalLabel(owner, retiredMine.id),
      200,
      'the personal label must archive (spec 7.0)',
    )

    /* The source still wears all four: archive is non-destructive, and this
       is what makes the assertion below about the *copy* rather than about
       an archive that quietly detached things. */
    const beforeCopy = await taskLabelsOf(owner, task.id)
    expect(
      beforeCopy.folder.map((label) => label.id).sort(),
      'the source keeps both Folder assignments across the archive (#208 R5)',
    ).toEqual([liveShared.id, retiredShared.id].sort())
    expect(
      beforeCopy.personal.map((label) => label.id).sort(),
      'and both Personal ones',
    ).toEqual([liveMine.id, retiredMine.id].sort())

    const copyId = await duplicateTaskOk(owner, task.id)

    expect(
      await taskFolderLabelIds(app.db, copyId),
      'the copy wears the live Folder Label and not the retired one (#227 areas 1 and 9)',
    ).toEqual([liveShared.id])
    expect(
      await taskPersonalLabelIds(app.db, copyId, owner.id),
      'and the live Personal Label and not the retired one',
    ).toEqual([liveMine.id])

    /* And the source is where it was, which is the other half of
       non-destructive: duplicating must not be a way to tidy the original. */
    expect(
      (await taskFolderLabelIds(app.db, task.id)).sort(),
      'the source’s own archived assignment survives the duplicate',
    ).toEqual([liveShared.id, retiredShared.id].sort())
    expect(
      (await taskPersonalLabelIds(app.db, task.id, owner.id)).sort(),
      'and so does its archived Personal one',
    ).toEqual([liveMine.id, retiredMine.id].sort())
  })
})
