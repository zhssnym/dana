/*
AC-519: Folder Access does not govern personal state. A member who may read a
Task may put it on their own My Day, label the folder on their own shelf, and
keep their own saved views, at every preset down to Can view.

Issue #228 required proof 13. Product authority: #228's personal-actions
rule, which
lists what is outside Folder Access and says why: "Any user who may currently
read the target may use their own applicable personal features regardless of
Folder preset."

## The failure this is aimed at

The obvious way to implement a capability ladder is to put every mutating
route behind it. That would be wrong here, and wrong in a way nobody would
notice for a while, because the symptom is small: a Can-view auditor cannot
tidy their own sidebar, or a Can-comment adviser cannot put the thing they are
advising on into their own day. Neither is a security failure and both are
the product refusing somebody their own things.

So the resolver names these actions -- `personal.my_day`,
`personal.membership_label`, `personal.view_preferences` -- rather than
leaving them ungated. Naming them makes the mapping in #228's audit total: an
action that is not in the vocabulary is one nobody thought about, and these
were thought about and deliberately set to admit every member.

**"Where the target access permits" is the boundary that remains.** Personal
state over a Task in a folder you are not in is not personal state, it is a
read you do not have, and the last case asserts the 404.

Spec: 7.4, 7.8, 7.23, 4.19; #228's personal-actions rule.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { sharedFolder, taskIn } from '../support/folder-access-harness.js'
import { Cast, expectStatus } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import type { FolderAccessPreset } from '../../src/shared/folder-access.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'viewer', 'adviser', 'stranger'], 'ac489')

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
  adviser: Actor
  stranger: Actor
  folderId: string
  taskId: string
}

async function stage(name: string): Promise<Stage> {
  const [owner, viewer, adviser, stranger] = (await cast.of(app)) as [
    Actor,
    Actor,
    Actor,
    Actor,
  ]
  const folderId = await sharedFolder(app, owner, name, [
    [viewer, 'can_view'],
    [adviser, 'can_comment'],
  ])
  const taskId = await taskIn(owner, folderId, `${name} the work`, owner.id)
  return { owner, viewer, adviser, stranger, folderId, taskId }
}

describe('AC-519 personal state is the member\'s, whatever their preset', () => {
  test('AC-519: My Day admits every preset that can read the Task', async () => {
    const { owner, viewer, adviser, folderId, taskId } = await stage(
      'ac489 my day',
    )
    for (const [preset, actor] of [
      ['full_control', owner],
      ['can_comment', adviser],
      ['can_view', viewer],
    ] as const satisfies readonly (readonly [FolderAccessPreset, Actor])[]) {
      const pulled = await actor.browser.json(
        `/tasks/${taskId}/my-day?tz=UTC`,
        'POST',
        {},
      )
      expectStatus(
        pulled,
        200,
        `#228's personal-actions rule: My Day is a private projection over Work the actor may already read, so ${preset} may use it`,
      )
      const dropped = await actor.browser.api(
        `/tasks/${taskId}/my-day?tz=UTC`,
        { method: 'DELETE' },
      )
      expectStatus(
        dropped,
        200,
        `and take it off again, ${preset} included`,
      )
    }
    expect(folderId.length, 'one folder staged').toBeGreaterThan(0)
  })

  test("AC-519: a member's own label and colour for the folder are their own", async () => {
    const { viewer, folderId } = await stage('ac489 own label')
    const labelled = await viewer.browser.json(
      `/folders/${folderId}/my-membership`,
      'PATCH',
      { label: 'ac489 Audits', color: '#33AA55' },
    )
    expectStatus(
      labelled,
      200,
      "#228's personal-actions rule: a member's own shelf placement and arrangement of a folder are personal, so Can view sets them",
    )
    const body = labelled.json() as { my_label?: string; my_color?: string }
    expect(body.my_label, 'and the label is theirs').toBe('ac489 Audits')
    expect(body.my_color, 'and so is the colour').toBe('#33AA55')
  })

  test('AC-519: saved views and settings are account state and no folder governs them', async () => {
    const { viewer } = await stage('ac489 account state')
    const view = await viewer.browser.json('/views', 'POST', {
      name: 'ac489 what I am watching',
      definition: { status: 'pending' },
    })
    expect(
      view.status,
      "#228's personal-actions rule: saved Views are account state, outside Folder Access entirely",
    ).toBe(201)

    const settings = await viewer.browser.json('/settings', 'PATCH', {
      calendar_zoom: 'week',
    })
    expectStatus(
      settings,
      200,
      'and so are the account settings 4.19 holds',
    )
  })

  test('AC-519: personal state stops where the read stops', async () => {
    const { stranger, taskId } = await stage('ac489 no read no day')
    const pulled = await stranger.browser.json(
      `/tasks/${taskId}/my-day?tz=UTC`,
      'POST',
      {},
    )
    expectStatus(
      pulled,
      404,
      "#228's personal-actions rule reaches Work the actor may already read; somebody outside the folder may read nothing, and 10.2 makes that 404 rather than 403",
    )
  })

  test('AC-519 adversarial: the personal grant does not leak into shared Work', async () => {
    // The control that keeps the four cases above from being a hole. Can view
    // may arrange their own sidebar and may not move the folder's work, and
    // the two run through the same router.
    const { viewer, folderId, taskId } = await stage('ac489 still read only')
    expectStatus(
      await viewer.browser.json(`/tasks/${taskId}`, 'PATCH', {
        important: true,
      }),
      403,
      'personal state being outside Folder Access does not widen Folder Access',
    )
    expectStatus(
      await viewer.browser.json(`/folders/${folderId}`, 'PATCH', {
        color: '#112233',
      }),
      403,
      "and the folder's own colour is shared Work even though the member's label for it is not: 4.3 against 4.4, one PATCH each",
    )
  })
})
