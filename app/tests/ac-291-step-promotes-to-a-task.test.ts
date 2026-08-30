/*
AC-291: given a task with steps, when a member posts
`/tasks/:id/steps/:stepId/promote`, then a pending task titled after the step
exists in the same folder and under the same section, created by the
promoter and assigned to nobody, the step is gone from the parent, and the
answer is 201 with the new TaskDetail; a step named under a task it does not
belong to, and a non-member, are 404. A task never demotes: nothing offers
the reverse.

RFC 0005 change control item 44's B9 ruled the asymmetry and item 58 gave it
an address (7.7 as widened by item 58, C). What this pins is that a
promotion is one transaction with two effects and no third: the parent keeps
every other step, the new task carries none of the parent's date, assignee
or importance, and the step's box does not travel, a promoted task starting
pending whatever the step said.

Spec: 7.7 (as widened by RFC 0005 change control item 58), 4.5, 4.6, 10.2.
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import {
  Cast,
  addMemberOk,
  connect,
  createFolder,
  expectStatus,
} from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import { rows } from './helpers.js'
import {
  addStepOk,
  createTaskOk,
  patchStepOk,
  requireTaskRow,
  stepRows,
} from './tasks-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'member', 'stranger'], 'loose')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-291 a step promotes to a task in its parent\'s folder and section, and the step is gone', () => {
  test('the promoted task is pending, unassigned, the promoter\'s, in the parent\'s section; the parent keeps its other step', async () => {
    const [owner, member] = (await cast.of(app)) as [Actor, Actor]
    await connect(app.db, owner.id, member.id)
    const folderId = await createFolder(owner, 'loose ac291 plan')
    await addMemberOk(owner, folderId, member.id)

    const page = await owner.browser.json(`/folders/${folderId}/page`, 'PUT', {
      blocks: [{ kind: 'section', position: 0, text: 'loose ac291 phase one' }],
    })
    expectStatus(page, 200, 'a section block to file the parent under (spec 7.11)')
    const sectionId = String(
      ((page.json() as { blocks: { id: string }[] }).blocks[0] ?? { id: '' }).id,
    )

    const parent = await createTaskOk(
      owner,
      {
        title: 'loose ac291 parent',
        folder_id: folderId,
        assignee_id: owner.id,
        important: true,
        due_date: '2031-01-01',
        section_block_id: sectionId,
      },
      'the parent must exist (spec 7.6)',
    )
    const withSteps = await addStepOk(owner, parent.id, 'loose ac291 keep me')
    const promoted = await addStepOk(owner, parent.id, 'loose ac291 promote me')
    const steps = promoted.steps as { id: string; title: string }[]
    const keepId = String(steps.find((step) => step.title === 'loose ac291 keep me')?.id)
    const goId = String(steps.find((step) => step.title === 'loose ac291 promote me')?.id)
    await patchStepOk(owner, parent.id, goId, { done: true })
    expect(withSteps.id, 'the parent is the parent').toBe(parent.id)

    const answer = await member.browser.json(`/tasks/${parent.id}/steps/${goId}/promote`, 'POST')
    expectStatus(answer, 201, 'a member promotes a step (spec 7.7 as widened by item 58)')
    const made = answer.json() as { id: string; title: string; folder: { id: string } }
    expect(made.id, 'the answer is the new task').not.toBe(parent.id)
    expect(made.title, 'titled after the step').toBe('loose ac291 promote me')
    expect(made.folder.id, 'in the parent\'s folder').toBe(folderId)

    const row = await requireTaskRow(app.db, made.id)
    expect(row.status, 'pending whatever the step\'s box said').toBe('pending')
    expect(row.assignee_id, 'assigned to nobody').toBeNull()
    expect(row.created_by, 'the promoter\'s').toBe(member.id)
    expect(row.due_date, 'the parent\'s date does not travel').toBeNull()
    expect(row.important, 'nor its importance').toBe(false)
    const section = await rows(
      app.db,
      sql`SELECT section_block_id FROM tasks WHERE id = ${made.id}::uuid`,
    )
    expect(String(section[0]?.section_block_id), 'under the parent\'s section (4.5)').toBe(
      sectionId,
    )

    const left = await stepRows(app.db, parent.id)
    expect(
      left.map((step) => String(step.id)),
      'the promoted step is gone and the other stays',
    ).toEqual([keepId])
    const orphan = await stepRows(app.db, made.id)
    expect(orphan, 'the new task carries no step').toHaveLength(0)
  })

  test('a step under the wrong task, and a stranger, are 404 and nothing moves', async () => {
    const [owner, , stranger] = (await cast.of(app)) as [Actor, Actor, Actor]
    const folderId = await createFolder(owner, 'loose ac291 other')
    const a = await createTaskOk(owner, { title: 'loose ac291 a', folder_id: folderId }, 'a')
    const b = await createTaskOk(owner, { title: 'loose ac291 b', folder_id: folderId }, 'b')
    const stepped = await addStepOk(owner, a.id, 'loose ac291 a step of a')
    const stepId = String((stepped.steps as { id: string }[])[0]?.id)

    const crossed = await owner.browser.json(`/tasks/${b.id}/steps/${stepId}/promote`, 'POST')
    expectStatus(crossed, 404, 'the pair is an address: a step of a under b is not found')
    const foreign = await stranger.browser.json(`/tasks/${a.id}/steps/${stepId}/promote`, 'POST')
    expectStatus(foreign, 404, '10.2: a non-member is told nothing exists')

    const still = await stepRows(app.db, a.id)
    expect(still.map((step) => String(step.id)), 'the step stayed where it was').toEqual([stepId])
  })
})
