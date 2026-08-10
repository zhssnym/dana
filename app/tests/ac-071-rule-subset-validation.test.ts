/*
AC-071: given a rule outside the 4.11 subset (COUNT, or BYMONTHDAY 29 to 31),
then 422.

This is the only criterion in P6's range that travels frozen 7.6's write
bodies rather than a transition, and it is the reason the rest of the package
can seed. The RFC 0001 P3 row deferred the recurrence_rule arm of POST /tasks
and PATCH /tasks/:id with the validator 4.11 requires revalidated
server-side; P6 delivers that validator as one grammar module and the API
role wires it in front of the recurrenceRule primitive. Until it lands, 7.0's
tolerated-unknown rule makes every case below answer 201 or 200 with the rule
dropped, which is the designed red: absence, not wrong behavior.

The criterion names two refusals and the file asserts far more, because a
validator is the one kind of code where the criterion as written is a floor
by construction. COUNT and BYMONTHDAY 29 to 31 are the two 4.11 calls out by
name and the two with stated reasons, a durable occurrence ordinal that row
deletion would corrupt and RFC skip semantics in short months. Every other
bound in that paragraph fails the same way and is asserted beside them: FREQ
outside the four, INTERVAL outside 1 to 99, BYDAY on a frequency that does
not admit it, BYMONTHDAY on one that does not, a token 4.11 never lists, and
the free-form input its last sentence rejects outright.

**The accepted half is the half that makes the file discriminate.** A
validator that refuses everything passes every refusal case here and is
useless, and it is the likelier defect than a validator that admits
everything, because the subset is narrow and a regular expression written to
the paragraph's first clause refuses the rest of it. So the whole subset is
sent and must be accepted, each rule stored and reported, each create
minting a series_id.

Accepted rules are sent in the order 4.11 enumerates their parts, which is
also the order RFC 5545 writes them, and are asserted to round-trip byte for
byte. That is not a normalization rule invented here: 4.11 rejects free-form
input and admits only strings the preset builder can produce, so an accepted
string is already canonical and there is nothing left for a store to
normalize. A rule that comes back rewritten means the input was not a preset
string, in which case it should have been refused instead.

Two things the refusals must also do, neither of them in the criterion's
sentence and both of them what a 422 means under 7.0: name the field, and
change nothing. A create refused must leave no task, and a PATCH refused must
leave the row exactly as it was, rule included.

Spec: 4.11 (the subset, its two named exclusions and their reasons, and the
free-form rejection), 7.6 (both write bodies, the dependency check that a
rule requires due_date, and the fresh series_id), 7.0 (422 with the field
named), 10.3, INV-13 (series_id beside the rule), 4.5 (the length bound of
200 and the CHECK tying the rule to a due_date).
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import {
  Cast,
  countRows,
  createFolder,
  expectStatus,
} from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import {
  createTask,
  createTaskOk,
  expectSweptTasks,
  expectTaskInvariants,
  patchTask,
  patchTaskOk,
  readTask,
  requireTaskRow,
} from './tasks-harness.js'
import { middayZone, shiftDate, todayIn } from './views-harness.js'

let app: AuthTestApp
const cast = new Cast(['author'], 'p6')

const tz = middayZone()

interface Stage {
  author: Actor
  folderId: string
  dueDate: string
}
let staged: Stage | undefined
const taskIds: string[] = []

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const [author] = await cast.of(app)
    if (author === undefined) throw new Error('cast must produce one actor')
    const folderId = await createFolder(author, 'p6 ac071 rules')
    staged = { author, folderId, dueDate: shiftDate(todayIn(tz), 3) }
  }
  return staged
}

/*
Rules outside the subset. The first four are the criterion's own two
exclusions; the rest are the other bounds of the same paragraph, each failing
for a reason 4.11 states.
*/
const REFUSED: readonly [string, string][] = [
  ['FREQ=DAILY;COUNT=5', 'COUNT is unsupported in v1 (4.11)'],
  ['FREQ=WEEKLY;BYDAY=MO;COUNT=10', 'COUNT beside a legal weekly rule (4.11)'],
  ['FREQ=MONTHLY;BYMONTHDAY=29', 'BYMONTHDAY 29 is excluded (4.11)'],
  ['FREQ=MONTHLY;BYMONTHDAY=30', 'BYMONTHDAY 30 is excluded (4.11)'],
  ['FREQ=MONTHLY;BYMONTHDAY=31', 'BYMONTHDAY 31 is excluded (4.11)'],
  ['FREQ=HOURLY', 'FREQ is one of DAILY, WEEKLY, MONTHLY, YEARLY (4.11)'],
  ['FREQ=MINUTELY', 'the same four (4.11)'],
  ['FREQ=WEEKLY;INTERVAL=0', 'INTERVAL is 1 to 99 (4.11)'],
  ['FREQ=WEEKLY;INTERVAL=100', 'INTERVAL is 1 to 99 (4.11)'],
  ['FREQ=WEEKLY;INTERVAL=-1', 'INTERVAL is 1 to 99 (4.11)'],
  ['FREQ=DAILY;BYDAY=MO', 'BYDAY only with FREQ=WEEKLY (4.11)'],
  ['FREQ=MONTHLY;BYDAY=MO', 'BYDAY only with FREQ=WEEKLY (4.11)'],
  ['FREQ=WEEKLY;BYMONTHDAY=5', 'BYMONTHDAY only with FREQ=MONTHLY (4.11)'],
  ['FREQ=MONTHLY;BYMONTHDAY=0', 'BYMONTHDAY is 1 to 28 (4.11)'],
  ['FREQ=WEEKLY;BYDAY=XX', 'BYDAY values are MO to SU (4.11)'],
  ['BYDAY=MO', 'a rule with no FREQ is not an RRULE (4.11, RFC 5545)'],
  ['every monday', 'free-form input is rejected (4.11)'],
  ['', 'the empty string is not a rule (4.11)'],
  [
    'FREQ=WEEKLY;BYDAY=MO;BYSETPOS=1',
    'a part the subset never lists, which free-form rejection excludes (4.11)',
  ],
]

