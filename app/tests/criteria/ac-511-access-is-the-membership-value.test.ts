/*
AC-511: Access is the value on the membership row, and nothing else confers
it -- not ownership, not authorship, not assignment, not how long somebody has
been a member.

Issue #228 required proof 2. Product authority: #209 R8A ("Never infer Access
from membership, ownership, assignment, authorship, Responsibility prose,
labels, activity, expertise, title or recency").

## Why this is the criterion the others rest on

Every other #228 proof asks "may this preset do this thing". This one asks the
prior question: **is the preset what is being consulted at all?** An
implementation that happened to give the right answers by reading
`folders.owner_id`, or by asking who created a Task, would pass a great many
of the capability proofs and would be the exact defect #209 exists to remove,
because the moment ownership and Access diverge it starts answering the wrong
question.

So each case here holds one of the four rejected proxies *high* and the
preset *low*, or the other way about, and reads which one the server followed.

Spec: 4.3, 4.4 as widened by migration 0023; #209 R8A.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import {
  forcePreset,
  sharedFolder,
  storedPreset,
  taskIn,
} from '../support/folder-access-harness.js'
import {
  Cast,
  connect,
  expectStatus,
} from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'admin', 'worker', 'newcomer'], 'ac481')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-511 the preset decides, and the four proxies do not', () => {
  test('AC-511: ownership does not confer Access, and Access does not confer ownership', async () => {
    const [owner, admin] = (await cast.of(app)) as [Actor, Actor]
    const folderId = await sharedFolder(app, owner, 'ac481 custody apart', [
      [admin, 'full_control'],
    ])

    // R5's worked case: the founder stays the structural owner and drops to a
    // lower operating preset, and the person they delegated to has more
    // day-to-day authority than they do.
    await forcePreset(app.db, folderId, owner.id, 'can_view')

    const ownerRenames = await owner.browser.json(`/folders/${folderId}`, 'PATCH', {
      name: 'ac481 renamed by a view-only owner',
    })
    expectStatus(
      ownerRenames,
      403,
      'the structural owner holding Can view may not edit ordinary Work: ownership is custody, not an operating permission (#209 R5, R8A)',
    )

    const adminRenames = await admin.browser.json(`/folders/${folderId}`, 'PATCH', {
      name: 'ac481 renamed by full control',
    })
    expectStatus(
      adminRenames,
      200,
      'a Full-control member who owns nothing edits ordinary Work: Access is the value that decides (#209 R8A)',
    )

    // And the other direction: Full control did not make them the owner.
    const detail = (
      await admin.browser.api(`/folders/${folderId}`)
    ).json() as { is_owner?: unknown }
    expect(
      detail.is_owner,
      'Full control does not gain ownership automatically (#228, "Does not gain ownership automatically")',
    ).toBe(false)
  })

  test('AC-511: authorship of a Task confers nothing after it is created', async () => {
    const [owner, , worker] = (await cast.of(app)) as [Actor, Actor, Actor]
    const folderId = await sharedFolder(app, owner, 'ac481 authorship', [
      [worker, 'can_contribute'],
    ])

    // The contributor originates the Task and assigns it to the owner, which
    // R8A explicitly permits at creation time.
    const made = await worker.browser.json('/tasks', 'POST', {
      title: 'ac481 written by the contributor',
      folder_id: folderId,
      assignee_id: owner.id,
    })
    expectStatus(
      made,
      201,
      'Can contribute originates new Task work, including choosing its initial assignee (#209 R8A)',
    )
    const taskId = String((made.json() as { id: string }).id)

    const rename = await worker.browser.json(`/tasks/${taskId}`, 'PATCH', {
      title: 'ac481 rewritten by its author',
    })
    expectStatus(
      rename,
      403,
      'creation is not continuing authority: after it belongs to another member, the author may not edit it (#209 R8A, "creation/authorship does not create continuing authority")',
    )
  })

  test('AC-511: assignment confers nothing that the preset does not carry', async () => {
    const [owner, , , newcomer] = (await cast.of(app)) as [
      Actor,
      Actor,
      Actor,
      Actor,
    ]
    const folderId = await sharedFolder(app, owner, 'ac481 assignment', [
      [newcomer, 'can_view'],
    ])
    const taskId = await taskIn(owner, folderId, 'ac481 theirs to do', newcomer.id)

    const completed = await newcomer.browser.json(
      `/tasks/${taskId}/complete`,
      'POST',
      {},
    )
    expectStatus(
      completed,
      403,
      'being the current assignee is a *boundary* on Can contribute and Assigned work, never a grant of its own: Can view holding an assignment still reads only (#209 R8A)',
    )
  })

  test('AC-511: a member added later is not a member with less Access', async () => {
    const [owner, admin, worker, newcomer] = (await cast.of(app)) as [
      Actor,
      Actor,
      Actor,
      Actor,
    ]
    const folderId = await sharedFolder(app, owner, 'ac481 recency', [
      [worker, 'can_view'],
    ])
    // Admin joins last and at the highest preset; worker joined first and at
    // the lowest. Recency is one of the inferences R8A names by name.
    await connect(app.db, owner.id, admin.id)
    const added = await owner.browser.json(`/folders/${folderId}/members`, 'POST', {
      user_id: admin.id,
      access: 'full_control',
    })
    expectStatus(added, 201, 'the administrator joins last (spec 7.4)')
    expect(
      await storedPreset(app.db, folderId, admin.id),
      'the stored preset is the one the add named, whatever the join order',
    ).toBe('full_control')

    const newestAdministers = await admin.browser.json(
      `/folders/${folderId}/members/${worker.id}`,
      'PATCH',
      { access: 'can_edit' },
    )
    expectStatus(
      newestAdministers,
      200,
      'the newest member administers the oldest, because Access is the value and recency is not one (#209 R8A)',
    )
    expect(
      await storedPreset(app.db, folderId, worker.id),
      'and the change lands on the column that decides',
    ).toBe('can_edit')

    // The dangling fourth actor is signed in so the cast cleans it up.
    expect(newcomer.id.length, 'the cast is four people').toBeGreaterThan(0)
  })
})
