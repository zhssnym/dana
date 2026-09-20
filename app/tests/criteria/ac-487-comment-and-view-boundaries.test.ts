/*
AC-487: Can comment participates in Consultation and changes no shared Work
state; Can view reads and leaves no mark at all.

Issue #228 required proofs 10 and 11. Product authority: #209 R8A and R7
sections B and I.

## The two lowest rungs, and why they are two

R8's removal test is the argument: "Can comment is not Can view -- Consultation
is an intentional form of participation". An adviser who may say "this door
needs a second inspection" is doing something the product exists for, and is
not thereby able to change the plan they are commenting on.

So the pair of cases below is symmetric on purpose. Each preset is driven at
the *same* four endpoints -- a comment, a like, a Task edit and a completion --
and the only difference between the two columns is the first two.

Spec: 7.6, 7.14, 10.2; #209 R7 sections B and I, R8A.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { sharedFolder, taskIn } from '../support/folder-access-harness.js'
import { Cast, expectStatus } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'adviser', 'auditor'], 'ac487')

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
  /** can_comment */
  adviser: Actor
  /** can_view */
  auditor: Actor
  folderId: string
  taskId: string
  /** A comment the owner left, for the like and the reply. */
  commentId: string
}

async function stage(name: string): Promise<Stage> {
  const [owner, adviser, auditor] = (await cast.of(app)) as [
    Actor,
    Actor,
    Actor,
  ]
  const folderId = await sharedFolder(app, owner, name, [
    [adviser, 'can_comment'],
    [auditor, 'can_view'],
  ])
  const taskId = await taskIn(owner, folderId, `${name} the work`, owner.id)
  const said = await owner.browser.json(
    `/folders/${folderId}/comments?task=${taskId}`,
    'POST',
    { body: 'ac487 what do you both think' },
  )
  expectStatus(said, 201, 'the owner opens the thread (spec 7.14)')
  const commentId = String((said.json() as { id: string }).id)
  return { owner, adviser, auditor, folderId, taskId, commentId }
}

describe('AC-487 the two reading presets, and the one that may speak', () => {
  test('AC-487: both read the folder, its tasks and its thread', async () => {
    const { adviser, auditor, folderId, taskId } = await stage('ac487 reading')
    for (const [who, actor] of [
      ['Can comment', adviser],
      ['Can view', auditor],
    ] as const) {
      expectStatus(
        await actor.browser.api(`/folders/${folderId}`),
        200,
        `R7 section B: ${who} reads ordinary Folder-visible content`,
      )
      expectStatus(
        await actor.browser.api(`/tasks/${taskId}`),
        200,
        `${who} reads the Tasks`,
      )
      expectStatus(
        await actor.browser.api(`/folders/${folderId}/comments?task=${taskId}`),
        200,
        `${who} reads the thread`,
      )
    }
  })

  test('AC-487 proof 10: Can comment discusses and likes', async () => {
    const { adviser, folderId, taskId, commentId } = await stage('ac487 speech')

    const replied = await adviser.browser.json(
      `/folders/${folderId}/comments?task=${taskId}`,
      'POST',
      { body: 'ac487 it needs a second inspection', parent_id: commentId },
    )
    expectStatus(
      replied,
      201,
      'R7 section I: comment and reply is what Can comment is for -- "Consultation is an intentional form of participation"',
    )
    const ownId = String((replied.json() as { id: string }).id)

    const liked = await adviser.browser.api(`/comments/${commentId}/like`, {
      method: 'PUT',
    })
    expectStatus(liked, 204, 'R7 section I: like and unlike')

    const edited = await adviser.browser.json(`/comments/${ownId}`, 'PATCH', {
      body: 'ac487 it needs two more inspections',
    })
    expectStatus(edited, 200, 'R7 section I: edit their own comment')

    const removed = await adviser.browser.api(`/comments/${ownId}`, {
      method: 'DELETE',
    })
    expectStatus(removed, 204, 'R7 section I: and delete their own comment')
  })

  test('AC-487 proof 10: Can comment changes no shared Work state', async () => {
    const { adviser, folderId, taskId } = await stage('ac487 not work')

    expectStatus(
      await adviser.browser.json(`/tasks/${taskId}`, 'PATCH', {
        title: 'ac487 rewritten by an adviser',
      }),
      403,
      'R8A: Can comment participates "without changing shared Work state"',
    )
    expectStatus(
      await adviser.browser.json(`/tasks/${taskId}/complete?tz=UTC`, 'POST', {}),
      403,
      'and does not move a Task through the 5.1 machine',
    )
    expectStatus(
      await adviser.browser.json('/tasks', 'POST', {
        title: 'ac487 originated by an adviser',
        folder_id: folderId,
      }),
      403,
      'and does not originate Task work, which is Can contribute and above',
    )
    expectStatus(
      await adviser.browser.json(`/folders/${folderId}`, 'PATCH', {
        name: 'ac487 renamed by an adviser',
      }),
      403,
      "and does not edit the folder's identity",
    )
  })

  test('AC-487 proof 11: Can view cannot mutate a comment or any shared Work', async () => {
    const { auditor, folderId, taskId, commentId } = await stage('ac487 read only')

    expectStatus(
      await auditor.browser.json(
        `/folders/${folderId}/comments?task=${taskId}`,
        'POST',
        { body: 'ac487 an auditor speaks' },
      ),
      403,
      'R8A: Can view is read only, and Consultation is the line above it',
    )
    expectStatus(
      await auditor.browser.api(`/comments/${commentId}/like`, { method: 'PUT' }),
      403,
      'R7 section I: a like is a mark on somebody else\'s words, which Can view does not leave',
    )
    expectStatus(
      await auditor.browser.api(`/comments/${commentId}`, { method: 'DELETE' }),
      403,
      "nor remove another member's comment, which is moderation and belongs to Full control",
    )
    expectStatus(
      await auditor.browser.json(`/tasks/${taskId}`, 'PATCH', {
        important: true,
      }),
      403,
      'and no shared Work state at all',
    )
  })

  test('AC-487 adversarial: a stranger still gets 404 rather than 403 at every one of these', async () => {
    // The two refusals mean different things and must not be confused. A
    // member is told why; somebody outside the folder is told nothing, because
    // a 403 would confirm the folder exists (10.2).
    const [, , auditor] = (await cast.of(app)) as [Actor, Actor, Actor]
    const strangerFolder = await sharedFolder(
      app,
      auditor,
      'ac487 not yours at all',
    )
    const [owner] = (await cast.of(app)) as [Actor]
    expectStatus(
      await owner.browser.json(`/folders/${strangerFolder}`, 'PATCH', {
        name: 'ac487 reached into',
      }),
      404,
      '10.2: an inaccessible folder reads as nonexistent, and the Access refusals above are 403 only because the actor is demonstrably a member',
    )
    expect(
      (await owner.browser.api(`/folders/${strangerFolder}`)).status,
      'and the read says the same',
    ).toBe(404)
  })
})
