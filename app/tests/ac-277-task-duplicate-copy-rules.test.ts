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

**"Today" here is the caller's day, and the criterion pins the zone. Rewritten
2026-09-04 with issue #76, which is the change the previous version of this
paragraph said was coming.**

The history matters because two sessions have already drawn a wrong conclusion
from this file. It first asserted the UTC date from the process clock against a
date the endpoint took from SQL current_date, which reads in the database
session's zone: two clocks in two zones, measured 2026-09-02 as Etc/GMT-1 for
PGlite here and Europe/Paris for the local cluster, so the assertion was false
for the whole window in which the local date leads UTC - one to two hours every
evening, not an instant at midnight. CI caught it at 23:59:39Z and it was filed
as a midnight race (#46), which it never was. The interim fix made the oracle
the database's own day, bracketed across the call, and said in terms that it
described the behaviour without blessing it.

#76 is the product defect underneath, and it has landed: 8.1 defines today as
the current date in the request's tz and says that an endpoint which evaluates
a date and takes no tz is an incomplete surface, not a licence to substitute
the stored zone below. POST /tasks/:id/duplicate now takes tz, so **the
database's clock is not consulted at all**, and the oracle is the caller's day
in the zone this file names, read from the process clock the endpoint itself
reads.

Two zones rather than one, and the pair is the point. Pacific/Kiritimati is
UTC+14 and Etc/GMT+12 is UTC-12, twenty-six hours apart, so their civil dates
differ **at every instant**: two copies of one source cannot land on the same
day unless the zone is being ignored. That assertion needs no clock of its own
and cannot flake. Each copy is then checked against its own zone's day,
bracketed across the request, which is one clock rather than two and a window
of milliseconds rather than of hours.

The refusal shape - a zone absent when a date would move, and a zone that is
not an IANA name - is AC-376, which covers both duplicate endpoints at once.

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
  patchStepOk,
  requireTaskRow,
  stepRows,
  todayInZone,
  zoneDaysAcross,
} from './tasks-harness.js'

/** Twenty-six hours apart, so their civil dates never agree. */
const FAR_EAST = 'Pacific/Kiritimati'
const FAR_WEST = 'Etc/GMT+12'

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

    const { result: copied, days: reanchorDays } = await zoneDaysAcross(
      FAR_EAST,
      () =>
        member.browser.json(
          `/tasks/${source.id}/duplicate?tz=${encodeURIComponent(FAR_EAST)}`,
          'POST',
        ),
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
      `a spent due date re-anchors on today (spec 9.6's rule, read onto one task by item 47(b)). Today is the caller's day in the zone the request named (8.1, issue #76); the row says ${String(copy.due_date)}`,
    ).toContain(copy.due_date)

    /* The same source, duplicated again from the other side of the date line.
       Twenty-six hours apart, the two zones never share a civil date, so two
       copies landing on one day would mean the zone was not read - which is
       what this endpoint did until #76, when both would have landed on the
       database's day whatever the caller asked for. */
    const { result: westCopy, days: westDays } = await zoneDaysAcross(
      FAR_WEST,
      () =>
        member.browser.json(
          `/tasks/${source.id}/duplicate?tz=${encodeURIComponent(FAR_WEST)}`,
          'POST',
        ),
    )
    expectStatus(westCopy, 201, 'and again from the other side of the date line')
    const west = await requireTaskRow(
      app.db,
      String((westCopy.json() as { id?: unknown }).id),
    )
    expect(westDays, 'the second copy lands on that zone’s today').toContain(
      west.due_date,
    )
    expect(
      west.due_date,
      `${FAR_WEST} and ${FAR_EAST} are 26 hours apart and never share a date, so one answer for both would mean the zone was ignored (8.1)`,
    ).not.toBe(copy.due_date)

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

    /* No tz at all, and that is legal here: 2099 is ahead of today in every
       zone on earth, so nothing would be re-anchored and 8.1 has nothing to
       evaluate (issue #76; 7.16's import is the same rule). */
    const copied = await owner.browser.json(`/tasks/${source.id}/duplicate`, 'POST')
    expectStatus(copied, 201, 'the owner duplicates (spec 7.16)')
    const copy = await requireTaskRow(app.db, String((copied.json() as { id?: unknown }).id))
    expect(copy.due_date, 'a date still ahead is a live plan and keeps (spec 9.6)').toBe('2099-06-15')
    expect(
      copy.due_date,
      'and it is untouched by either zone, which is what "keeps" means',
    ).not.toBe(todayInZone(FAR_EAST))
  })
})
