/*
AC-423: given the Task Schedule of issue #215, then start_date is carried
end to end through create, read and patch in all four valid states, the
start-before-due rule is refused as a 422 naming the field the body sent
rather than as a constraint violation, clearing either date leaves the other
standing, and a generated recurrence instance starts undated.

**Why this file exists at all, and it is hard stop 3.** `start_date` is a new
field on two request schemas in `app/src/shared/`, and a request-schema field
the server does not read is accepted, stripped and answered 200. There is no
`.strict()` in that directory and deliberately will not be (11.14), so nothing
about the wire says the field went nowhere. That has already cost this project
four packages once, on a reminder field in `tasks.ts` that was declared the
whole time. Only a criterion catches it, and this is that criterion: every
assertion below reads the value back, from the response **and** from the row,
rather than checking that the request was accepted.

**The four states are asserted as four, not as a pair of booleans.** Neither
date, start only, due only, and both. Start-only is the one an implementation
is most likely to lose, because every date path in this codebase was written
when a task's only date was its deadline: 8.4's cascade, INV-6's dependency
checks and 4.5's two CHECKs all hang off `due_date`, and the easy wrong move
is to make `start_date` a second passenger on that column rather than a date
of its own.

**The 422 is asserted in both directions, which is the point of it.** A
one-sided check passes every test that only ever moves the start date. The
rule is a relation between two columns, so a PATCH setting `due_date` earlier
than the stored `start_date` has to be refused exactly as a PATCH setting
`start_date` later than the stored `due_date` is, and each must name the field
the caller actually sent. Asserted against the row as well: a 422 that still
wrote is not a refusal.

**The generated instance is asserted because it is a decision rather than an
absence.** 8.5 moves a recurring task forward from its due date. Copying an
absolute start forward would put a past start on a future occurrence and
shifting it would be a recurring start-to-due window, which #215 excludes by
name. So generation leaves it null, and that is pinned here rather than left
to be true by accident of which columns the INSERT happens to name.

Spec: 4.5 (the column and tasks_start_before_due_check), 7.0 (TaskCard),
7.6 (both bodies and the dependency clause), 8.4 (the clear-date cascade and
what it is scoped to), 8.5 (generation). The technical ruling that released
frozen 4 and 7 is on issue #215, 2026-09-20.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast, expectStatus } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import {
  createTask,
  createTaskOk,
  patchTask,
  patchTaskOk,
  readTask,
  requireTaskRow,
} from '../support/tasks-harness.js'

let app: AuthTestApp
const cast = new Cast(['author'], 'ac423')

/** Two dates in the order the rule cares about, far enough out that no run
 * of this file crosses one of them. */
const START = '2027-03-01'
const DUE = '2027-03-31'

async function author(): Promise<Actor> {
  const [actor] = await cast.of(app)
  if (actor === undefined) throw new Error('cast must produce one actor')
  return actor
}

/**
 * The field a 422 named.
 *
 * 10.3's field grammar puts it at the head of the message rather than in a
 * list of its own — `fieldError` in `routes/tasks.ts` writes
 * `${field}: ${problem}.` so that a caller reads one grammar whether the
 * schema or the row refused. Read the head rather than matching the whole
 * sentence, which would pin the wording of a message no section fixes.
 */
