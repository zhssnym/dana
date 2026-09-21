/*
AC-562: a current Full-control member writes any active member's Responsibility
document; Can edit -- which may change every piece of shared Work in the folder
-- writes nobody's, their own included.

Issue #230 required proofs 2 and 3. Product authority: #209 R7 sections L and
O, R10.

## The line, and why it is the same line AC-512 draws

R8A's ladder breaks once in a way that is not about how much Work a member may
change: the step from Can edit to Full control is the step from Work to people.
A Responsibility document is **about a person** -- it is the authoritative
statement of what they are expected to handle -- so R10 puts writing it on the
people side of that break, and R7 section O says what the one exception is:
"Without the grant, only Full control may edit that Responsibility document."

The consequence that looks surprising until it is said out loud, and is the
case most likely to be got wrong: **a Can-edit member cannot write their own**.
Nothing about authoring your own scope of work is an ordinary Work act, and the
route back is R7 section O's explicit grant rather than the ladder.

Every refusal here is 403 rather than 404: the actor is a member, so a refusal
cannot still be protecting the folder's existence, and 10.2 wants it to say why.

Spec: 7.4, 10.2; #209 R7 sections L and O, R10.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { sharedFolder, setAccessOk } from '../support/folder-access-harness.js'
import { Cast, expectStatus } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import {
  commitOk,
  documentRows,
  paragraph,
  putResponsibility,
  readResponsibility,
  readResponsibilityHistory,
  standingOf,
} from '../support/responsibility-harness.js'
import type { FolderAccessPreset } from '../../src/shared/folder-access.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'deputy', 'editor', 'worker'], 'ac562')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

interface Stage {
  owner: Actor
  deputy: Actor
  editor: Actor
  worker: Actor
  folderId: string
}

async function stage(name: string): Promise<Stage> {
  const [owner, deputy, editor, worker] = (await cast.of(app)) as [
    Actor,
    Actor,
    Actor,
    Actor,
  ]
  const folderId = await sharedFolder(app, owner, name, [
    [deputy, 'full_control'],
    [editor, 'can_edit'],
    [worker, 'assigned_work'],
  ])
  return { owner, deputy, editor, worker, folderId }
}

describe('AC-562 Full control writes Responsibilities and Can edit writes none', () => {
  test('AC-562 proof 2: Full control creates and then edits another active member\'s Responsibility', async () => {
    const { deputy, worker, folderId } = await stage('AC-562 full control')

    const created = await commitOk(
      deputy,
      folderId,
      worker.id,
      paragraph('Runs the morning line'),
    )
    expect(
      created.committed,
      "#230 proof 2: a Full-control member who is not the owner writes an active member's Responsibility",
    ).toBe(true)
    expect(created.responsibility.revision_no).toBe(1)

    const edited = await commitOk(
      deputy,
      folderId,
      worker.id,
      paragraph('Runs the morning line and the afternoon changeover'),
    )
    expect(
      edited.committed,
      'and edits it again afterwards, which is the same authority applied twice',
    ).toBe(true)
    expect(edited.responsibility.revision_no).toBe(2)
    expect(
      edited.responsibility.updated_by?.id,
      'the document names who last wrote it',
    ).toBe(deputy.id)
  })

  test('AC-562 proof 2: Full control writes its own, needing no grant to do it', async () => {
    const { owner, folderId } = await stage('AC-562 own')
    const mine = await commitOk(
      owner,
      folderId,
      owner.id,
      paragraph('Holds the contract'),
    )
    expect(
      mine.committed,
      "R7 section O's grant exists for members *below* Full control; Full control already writes any active member's, which includes their own",
    ).toBe(true)
  })

  test("AC-562 proof 3: Can edit cannot write another member's Responsibility, nor their own", async () => {
    const { editor, worker, folderId } = await stage('AC-562 can edit')
    const base = (await standingOf(editor, folderId, worker.id)).revision

    const other = await putResponsibility(
      editor,
      folderId,
      worker.id,
      paragraph('Reassigned by an editor'),
      base,
    )
    expectStatus(
      other,
      403,
      "#230 proof 3: Can edit may change every piece of shared Work and administers no people, so another member's Responsibility is refused",
    )

    const own = (await standingOf(editor, folderId, editor.id)).revision
    const mine = await putResponsibility(
      editor,
      folderId,
      editor.id,
      paragraph('Written by the editor about themselves'),
      own,
    )
    expectStatus(
      mine,
      403,
      'R7 section O: without the explicit grant, only Full control writes a Responsibility document -- being Can edit is not a way round it, and neither is being the subject',
    )

    expect(
      await documentRows(app.db, folderId),
      'and neither refusal wrote anything',
    ).toEqual([])
  })

  test('AC-562 proof 3: every preset below Full control is refused, and every one of them may still read', async () => {
    const { owner, deputy, editor, worker, folderId } = await stage(
      'AC-562 ladder',
    )
    await commitOk(owner, folderId, worker.id, paragraph('The standing scope'))

    const below: FolderAccessPreset[] = [
      'can_edit',
      'can_contribute',
      'assigned_work',
      'can_comment',
      'can_view',
    ]
    for (const preset of below) {
      await setAccessOk(deputy, folderId, editor.id, preset)
      const base = (await standingOf(editor, folderId, worker.id)).revision
      const attempt = await putResponsibility(
        editor,
        folderId,
        worker.id,
        paragraph(`written at ${preset}`),
        base,
      )
      expectStatus(
        attempt,
        403,
        `#209 R7 section O: ${preset} may not write a Responsibility document`,
      )
      /* And the read is admitted at every one of them, which is R5's
         "Folder-visible in M1" and is the half that would be easy to lose by
         gating the whole surface at Full control. */
      expectStatus(
        await readResponsibility(editor, folderId, worker.id),
        200,
        `#209 R5: the Responsibility document is Folder-visible, so ${preset} reads it`,
      )
      expectStatus(
        await readResponsibilityHistory(editor, folderId, worker.id),
        200,
        `#209 R10 "Prior versions": ${preset} is a current member and so may inspect prior revisions`,
      )
    }

    const stored = await documentRows(app.db, folderId, worker.id)
    expect(
      stored[0]?.current_revision_no,
      'five refusals later the document is still the one revision Full control wrote',
    ).toBe(1)
  })
})
