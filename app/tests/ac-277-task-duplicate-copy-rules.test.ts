/*
AC-277: given a task assigned to another member, carrying notes, a done
step, a conversation and a due date that has passed, when a member
duplicates it, then the copy is assigned to whoever made the copy, carries
the title, the notes and the steps with every step undone, carries no
comment, and its due date is today; given a task whose due date is still
ahead, then the copy keeps that date; and given a person who is not a
member of the task's folder, then the duplicate is 404.

Section 13 item 46's Duplicate was ruled by Imran on 2026-08-26 (RFC 0005
change control item 47(b)): title, steps, notes, and never the
conversation, "chats between users inside a task is never to be part of
duplication". The assignment is item 44's B10, a duplicate's tasks being
whoever made the copy's, and the date is 9.6's one rule for a folder read
onto one task, spent dates re-anchoring on today and future ones keeping.
The endpoint itself predates the ruling (7.16, at 5763f70); what this
criterion pins is the ruling's shape on it, so that a copy which carried the
assignee, the progress, or a spent date is a visible criteria change.

**"Today" here is the database's day and not the process's.** 7.16 carries no
tz parameter, so acts.ts re-anchors with SQL current_date, which reads in the
database session's timezone. This file first asserted against the UTC date
taken from the process clock, and the two are different clocks in different
zones: measured 2026-09-02, PGlite reports Etc/GMT-1 here and the local
PostgreSQL 18 cluster reports Europe/Paris, so current_date turns over an
hour or two before the UTC date does and the assertion was false for that
whole window of every day. CI caught it at 23:59:39Z on 2026-08-31, where it
read as a midnight flake rather than as the standing disagreement it was
(issue #46). The oracle is now databaseToday(), which is AC-200's rule that
the assertion and the implementation share a clock; and because reading
current_date after the endpoint has read its own is still two readings,
databaseDaysAcross() brackets the duplicate and the assertion is against the
day or days the operation actually occupied. That is one day in every run
that does not straddle the database's midnight, so nothing here is loosened.

**Issue #76 will invalidate this oracle, and it must move in that change.**
#76 is the product defect underneath: 8.1 wants the viewer's day and this
endpoint anchors on the database's, so the fix gives 7.16 a tz parameter and
re-anchors on the zone the caller names. The moment it lands, current_date is
no longer what the endpoint reads, databaseToday() is no longer the clock the
implementation uses, and this criterion returns to failing for the one or two
hours a day the two zones disagree - the same shape as #46 and the same wrong
diagnosis waiting to be made a second time. The oracle then becomes the
viewer's day in the zone under test, computed the way the endpoint computes
it, and it belongs in the same commit as the parameter.

Spec: 7.16 (POST /tasks/:id/duplicate), 9.6's copy rules, 4.6, 4.15, 10.2.
*/
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
import {
  addStepOk,
  createTaskOk,
  databaseDaysAcross,
  patchStepOk,
  requireTaskRow,
  stepRows,
} from './tasks-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'member', 'stranger'], 's28a')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-277 a task\'s duplicate takes the work and not the life', () => {
  test('the copy is the duplicator\'s, with title, notes and undone steps, no conversation, and a spent date on today', async () => {
    const [owner, member] = (await cast.of(app)) as [Actor, Actor]
    await connect(app.db, owner.id, member.id)
    const folderId = await createFolder(owner, 's28a ac277 copies')
    await addMemberOk(owner, folderId, member.id)

    const source = await createTaskOk(
      owner,
      {
        title: 's28a ac277 source',
        notes: 'the notes travel',
        folder_id: folderId,
        assignee_id: owner.id,
        due_date: '2020-01-01',
      },
      'the source must exist (spec 7.6)',
    )
    const withStep = await addStepOk(owner, source.id, 's28a ac277 a step')
    const stepId = String((withStep.steps as { id: string }[])[0]?.id)
    await patchStepOk(owner, source.id, stepId, { done: true })
    const said = await owner.browser.json(
      `/folders/${folderId}/comments?task=${source.id}`,
      'POST',
      { body: 's28a ac277 a conversation that must not travel' },
    )
    expectStatus(said, 201, 'a comment on the source (spec 7.14)')

    const { result: copied, days: reanchorDays } = await databaseDaysAcross(
      app.db,
      () => member.browser.json(`/tasks/${source.id}/duplicate`, 'POST'),
    )
    expectStatus(copied, 201, 'a member duplicates (spec 7.16)')
    const copyId = String((copied.json() as { id?: unknown }).id)
    expect(copyId, 'the response is the new task (spec 7.16)').not.toBe(source.id)

    const copy = await requireTaskRow(app.db, copyId)
    expect(copy.assignee_id, 'the copy is assigned to whoever made it (item 44 B10)').toBe(member.id)
    expect(copy.created_by, 'and it is theirs').toBe(member.id)
    expect(String(copy.title), 'the title travels').toContain('s28a ac277 source')
    expect(copy.notes, 'the notes travel (item 47(b))').toBe('the notes travel')
    expect(copy.status, 'the copy starts pending').toBe('pending')
    expect(
      reanchorDays,
      `a spent due date re-anchors on today (spec 9.6's rule, read onto one task by item 47(b)). Today is current_date, in the database's own zone, because 7.16 carries no tz; the row says ${String(copy.due_date)}`,
    ).toContain(copy.due_date)

    const steps = await stepRows(app.db, copyId)
    expect(steps.map((step) => step.title), 'the steps travel (item 47(b))').toEqual(['s28a ac277 a step'])
    expect(steps.map((step) => step.done), 'and every one is undone: progress does not copy (spec 9.6)').toEqual([false])

    const thread = await member.browser.json(
      `/folders/${folderId}/comments?task=${copyId}`,
      'GET',
    )
    expectStatus(thread, 200, 'the copy\'s thread reads (spec 7.14)')
    expect(
      JSON.stringify(thread.json()).includes('must not travel'),
      'the conversation never duplicates (item 47(b), Imran\'s one absolute exclusion)',
    ).toBe(false)
  })

  test('a future date keeps, and a non-member meets 404', async () => {
    const [owner, , stranger] = (await cast.of(app)) as [Actor, Actor, Actor]
    const folderId = await createFolder(owner, 's28a ac277 ahead')
    const source = await createTaskOk(
      owner,
      { title: 's28a ac277 ahead', folder_id: folderId, due_date: '2099-06-15' },
      'the source must exist (spec 7.6)',
    )

    const invisible = await stranger.browser.json(`/tasks/${source.id}/duplicate`, 'POST')
    expectStatus(invisible, 404, 'a non-member meets not-found (spec 10.2)')

    const copied = await owner.browser.json(`/tasks/${source.id}/duplicate`, 'POST')
    expectStatus(copied, 201, 'the owner duplicates (spec 7.16)')
    const copy = await requireTaskRow(app.db, String((copied.json() as { id?: unknown }).id))
    expect(copy.due_date, 'a date still ahead is a live plan and keeps (spec 9.6)').toBe('2099-06-15')
  })
})
