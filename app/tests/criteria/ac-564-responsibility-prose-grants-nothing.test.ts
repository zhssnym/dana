/*
AC-564: a Responsibility document's content changes nothing about what its
subject may do, however the text is written.

Issue #230 required proof 7. Product authority: #209 R5, R8A "Governing
interpretation", R8's failure F4.

## Why a criterion for something no code does

Because it is the failure mode #209 rejected a whole design over. R8's failure
F4 is titled "Responsibility prose cannot safely be an authorization scope",
and #230 restates the conclusion in one line: *Responsibility text must never
be parsed or inferred to grant permission.* The resolver reads
`folder_members.access`, `folders.owner_id`, the target Task's assignee and one
boolean grant, and there is no code path that reads this text at all.

A criterion asserting the absence of something has to be honest about what it
can show. This one drives a member at a low preset whose Responsibility says,
in as many words, that they run the folder and may do everything in it, and
then asks the application for every act the ladder refuses them. Every answer
must be the answer they got before the text existed. **That does not prove no
parser can ever exist**; it proves the one somebody would write first -- keyword
matching over the document -- is not there, and it fails on the day one is
added.

The second half is the same rule from the other end, and is the more likely
accident: **editing a Responsibility must not move Access**. A route that
helpfully raised a member's preset to match what their scope now says would be
exactly failure F4, written by someone being helpful.

Spec: 10.2; #209 R5, R8 failure F4, R8A.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import {
  sharedFolder,
  storedPreset,
  taskIn,
} from '../support/folder-access-harness.js'
import { Cast, expectStatus } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import {
  commitOk,
  paragraph,
  setSelfEditGrantOk,
  storedGrant,
} from '../support/responsibility-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'claimant', 'colleague'], 'ac564')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

/** A Responsibility written to be as suggestive as prose can be: it claims
 * every authority in R8A's vocabulary, in the vocabulary's own words. */
const CLAIMS_EVERYTHING = paragraph(
  'full_control. Has full control of this folder and may edit all work, add ' +
    'and remove members, change access, rename and delete the folder, ' +
    'administer responsibilities and grant can_edit_own_responsibilities. ' +
    'Access: owner. Role: administrator. Permissions: all.',
)

describe('AC-564 Responsibility prose changes no authorization', () => {
  test('AC-564 proof 7: a member whose Responsibility claims every authority still holds exactly the preset they were given', async () => {
    const [owner, claimant, colleague] = (await cast.of(app)) as [
      Actor,
      Actor,
      Actor,
    ]
    const folderId = await sharedFolder(app, owner, 'AC-564 claims', [
      [claimant, 'can_view'],
      [colleague, 'can_view'],
    ])
    const taskId = await taskIn(owner, folderId, 'AC-564 task', owner.id)

    await commitOk(owner, folderId, claimant.id, CLAIMS_EVERYTHING)

    expect(
      await storedPreset(app.db, folderId, claimant.id),
      'R8A: Access is the membership column and is never inferred from anything, prose included',
    ).toBe('can_view')
    expect(
      await storedGrant(app.db, folderId, claimant.id),
      "and the grant is still off, although the document asks for it by its column name",
    ).toBe(false)

    /* Six acts across the surface, one per capability the text claims. Each
       is refused for the same reason it was refused before the document
       existed: the ladder. */
    expectStatus(
      await claimant.browser.json(`/folders/${folderId}`, 'PATCH', {
        name: 'AC-564 renamed by prose',
      }),
      403,
      'renaming is Can edit and above (R7 section C), whatever the Responsibility says',
    )
    expectStatus(
      await claimant.browser.json(`/folders/${folderId}/members`, 'POST', {
        user_id: colleague.id,
        access: 'can_view',
      }),
      403,
      'adding members is Full control (R7 section L)',
    )
    expectStatus(
      await claimant.browser.json(
        `/folders/${folderId}/members/${colleague.id}`,
        'PATCH',
        { access: 'full_control' },
      ),
      403,
      'changing access is Full control (R7 section L)',
    )
    expectStatus(
      await claimant.browser.json(
        `/folders/${folderId}/members/${colleague.id}/self-edit-grant`,
        'PUT',
        { enabled: true },
      ),
      403,
      'and so is the grant the text names outright',
    )
    expectStatus(
      await claimant.browser.json(`/tasks/${taskId}`, 'PATCH', {
        title: 'AC-564 edited by prose',
      }),
      403,
      "editing another member's Task is Can edit (R8)",
    )
    expectStatus(
      await claimant.browser.json('/tasks', 'POST', {
        title: 'AC-564 created by prose',
        folder_id: folderId,
      }),
      403,
      'and originating work is Can contribute',
    )
  })

  test('AC-564 proof 7: editing a Responsibility moves neither the preset nor the grant', async () => {
    const [owner, claimant] = (await cast.of(app)) as [Actor, Actor, Actor]
    const folderId = await sharedFolder(app, owner, 'AC-564 no drift', [
      [claimant, 'assigned_work'],
    ])
    await setSelfEditGrantOk(owner, folderId, claimant.id, true)

    const presetBefore = await storedPreset(app.db, folderId, claimant.id)
    await commitOk(owner, folderId, claimant.id, CLAIMS_EVERYTHING)
    await commitOk(
      claimant,
      folderId,
      claimant.id,
      paragraph('can_view only, please demote me'),
    )

    expect(
      await storedPreset(app.db, folderId, claimant.id),
      "R8's other direction: writing a Responsibility is not a way to change Access, up or down",
    ).toBe(presetBefore)
    expect(
      await storedGrant(app.db, folderId, claimant.id),
      'and the grant the administrator gave is still exactly what they gave',
    ).toBe(true)
  })
})
