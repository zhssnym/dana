/*
AC-550: the account export carries the viewer's Personal Label catalog with
its archived state, each owned Folder's complete Folder Label vocabulary, and
the assignments that connect them to the Work already in the document.

## What "complete" means here and why it is not "in use"

An export is a file a person takes with them. A Folder's vocabulary is part of
what that Folder *is*, so a category nothing currently wears is exported and an
archived one is exported archived — for the same reason an archived definition
survives an archive at all, which is that the person narrowed their taxonomy on
purpose and an export that quietly widened it again would be wrong about their
account.

This is the same rule as the Folder duplicate's, and deliberately not the
workflow file's: a workflow file is handed to *other people* and carries only
the active vocabulary, because everything in it is about to be newly applied.
AC-547 pins that one. Two artefacts, two rules, one word.

## Ids rather than inlined definitions

Every assignment in the document is an id into a definition the document
already carries. A Label on forty tasks is one definition and forty references,
and — the part that matters — its archived state is written once and cannot
disagree with itself. So this file resolves the ids and asserts they land.

## The version

**The written-out literal below moved 5 → 6 on 2026-09-21, under hard stop 7**, and the
decision that moved is Ruling 7 of the #210 addendum, https://github.com/zhssnym/dana/issues/210#issuecomment-5757696835:
the export gains a `facets` collection, so the number a version-5 reader would refuse is a
different number from the one it knows. This criterion's subject -- the person's whole
classification -- is untouched, and every other assertion in the file is unchanged; what
moved is one number that describes the document's shape rather than anything about Labels.

`EXPORT_VERSION` moved 3 → 4 here. A version-3 reader's schema does not declare
any of these keys, so it would strip them and hand back a document with a
person's classification silently missing; the number is the mechanism by which
it is told to refuse instead. The criterion pins it, because a shape added
without the bump is the same defect wearing a green suite.

**It moved again, 4 → 5, at issue #230**, which adds the `responsibilities`
collection; 4 is still the number this file's own shape arrived at, and the
pin below is the document's current number rather than that one. The pin is
what makes the bump visible, so it moves in the same change that moves the
constant — this file asserts what the keys below are worth, not which release
put them there, and `shared/export.ts` carries the whole chain.

Spec: 7.22, 10.9. Issue #227 area 5, #208 R4 and R5.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import {
  Cast,
  EXPORT_PATH,
  exportOf,
  requestExport,
  startAuthTestApp,
} from '../support/export-harness.js'
import type { Actor, AuthTestApp } from '../support/export-harness.js'
import { createFolder, expectStatus } from '../support/folders-harness.js'
import {
  archiveFolderLabel,
  archivePersonalLabel,
  createFolderLabel,
  createPersonalLabel,
  putFolderLabel,
  putTaskLabel,
} from '../support/labels-harness.js'
import { createTaskOk } from '../support/tasks-harness.js'
import { EXPORT_VERSION, exportDocument } from '../../src/shared/export.js'

let app: AuthTestApp
const cast = new Cast(['owner'], 'ac530')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-550 the export carries the person’s whole classification', () => {
  test('personal catalog, owned folder vocabulary, and the assignments between them', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const folderId = await createFolder(owner, 'ac530 owned')

    const liveShared = await createFolderLabel(owner, folderId, {
      name: 'ac530 live shared',
      color: '#123456',
      description: 'the shared one',
    })
    const retiredShared = await createFolderLabel(owner, folderId, {
      name: 'ac530 retired shared',
    })
    /* Nothing wears this one, which is the case "complete vocabulary" is
       about and the case a per-assignment export would lose. */
    const unusedShared = await createFolderLabel(owner, folderId, {
      name: 'ac530 unused shared',
    })
    const liveMine = await createPersonalLabel(owner, {
      name: 'ac530 live mine',
    })
    const retiredMine = await createPersonalLabel(owner, {
      name: 'ac530 retired mine',
    })

    const task = await createTaskOk(
      owner,
      { title: 'ac530 the work', folder_id: folderId },
      'the task must stage (spec 7.6)',
    )
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
      await putFolderLabel(owner, folderId, liveMine.id),
      200,
      'and the live personal label attaches to the folder (spec 7.0)',
    )
    expectStatus(
      await archiveFolderLabel(owner, folderId, retiredShared.id),
      200,
      'the folder label archives (spec 7.0)',
    )
    expectStatus(
      await archivePersonalLabel(owner, retiredMine.id),
      200,
      'and so does the personal one (spec 7.0)',
    )

    const answer = await requestExport(owner)
    expectStatus(answer, 200, `GET ${EXPORT_PATH} must answer the document`)
    /*
    Parsed through the shared schema rather than cast, which is the one check
    that sees a key the server emits and the contract does not declare — the
    fault `shared/export.ts` records against itself for `calendar_zoom`, a
    response-shaped version of 11.15's request hazard. `exportOf` casts, so
    this file does the parse.
    */
    const parsed = exportDocument.safeParse(answer.json())
    expect(
      parsed.success ? 'valid' : JSON.stringify(parsed.error?.issues),
      'the document validates against the contract both sides import (7.22)',
    ).toBe('valid')
    const document = await exportOf(owner)

    expect(
      document.version,
      'the version moved with the shape: a reader that knows version 3 must refuse rather than strip every Label key and hand back a document quietly missing a person’s taxonomy (7.22, #227 area 5)',
    ).toBe(EXPORT_VERSION)
    expect(
      EXPORT_VERSION,
      'and the number is 6: 4 is what #227 took for the Label keys below, #230 moved it to 5 for the `responsibilities` collection, and issue #210 moved it to 6 for the `facets` one. The literal is written out rather than compared against the constant, which would agree with it whatever it said, so it moves in the same change the constant does (#230, #210)',
    ).toBe(6)

    const personal = document.personal_labels
    expect(
      personal.map((label) => [label.name, label.archived]),
      'the viewer’s whole Personal catalog, archived state and all (#227 area 5)',
    ).toEqual([
      ['ac530 live mine', false],
      ['ac530 retired mine', true],
    ])
    expect(
      personal.every((label) => label.scope === 'personal'),
      'every one of them personal-scoped',
    ).toBe(true)
    expect(
      personal.every((label) => label.folder_id === null),
      'and folderless, which is what personal scope means',
    ).toBe(true)

    const folder = document.folders.find((row) => row.id === folderId)
    expect(folder, 'the owned folder is in the document').toBeDefined()
    expect(
      (folder?.labels ?? []).map((label) => [label.name, label.archived]),
      'the folder’s complete vocabulary: the unused category and the retired one included, because an export is what the account *is* rather than what it is currently using (#227 area 5)',
    ).toEqual([
      ['ac530 live shared', false],
      ['ac530 unused shared', false],
      ['ac530 retired shared', true],
    ])
    expect(
      (folder?.labels ?? []).find(
        (label) => label.name === 'ac530 live shared',
      ),
      'with the colour and description the definition carries',
    ).toEqual({
      id: liveShared.id,
      scope: 'folder',
      name: 'ac530 live shared',
      color: '#123456',
      description: 'the shared one',
      archived: false,
      folder_id: folderId,
    })
    void unusedShared

    expect(
      folder?.personal_label_ids,
      'the viewer’s Personal Label on the folder, by id into the catalog above',
    ).toEqual([liveMine.id])

    const exported = folder?.tasks.find((row) => row.id === task.id)
    expect(exported, 'the task is in the document').toBeDefined()
    expect(
      [...(exported?.folder_label_ids ?? [])].sort(),
      'its Folder Label assignments, archived one included: archive is non-destructive and the assignment is a fact about the task',
    ).toEqual([liveShared.id, retiredShared.id].sort())
    expect(
      [...(exported?.personal_label_ids ?? [])].sort(),
      'and the viewer’s Personal ones',
    ).toEqual([liveMine.id, retiredMine.id].sort())

    /* Every id resolves inside the document, which is the property that makes
       ids-rather-than-definitions honest: a reference nothing defines would
       be a classification the person cannot read. */
    const definitions = new Set([
      ...personal.map((label) => label.id),
      ...(folder?.labels ?? []).map((label) => label.id),
    ])
    for (const id of [
      ...(exported?.personal_label_ids ?? []),
      ...(exported?.folder_label_ids ?? []),
      ...(folder?.personal_label_ids ?? []),
    ]) {
      expect(
        definitions.has(id),
        `every assignment id resolves to a definition the document carries: ${id}`,
      ).toBe(true)
    }
  })
})
