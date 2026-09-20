/*
AC-484: Can contribute originates new Task work and chooses its initial
assignee, fully plans and manages the work currently assigned to them, and may
not touch another member's existing Task -- whoever created it.

Issue #228 required proofs 5, 6 and 7. Product authority: #209 R8A and R8's
"Exact leading boundary for Can contribute".

## The three claims, and why proof 6 is the sharp one

Proofs 5 and 7 are the boundary R8 draws: origination plus self-management,
stopping at another member's work and at the folder's structure.

Proof 6 is the claim that makes the boundary safe. R8 says it twice and in
terms: **"If a newly created Task is assigned to somebody else, the
contributor does not gain permanent edit authority over that Task merely
because they created it."** An implementation could satisfy every other case
here by resolving edit authority from `tasks.created_by`, and it would be
wrong in exactly the way #209 exists to prevent: authorship is provenance.

So the case below has the contributor create a Task, assign it to somebody
else at creation time -- which they are allowed to do -- and then be refused
every edit on it. The ordinary ongoing authority is resolved from the Task's
*current assignee*, which is the row the mutation locks.

Spec: 7.6, 7.7; #209 R8A, R8.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { sharedFolder, taskIn } from '../support/folder-access-harness.js'
import { Cast, expectStatus } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'contributor', 'colleague'], 'ac484')

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
  contributor: Actor
  colleague: Actor
  folderId: string
}

async function stage(name: string): Promise<Stage> {
  const [owner, contributor, colleague] = (await cast.of(app)) as [
    Actor,
    Actor,
    Actor,
  ]
  const folderId = await sharedFolder(app, owner, name, [
    [contributor, 'can_contribute'],
    [colleague, 'can_contribute'],
  ])
  return { owner, contributor, colleague, folderId }
}

describe('AC-484 Can contribute originates and self-manages', () => {
  test('AC-484: creates a Task and chooses its initial assignee, including somebody else', async () => {
    const { contributor, colleague, folderId } = await stage('ac484 origination')

    const mine = await contributor.browser.json('/tasks', 'POST', {
      title: 'ac484 mine to do',
      folder_id: folderId,
      assignee_id: contributor.id,
      due_date: '2026-12-01',
      important: true,
    })
    expectStatus(
      mine,
      201,
      '#209 R8A: Can contribute originates new Task work in the folder, with the normal creation-time fields',
    )

    const theirs = await contributor.browser.json('/tasks', 'POST', {
      title: 'ac484 for a colleague',
      folder_id: folderId,
      assignee_id: colleague.id,
    })
    expectStatus(
      theirs,
      201,
      'R8: "They may assign the newly created Task to themselves, to another current Folder member, or leave it unassigned"; the initial assignee is part of origination and not a separate assign authority',
    )

    const unassigned = await contributor.browser.json('/tasks', 'POST', {
      title: 'ac484 for whoever takes it',
      folder_id: folderId,
      assignee_id: null,
    })
    expectStatus(unassigned, 201, 'and unassigned where the Task contract permits it')
  })

  test('AC-484: fully plans and manages the Task currently assigned to them', async () => {
    const { owner, contributor, folderId } = await stage('ac484 self-management')
    const taskId = await taskIn(owner, folderId, 'ac484 handed over', contributor.id)

    const planned = await contributor.browser.json(`/tasks/${taskId}`, 'PATCH', {
      title: 'ac484 replanned by its holder',
      notes: 'context added',
      due_date: '2026-11-30',
      important: true,
      recurrence_rule: 'FREQ=WEEKLY',
    })
    expectStatus(
      planned,
      200,
      'R8: over work currently assigned to them, Can contribute edits title, notes, dates, importance and recurrence',
    )

    const stepped = await contributor.browser.json(
      `/tasks/${taskId}/steps`,
      'POST',
      { title: 'ac484 a step of their own' },
    )
    expectStatus(
      stepped,
      201,
      'R8: and creates, edits, reorders and deletes Steps on it -- which is what separates them from Assigned work',
    )

    const completed = await contributor.browser.json(
      `/tasks/${taskId}/complete?tz=UTC`,
      'POST',
      {},
    )
    expectStatus(completed, 200, 'R8: and completes it')

    const abandoned = await contributor.browser.json(
      `/tasks/${taskId}/uncomplete`,
      'POST',
      {},
    )
    expectStatus(abandoned, 200, 'and uncompletes it')
  })

  test("AC-484: may not touch another member's existing Task", async () => {
    const { owner, contributor, folderId } = await stage('ac484 not theirs')
    const taskId = await taskIn(owner, folderId, "ac484 the owner's own", owner.id)

    const renamed = await contributor.browser.json(`/tasks/${taskId}`, 'PATCH', {
      title: 'ac484 reached across',
    })
    expectStatus(
      renamed,
      403,
      "R8: Can contribute may not edit another member's existing Task",
    )

    const completed = await contributor.browser.json(
      `/tasks/${taskId}/complete?tz=UTC`,
      'POST',
      {},
    )
    expectStatus(
      completed,
      403,
      "and may not mark another member's Task done",
    )

    const stepped = await contributor.browser.json(
      `/tasks/${taskId}/steps`,
      'POST',
      { title: 'ac484 a step somebody else must do' },
    )
    expectStatus(stepped, 403, "nor rewrite another member's checklist")
  })

  test('AC-484 proof 6: authorship does not survive the assignment', async () => {
    const { contributor, colleague, folderId } = await stage('ac484 authorship')

    const made = await contributor.browser.json('/tasks', 'POST', {
      title: 'ac484 written for a colleague',
      folder_id: folderId,
      assignee_id: colleague.id,
    })
    expectStatus(made, 201, 'the contributor originates it and hands it over')
    const taskId = String((made.json() as { id: string }).id)

    const renamed = await contributor.browser.json(`/tasks/${taskId}`, 'PATCH', {
      title: 'ac484 taken back by its author',
    })
    expectStatus(
      renamed,
      403,
      'R8: "the contributor does not gain permanent edit authority over that Task merely because they created it" -- ongoing authority resolves from the current assignee, never from created_by',
    )

    const reclaimed = await contributor.browser.json(`/tasks/${taskId}`, 'PATCH', {
      assignee_id: contributor.id,
    })
    expectStatus(
      reclaimed,
      403,
      'and they cannot assign it back to themselves either: reassigning an existing Task is planning authority, which R8 keeps for Can edit',
    )

    // The control: it is genuinely the colleague's now.
    const byHolder = await colleague.browser.json(`/tasks/${taskId}`, 'PATCH', {
      title: 'ac484 replanned by whoever holds it',
    })
    expectStatus(
      byHolder,
      200,
      'while the current assignee, at the same preset, plans it freely',
    )
  })

  test('AC-484: the five acts R8 lists as beyond Can contribute', async () => {
    const { owner, contributor, folderId } = await stage('ac484 beyond')
    const ownTask = await taskIn(
      owner,
      folderId,
      'ac484 theirs to hold',
      contributor.id,
    )

    const trashed = await contributor.browser.api(`/tasks/${ownTask}`, {
      method: 'DELETE',
    })
    expectStatus(
      trashed,
      403,
      'R8: "may not trash/permanently delete shared Tasks" -- their own included, because a trashed Task leaves the folder\'s work for everybody',
    )

    const profile = await contributor.browser.json(`/folders/${folderId}`, 'PATCH', {
      name: 'ac484 renamed by a contributor',
    })
    expectStatus(
      profile,
      403,
      'R8: "may not edit Folder-wide page/composer/Purpose/Results"',
    )

    const sectioned = await contributor.browser.json(
      `/folders/${folderId}/page/actions`,
      'POST',
      {
        action: 'insert_block',
        block_kind: 'section',
        text: 'ac484 a section',
        section_block_id: null,
        after: null,
        before: null,
      },
    )
    expectStatus(
      sectioned,
      403,
      'R8: "may not create/delete/reorder Folder Sections themselves"',
    )

    const second = await taskIn(owner, folderId, 'ac484 a blocker', owner.id)
    const dependency = await contributor.browser.json(
      `/tasks/${ownTask}/dependencies`,
      'POST',
      { blocking_task_id: second },
    )
    expectStatus(
      dependency,
      403,
      'R8: "may not create a cross-Task dependency/relationship that imposes shared planning consequences on another member\'s work without Can edit"',
    )

    const invited = await contributor.browser.json(
      `/folders/${folderId}/members`,
      'POST',
      { user_id: owner.id, access: 'can_view' },
    )
    expect(
      invited.status,
      'R8: "may not administer members"',
    ).toBe(403)
  })
})