/** The whole accepted subset, each part written in the order 4.11 lists it. */
const ACCEPTED: readonly [string, string][] = [
  ['FREQ=DAILY', 'the bare daily preset'],
  ['FREQ=DAILY;INTERVAL=1', 'the default interval, stated'],
  ['FREQ=DAILY;INTERVAL=99', 'the top of the interval range'],
  ['FREQ=WEEKLY;BYDAY=MO', 'weekly on one day'],
  ['FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', 'the weekdays preset of section 9'],
  ['FREQ=WEEKLY;BYDAY=SA,SU', 'a weekend pair, and SU as a value'],
  ['FREQ=WEEKLY;INTERVAL=2;BYDAY=WE', 'every N weeks, section 9\'s preset'],
  ['FREQ=MONTHLY;BYMONTHDAY=1', 'the bottom of the monthly range'],
  ['FREQ=MONTHLY;BYMONTHDAY=28', 'the top of it, the last day 4.11 admits'],
  ['FREQ=YEARLY', 'the yearly preset'],
]

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-071: a rule outside the 4.11 subset is refused', () => {
  test('AC-071: POST /tasks refuses every rule outside the subset with 422', async () => {
    const { author, folderId, dueDate } = await stage()
    const answered: string[] = []
    for (const [rule, why] of REFUSED) {
      const response = await createTask(author, {
        title: `p6 ac071 create ${rule}`,
        folder_id: folderId,
        due_date: dueDate,
        recurrence_rule: rule,
      })
      if (response.status !== 422) {
        answered.push(`${JSON.stringify(rule)} answered ${String(response.status)}, expected 422 because ${why}`)
      }
      if (response.status === 201) {
        // Track it so the sweep and the cleanup see a row that should not
        // exist; the assertion below is what reports it.
        taskIds.push(String((response.json() as { id?: unknown }).id))
      }
    }
    expect(
      answered,
      '4.11 requires the subset revalidated server-side, and 7.6 makes a rule outside it a 422 on the create body',
    ).toEqual([])
  })

  test('AC-071: PATCH /tasks/:id refuses them too', async () => {
    const { author, folderId, dueDate } = await stage()
    const task = await createTaskOk(
      author,
      {
        title: 'p6 ac071 patch target',
        folder_id: folderId,
        due_date: dueDate,
      },
      'a plain dated task is creatable (spec 7.6)',
    )
    taskIds.push(task.id)

    const answered: string[] = []
    for (const [rule, why] of REFUSED) {
      const response = await patchTask(author, task.id, {
        recurrence_rule: rule,
      })
      if (response.status !== 422) {
        answered.push(`${JSON.stringify(rule)} answered ${String(response.status)}, expected 422 because ${why}`)
      }
    }
    expect(
      answered,
      '7.6 gives PATCH the same rule as the create body: a rule set on a task must parse within the 4.11 subset',
    ).toEqual([])

    const row = await requireTaskRow(app.db, task.id)
    expect(
      row.recurrence_rule,
      'a refused PATCH changes nothing (spec 7.0: 422 is a validation failure, not a partial write)',
    ).toBeNull()
    expect(
      row.series_id,
      'and mints no series either (INV-13, spec 7.6)',
    ).toBeNull()
  })

  test('AC-071: the refusal names the field and creates nothing', async () => {
    const { author, folderId, dueDate } = await stage()
    const before = await countRows(
      app.db,
      sql`SELECT id FROM tasks WHERE folder_id = ${folderId}::uuid`,
    )
    const response = await createTask(author, {
      title: 'p6 ac071 named field',
      folder_id: folderId,
      due_date: dueDate,
      recurrence_rule: 'FREQ=DAILY;COUNT=5',
    })
    expectStatus(response, 422, 'COUNT is outside the 4.11 subset')
    const envelope = response.json() as {
      error?: { code?: unknown; message?: unknown }
    }
    expect(
      typeof envelope.error?.code === 'string' &&
        (envelope.error.code as string).length > 0,
      '7.0 gives every 4xx the envelope { error: { code, message } } with both non-empty (AC-117)',
    ).toBe(true)
    expect(
      JSON.stringify(response.json()).toLowerCase(),
      '7.0 and 10.3 return a validation failure with the field named',
    ).toMatch(/recurrence_rule|recurrence|rrule|repeat/)
    expect(
      await countRows(
        app.db,
        sql`SELECT id FROM tasks WHERE folder_id = ${folderId}::uuid`,
      ),
      'a refused create writes no task at all',
    ).toBe(before)
  })

  test('AC-071: every rule inside the subset is accepted and stored', async () => {
    const { author, folderId, dueDate } = await stage()
    const refused: string[] = []
    const seriesIds: string[] = []
    for (const [rule, why] of ACCEPTED) {
      const response = await createTask(author, {
        title: `p6 ac071 accept ${rule}`,
        folder_id: folderId,
        due_date: dueDate,
        recurrence_rule: rule,
      })
      if (response.status !== 201) {
        refused.push(`${JSON.stringify(rule)} answered ${String(response.status)}, expected 201: ${why}`)
        continue
      }
      const body = response.json() as { id: string; recurrence_rule: unknown }
      taskIds.push(body.id)
      if (body.recurrence_rule !== rule) {
        refused.push(
          `${JSON.stringify(rule)} came back as ${JSON.stringify(body.recurrence_rule)}`,
        )
      }
      const row = await requireTaskRow(app.db, body.id)
      if (row.series_id === null) {
        refused.push(`${JSON.stringify(rule)} was stored with no series_id`)
      } else {
        seriesIds.push(String(row.series_id))
      }
    }
    expect(
      refused,
      'the accepted half of 4.11: a validator that refuses the subset it exists to admit passes every refusal case above and is still wrong. Round-trip is asserted byte for byte because 4.11 admits only strings the preset builder can produce, so an accepted string is already canonical',
    ).toEqual([])
    expect(
      new Set(seriesIds).size,
      '7.6: a rule on a create gets a fresh series_id, so no two of these creates may share one',
    ).toBe(seriesIds.length)
  })

  test('AC-071 adversarial: a rule needs a due_date, on either body', async () => {
    const { author, folderId, dueDate } = await stage()
    const created = await createTask(author, {
      title: 'p6 ac071 undated rule',
      folder_id: folderId,
      recurrence_rule: 'FREQ=WEEKLY;BYDAY=MO',
    })
    expectStatus(
      created,
      422,
      '7.6\'s dependency check: recurrence_rule requires due_date, which 4.5 also makes a CHECK',
    )

    const undated = await createTaskOk(
      author,
      { title: 'p6 ac071 undated target', folder_id: folderId },
      'an undated task is creatable (spec 7.6)',
    )
    taskIds.push(undated.id)
    expectStatus(
      await patchTask(author, undated.id, {
        recurrence_rule: 'FREQ=WEEKLY;BYDAY=MO',
      }),
      422,
      '7.6: a rule set on a task without one requires a due_date',
    )

    // And the legal form of the same edit, so the refusal above is the
    // dependency rather than the endpoint refusing every rule.
    const dated = await patchTaskOk(
      author,
      undated.id,
      { due_date: dueDate, recurrence_rule: 'FREQ=WEEKLY;BYDAY=MO' },
      'a date and a rule together satisfy the dependency (spec 7.6)',
    )
    expect(
      dated.recurrence_rule,
      'the rule the PATCH set is the rule the task carries',
    ).toBe('FREQ=WEEKLY;BYDAY=MO')
    expect(
      (await requireTaskRow(app.db, undated.id)).series_id,
      '7.6: a rule set on a task without one assigns a new series_id (INV-13)',
    ).not.toBeNull()
  })

  test('AC-071 adversarial: a rule over 4.5\'s length bound is refused', async () => {
    const { author, folderId, dueDate } = await stage()
    // Legal in grammar, illegal in length: 4.5 bounds the column at 200, so
    // a validator reading only the grammar lets this reach the database and
    // fail there as a 500 instead of at the guard as a 422.
    const long = `FREQ=WEEKLY;BYDAY=${'MO,TU,WE,TH,FR,SA,SU,'.repeat(12)}MO`
    expect(long.length).toBeGreaterThan(200)
    expectStatus(
      await createTask(author, {
        title: 'p6 ac071 long rule',
        folder_id: folderId,
        due_date: dueDate,
        recurrence_rule: long,
      }),
      422,
      '4.5 bounds recurrence_rule at 200 characters, and 10.3 limits answer 422 rather than reaching the column',
    )
  })

  test('AC-071 adversarial: a wrong-typed rule is a 422, not a 400', async () => {
    const { author, folderId, dueDate } = await stage()
    for (const value of [5, true, ['FREQ=DAILY'], { freq: 'DAILY' }]) {
      expectStatus(
        await createTask(author, {
          title: 'p6 ac071 wrong type',
          folder_id: folderId,
          due_date: dueDate,
          recurrence_rule: value,
        }),
        422,
        `7.0: on a parsed object a wrong type is a validation failure naming the field, never a 400; sent ${JSON.stringify(value)}`,
      )
    }
  })

  test('AC-071: null clears a rule rather than failing validation', async () => {
    const { author, folderId, dueDate } = await stage()
    const task = await createTaskOk(
      author,
      {
        title: 'p6 ac071 clearable',
        folder_id: folderId,
        due_date: dueDate,
        recurrence_rule: 'FREQ=WEEKLY;BYDAY=MO',
      },
      'a legal rule is accepted on create (spec 7.6, 4.11)',
    )
    taskIds.push(task.id)
    const cleared = await patchTaskOk(
      author,
      task.id,
      { recurrence_rule: null },
      '7.6: setting the rule null ends the series and the row stays a normal task',
    )
    expect(cleared.recurrence_rule, 'the rule is gone').toBeNull()
    expect(
      cleared.due_date,
      'ending a series is not clearing a date: 8.4\'s cascade runs the other way round only',
    ).toBe(dueDate)
    const row = await requireTaskRow(app.db, task.id)
    expect(
      row.series_id,
      '8.5: setting the rule to null ends the series, and series_id stays for history',
    ).not.toBeNull()
    expect(
      (await readTask(author, task.id)).is_recurring,
      '7.0: is_recurring reports the rule the row carries',
    ).toBe(false)
  })

  test('AC-071: invariants hold afterwards', async () => {
    const { author, folderId } = await stage()
    expectSweptTasks(taskIds)
    await expectTaskInvariants(app.db, taskIds, [folderId], [author.id])
  })
})
