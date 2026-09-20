/*
AC-563: the self-edit grant defaults off, is Full control's to give, lets the
member it names edit **only their own** Responsibility whatever their base
Access -- and widens nothing else at all.

Issue #230 required proofs 4, 5 and 6. Product authority: #209 R7 section O.

## Both halves, because only one of them is the dangerous one

R7 section O is two sentences and a project usually only tests the first. "If
enabled, a member may edit their own shared Responsibility document even if
their base preset is Assigned work, Can comment or Can view" is the half that
fails loudly if it is missing: somebody cannot do the thing they were granted.
"It must not silently widen any other Work permission" is the half that fails
*silently*, and a grant that quietly bought a Can-view member the right to edit
Tasks would pass every criterion written about the first half.

So this file proves the second half by **enumeration rather than by sampling**.
Every action in the fixed vocabulary is asked twice of the same facts -- once
with the grant and once without -- and exactly one answer is allowed to differ.
A future action that accidentally reads the grant fails here on the day it is
added, which is the only property that makes a claim like "widens nothing"
worth writing down.

Three narrowings are proved separately at the route, because the resolver could
be right and a caller still hand it the wrong target: the grant is **not** a
licence over somebody else's document, it is **not** transferable between
folders, and it is **revocable**, with the revocation taking effect on the next
write rather than on the next session.

Spec: 7.4, 10.2; #209 R7 section O, R8A.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { sharedFolder } from '../support/folder-access-harness.js'
import { Cast, expectStatus } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import {
  commitOk,
  paragraph,
  putResponsibility,
  recordOf,
  setSelfEditGrant,
  setSelfEditGrantOk,
  standingOf,
  storedGrant,
  transitionsOf,
} from '../support/responsibility-harness.js'
import {
  FOLDER_ACTIONS,
  mayPerform,
} from '../../src/server/domain/folder-access.js'
import { FOLDER_ACCESS_PRESETS } from '../../src/shared/folder-access.js'
import type { FolderAccessPreset } from '../../src/shared/folder-access.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'viewer', 'colleague'], 'ac563')

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
  viewer: Actor
  colleague: Actor
  folderId: string
}

async function stage(
  name: string,
  preset: FolderAccessPreset = 'can_view',
): Promise<Stage> {
  const [owner, viewer, colleague] = (await cast.of(app)) as [
    Actor,
    Actor,
    Actor,
  ]
  const folderId = await sharedFolder(app, owner, name, [
    [viewer, preset],
    [colleague, 'can_contribute'],
  ])
  return { owner, viewer, colleague, folderId }
}

describe('AC-563 the self-edit grant is off by default and narrow when on', () => {
  test('AC-563 proof 6: a member added at any preset arrives with the grant off', async () => {
    const { owner, viewer, colleague, folderId } = await stage('AC-563 default')
    expect(
      await storedGrant(app.db, folderId, viewer.id),
      "#230: the grant defaults OFF, and the column's DEFAULT false is what makes that true of every path that inserts a membership row",
    ).toBe(false)
    expect(await storedGrant(app.db, folderId, colleague.id)).toBe(false)
    expect(
      await storedGrant(app.db, folderId, owner.id),
      'the owner too: they need no grant, and a default that made an exception for them would be a rule with a hole in it',
    ).toBe(false)
  })

  test('AC-563 proof 4: a Can-view member cannot write their own Responsibility until the grant is on, and can the moment it is', async () => {
    const { owner, viewer, folderId } = await stage('AC-563 grant')

    const before = (await standingOf(viewer, folderId, viewer.id)).revision
    expectStatus(
      await putResponsibility(
        viewer,
        folderId,
        viewer.id,
        paragraph('Written without a grant'),
        before,
      ),
      403,
      '#230 proof 4: a member below Full control may not self-edit unless the explicit grant is on',
    )

    await setSelfEditGrantOk(owner, folderId, viewer.id, true)
    expect(await storedGrant(app.db, folderId, viewer.id)).toBe(true)

    const written = await commitOk(
      viewer,
      folderId,
      viewer.id,
      paragraph('Checks the gate log each morning'),
    )
    expect(
      written.committed,
      "R7 section O: with the grant on, the member writes their own whatever their base Access -- Can view included, which is the preset the rule names last and means most",
    ).toBe(true)
    expect(written.responsibility.updated_by?.id).toBe(viewer.id)
  })

  test('AC-563 proof 5: the grant is over their own document and nobody else\'s, in this folder and no other', async () => {
    const { owner, viewer, colleague, folderId } = await stage('AC-563 own only')
    await setSelfEditGrantOk(owner, folderId, viewer.id, true)
    await commitOk(owner, folderId, colleague.id, paragraph('Their scope'))

    const base = (await standingOf(viewer, folderId, colleague.id)).revision
    expectStatus(
      await putResponsibility(
        viewer,
        folderId,
        colleague.id,
        paragraph('Rewritten by somebody who was granted their own'),
        base,
      ),
      403,
      "#230 proof 5: the grant lets the member edit **only their own** Responsibility; another member's is still Full control's",
    )

    /* And it does not travel. The grant is a column on one membership row, so
       a second folder the same person is in knows nothing about it -- which is
       worth a case because a grant stored per *account* would pass every other
       assertion in this file. */
    const elsewhere = await sharedFolder(app, owner, 'AC-563 other folder', [
      [viewer, 'can_view'],
    ])
    const otherBase = (await standingOf(viewer, elsewhere, viewer.id)).revision
    expectStatus(
      await putResponsibility(
        viewer,
        elsewhere,
        viewer.id,
        paragraph('Carried over from another folder'),
        otherBase,
      ),
      403,
      'the grant belongs to one membership in one folder and does not follow the person into another',
    )
  })

  test('AC-563 proof 5: the grant changes exactly one answer in the whole action vocabulary', async () => {
    /*
    The enumeration, and the reason this file exists rather than three route
    cases. `mayPerform` is asked for every action at every preset, twice --
    granted and not -- against a target that is the actor themselves, which is
    the most generous shape the grant could possibly be read in. Exactly one
    action may answer differently.

    Asking it of the pure resolver rather than through HTTP is deliberate: it
    is the only way to cover all fifty actions, and the resolver is where a
    widening would be written. The route half is the three cases above.
    */
    const me = '00000000-0000-0000-0000-00000000ac56'
    const facts = (access: FolderAccessPreset) => ({
      folderId: '00000000-0000-0000-0000-000000000563',
      actorId: me,
      access,
      isOwner: false,
      isDefault: false,
      name: 'ac563',
    })
    const moved: string[] = []
    for (const preset of FOLDER_ACCESS_PRESETS) {
      for (const action of FOLDER_ACTIONS) {
        const without = mayPerform(facts(preset), action, {
          memberId: me,
          selfEditGranted: false,
          assigneeId: me,
          authorId: me,
        }).allowed
        const granted = mayPerform(facts(preset), action, {
          memberId: me,
          selfEditGranted: true,
          assigneeId: me,
          authorId: me,
        }).allowed
        if (without !== granted) moved.push(`${preset}/${action}`)
      }
    }
    const expected = FOLDER_ACCESS_PRESETS.filter(
      (preset) =>
        !mayPerform(facts(preset), 'responsibility.edit.own', {}).allowed,
    ).map((preset) => `${preset}/responsibility.edit.own`)
    expect(
      moved.sort(),
      "R7 section O: the grant is explicit and narrow and must not silently widen any other Work permission. An action here that is not `responsibility.edit.own` is a permission somebody bought with a grant that was never about it",
    ).toEqual(expected.sort())
  })

  test('AC-563 proof 5: the grant does not let its holder hand it on, or give it to themselves', async () => {
    const { owner, viewer, colleague, folderId } = await stage('AC-563 no chain')
    await setSelfEditGrantOk(owner, folderId, viewer.id, true)

    expectStatus(
      await setSelfEditGrant(viewer, folderId, colleague.id, true),
      403,
      "#230: toggling the grant is Full control's; a member who holds it does not become an administrator of it",
    )
    expectStatus(
      await setSelfEditGrant(colleague, folderId, colleague.id, true),
      403,
      'and a member cannot turn their own on, which would be granting themselves the thing the grant exists to withhold',
    )
    expect(
      await storedGrant(app.db, folderId, colleague.id),
      'neither refusal moved the column',
    ).toBe(false)
  })

  test('AC-563: turning the grant off takes effect on the next write, and both toggles are history-visible', async () => {
    const { owner, viewer, folderId } = await stage('AC-563 revoke')

    await setSelfEditGrantOk(owner, folderId, viewer.id, true)
    await commitOk(viewer, folderId, viewer.id, paragraph('While granted'))
    await setSelfEditGrantOk(owner, folderId, viewer.id, false)

    const base = (await standingOf(viewer, folderId, viewer.id)).revision
    expectStatus(
      await putResponsibility(
        viewer,
        folderId,
        viewer.id,
        paragraph('After the grant was taken back'),
        base,
      ),
      403,
      'the grant is read off the membership row under the write\'s own lock, so a revocation binds the next write rather than the next session',
    )

    const entries = await recordOf(app.db, folderId, viewer.id)
    expect(
      transitionsOf(entries),
      '#230: "changes to this grant must be recorded/history-visible as consequential standing", which means both directions of it',
    ).toEqual([
      'self_edit_granted',
      'responsibility_created',
      'self_edit_revoked',
    ])
    const toggles = entries.filter((entry) => entry.revision_no === null)
    for (const toggle of toggles) {
      expect(
        toggle.actor_id,
        'and the record names the administrator who moved it, not the member it was moved for',
      ).toBe(owner.id)
      expect(toggle.member_id).toBe(viewer.id)
      expect(
        toggle.content,
        'a grant toggle carries no content: it is a standing change rather than a revision',
      ).toBeNull()
    }

    // An unchanged toggle records nothing: an append-only record describes
    // changes, the same rule `changeMemberAccess` applies to `unchanged`.
    await setSelfEditGrantOk(owner, folderId, viewer.id, false)
    expect(
      (await recordOf(app.db, folderId, viewer.id)).length,
      'setting the grant to what it already is changes nothing and so records nothing',
    ).toBe(entries.length)
  })

  test("AC-563: the owner's own standing is not another administrator's to grant", async () => {
    const { owner, folderId } = await stage('AC-563 owner')
    const [, , ] = (await cast.of(app)) as [Actor, Actor, Actor]
    expectStatus(
      await setSelfEditGrant(owner, folderId, owner.id, true),
      403,
      "R7 section M and #230: the grant is for a non-owner member. The owner needs none -- they recover Full control by custody -- and admitting one here would make the custody anchor administrable",
    )
  })
})