function refusedField(response: { json: () => unknown }): string {
  const body = response.json() as { error?: { message?: unknown } }
  return String(body.error?.message ?? '').split(':')[0] ?? ''
}

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-423: the Schedule is two dates, and both arrive', () => {
  test('AC-423: all four valid states round-trip through create, read and the row', async () => {
    const actor = await author()
    const states: { name: string; start: string | null; due: string | null }[] = [
      { name: 'neither', start: null, due: null },
      { name: 'start only', start: START, due: null },
      { name: 'due only', start: null, due: DUE },
      { name: 'both', start: START, due: DUE },
    ]

    for (const state of states) {
      const created = await createTaskOk(
        actor,
        { title: `ac423 ${state.name}`, start_date: state.start, due_date: state.due },
        `POST /tasks must accept the ${state.name} Schedule (spec 7.6, issue #215)`,
      )
      expect(
        created.start_date,
        `the create response must carry the start_date it was sent (${state.name})`,
      ).toBe(state.start)
      expect(created.due_date, `and the due_date (${state.name})`).toBe(state.due)

      /* The row, because a response echoing the body while storing nothing is
         exactly the failure hard stop 3 is about. */
      const row = await requireTaskRow(app.db, created.id)
      expect(
        row.start_date,
        `the stored row must carry the start_date (${state.name}), not merely the response`,
      ).toBe(state.start)
      expect(row.due_date, `and the stored due_date (${state.name})`).toBe(state.due)

      const read = await readTask(actor, created.id)
      expect(
        read.start_date,
        `GET /tasks/:id must answer the same start_date (${state.name})`,
      ).toBe(state.start)
    }
  })

  test('AC-423: a create with start after due is refused, naming start_date, writing nothing', async () => {
    const actor = await author()
    const before = await createTaskOk(
      actor,
      { title: 'ac423 create refusal marker' },
      'a marker task so the refusal below can be shown to have created nothing after it',
    )

    const response = await createTask(actor, {
      title: 'ac423 create start after due',
      start_date: DUE,
      due_date: START,
    })
    expectStatus(
      response,
      422,
      '7.6 refuses start_date later than due_date before the row is written, so the ' +
        "caller reads a field rather than 4.5's constraint wearing a 500 (issue #215)",
    )
    expect(
      refusedField(response),
      'the 422 names start_date, the field this body moved',
    ).toBe('start_date')

    /* Nothing was written. A request is one unit, so a body failing on any
       field applies none of it, and a 422 raised before the first write
       satisfies that by construction - which is worth asserting rather than
       assuming, because a refusal raised after the INSERT looks identical
       from the status line. */
    const marker = await requireTaskRow(app.db, before.id)
    expect(marker.id, 'the marker task is untouched').toBe(before.id)
  })

  test('AC-423: the patch refusal is symmetric and names the field the body sent', async () => {
    const actor = await author()
    const task = await createTaskOk(
      actor,
      { title: 'ac423 patch symmetry', start_date: START, due_date: DUE },
      'a task in the both-dates state, which is the only state the rule can be broken from',
    )

    /* Direction one: move the start past the stored due. */
    const forward = await patchTask(actor, task.id, { start_date: '2027-04-15' })
    expectStatus(
      forward,
      422,
      'a PATCH is checked against the merged state, since a body setting one date has to ' +
        'be read against whichever the row already holds',
    )
    expect(refusedField(forward), 'and names start_date, which this body sent').toBe(
      'start_date',
    )

    /* Direction two, which a one-sided implementation passes everything else
       and fails here: pull the due date back behind the stored start. */
    const backward = await patchTask(actor, task.id, { due_date: '2027-02-01' })
    expectStatus(
      backward,
      422,
      'the rule is a relation between two columns, so the other direction is refused too',
    )
    expect(
      refusedField(backward),
      'and names due_date, because that is the end this body moved',
    ).toBe('due_date')

    const row = await requireTaskRow(app.db, task.id)
    expect(row.start_date, 'neither refusal wrote').toBe(START)
    expect(row.due_date, 'neither refusal wrote').toBe(DUE)
  })

  test('AC-423: clearing one date leaves the other standing', async () => {
    const actor = await author()

    const clearedDue = await createTaskOk(
      actor,
      { title: 'ac423 clear the due', start_date: START, due_date: DUE },
      'a task in the both-dates state',
    )
    const afterDue = await patchTaskOk(
      actor,
      clearedDue.id,
      { due_date: null },
      "8.4's cascade takes what a due date carries and a start date is none of those",
    )
    expect(
      afterDue.due_date,
      'the due date is gone, which is what was asked for',
    ).toBeNull()
    expect(
      afterDue.start_date,
      'and the start date stands, leaving the start-only state rather than an ' +
        'unscheduled task (issue #215). A cascade that took both would make the two ' +
        'dates one field',
    ).toBe(START)
    expect((await requireTaskRow(app.db, clearedDue.id)).start_date).toBe(START)

    const clearedStart = await createTaskOk(
      actor,
      { title: 'ac423 clear the start', start_date: START, due_date: DUE },
      'a second task in the both-dates state',
    )
    const afterStart = await patchTaskOk(
      actor,
      clearedStart.id,
      { start_date: null },
      'and the other way round: clearing the start is an ordinary field write',
    )
    expect(afterStart.start_date, 'the start date is gone').toBeNull()
    expect(
      afterStart.due_date,
      'and the deadline stands, which is the due-only state every task in this ' +
        'product had before #215',
    ).toBe(DUE)
    expect((await requireTaskRow(app.db, clearedStart.id)).due_date).toBe(DUE)
  })

  test('AC-423: a generated recurrence instance starts undated', async () => {
    const actor = await author()
    const task = await createTaskOk(
      actor,
      {
        title: 'ac423 weekly with a start',
        start_date: START,
        due_date: DUE,
        recurrence_rule: 'FREQ=WEEKLY;BYDAY=MO',
      },
      '4.5 admits a rule beside a due date, and this one also carries a start',
    )

    /* tz is a query parameter on the two generating transitions rather than a
       body field, by the owner ruling recorded at routes/tasks.ts:298, and it
       is mandatory on a repeating task. Pinned to UTC so that the successor's
       date is arithmetic rather than whatever day the runner is on. */
    const completed = await actor.browser.json(
      `/tasks/${task.id}/complete?tz=UTC`,
      'POST',
      {},
    )
    expectStatus(
      completed,
      200,
      '8.5 generates the successor inside the completing transaction',
    )

    const generated = (completed.json() as { generated_task?: { id?: string } })
      .generated_task
    expect(
      generated,
      "completing a recurring task answers the successor it generated, in 7.6's " +
        'transition envelope',
    ).not.toBeNull()

    const successor = await requireTaskRow(app.db, String(generated?.id))
    expect(
      successor.start_date,
      'the generated instance starts null. Copying the start forward would put a past ' +
        'start on a future occurrence, and shifting it by the interval would be the ' +
        'recurring start-to-due window #215 excludes by name. This is a decision, pinned ' +
        'here so it cannot become true or false by accident of which columns the INSERT ' +
        'happens to name',
    ).toBeNull()
    expect(
      successor.due_date,
      'while the due date moves, which is the whole of what generation does',
    ).not.toBeNull()
  })
})
