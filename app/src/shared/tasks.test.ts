import { describe, expect, test } from 'vitest'

import {
  carriesStatus,
  patchStepBody,
  patchTaskBody,
  postTaskStepsBody,
  postTasksBody,
  putTaskReminderBody,
  putTaskReminderResponse,
  taskCard,
  taskDetail,
  taskReminder,
  taskStep,
  taskTransitionResponse,
} from './tasks.js'

/* The 7.0 key lists, transcribed from the frozen text rather than derived
 * from the schemas they check. */
const TASK_CARD_KEYS = [
  'id',
  'title',
  'status',
  'important',
  'due_date',
  'due_time',
  'folder',
  'assignee',
  'is_recurring',
  'steps_done',
  'steps_total',
  'pulled',
  'pending_invite_email',
  'created_at',
  'updated_at',
]
const TASK_DETAIL_EXTRA_KEYS = [
  'notes',
  'recurrence_rule',
  'section_block_id',
  'series_id',
  'reminder',
  'steps',
  'completed_at',
  'completed_by',
  'created_by',
]

const someUuid = '123e4567-e89b-42d3-a456-426614174000'
const otherUuid = '223e4567-e89b-42d3-a456-426614174000'

describe('postTasksBody (7.6: the create body, 10.3: the limits)', () => {
  test('accepts a title alone, the whole of AC-025\'s body', () => {
    const result = postTasksBody.safeParse({ title: 'Buy milk' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(
        result.data,
        'the three 7.6 defaults are resolved where V is known, not invented here',
      ).toEqual({ title: 'Buy milk' })
    }
  })

  test('accepts both title boundaries and refuses both sides of them', () => {
    expect(postTasksBody.safeParse({ title: 'x' }).success).toBe(true)
    expect(postTasksBody.safeParse({ title: 'x'.repeat(300) }).success).toBe(true)
    expect(postTasksBody.safeParse({ title: '' }).success).toBe(false)
    expect(postTasksBody.safeParse({ title: 'x'.repeat(301) }).success).toBe(false)
    expect(
      postTasksBody.safeParse({}).success,
      'title is required by 7.6, so a body without one is refused',
    ).toBe(false)
    for (const title of [123, true, null, ['x'], { title: 'x' }]) {
      expect(
        postTasksBody.safeParse({ title }).success,
        `${JSON.stringify(title)} is not a string`,
      ).toBe(false)
    }
  })

  test('carries both arms P3 deferred, the second of them since P7', () => {
    const result = postTasksBody.safeParse({
      title: 'Water the plants',
      due_date: '2026-08-20',
      due_time: '18:00',
      recurrence_rule: 'FREQ=WEEKLY;BYDAY=MO',
      reminder: { offset_minutes: 30 },
    })
    expect(
      result.success,
      'P6 delivers the 4.11 validator and P7 the 8.6 instant, so both are fields of the body rather than unknown ones',
    ).toBe(true)
    if (result.success) {
      expect(
        result.data,
        'neither arm falls to 7.0\'s tolerated-unknown rule any longer, and the reminder parses to 4.8\'s two columns whichever spelling arrived',
      ).toEqual({
        title: 'Water the plants',
        due_date: '2026-08-20',
        due_time: '18:00',
        recurrence_rule: 'FREQ=WEEKLY;BYDAY=MO',
        reminder: { offset_minutes: 30, time_of_day: null },
      })
    }
  })

  test('strips status too, which is 7.6\'s rule for PATCH and not for create', () => {
    const result = postTasksBody.safeParse({
      title: 'Already done?',
      status: 'completed',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(
        'status' in result.data,
        'a create names no status, so a sent one is an unknown field (7.0), and 4.5 makes the new row pending',
      ).toBe(false)
    }
  })

  test('refuses a due_time with no due_date, naming the field (AC-027)', () => {
    const result = postTasksBody.safeParse({
      title: 'Timed and undated',
      due_time: '09:30',
    })
    expect(
      result.success,
      'INV-6 admits a due_time only beside a due_date, and 7.6 answers 422 rather than letting the 4.5 CHECK answer 500',
    ).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['due_time'])
      expect(result.error.issues[0]?.message).toContain('due_date')
    }
  })

  test('refuses a due_time beside an explicitly null due_date', () => {
    expect(
      postTasksBody.safeParse({
        title: 'Cleared and timed',
        due_date: null,
        due_time: '09:30',
      }).success,
      'a null date sets no date, so it cannot carry a time either',
    ).toBe(false)
  })

  test('accepts a due_time beside a due_date, and a null time alone', () => {
    expect(
      postTasksBody.safeParse({
        title: 'Dated and timed',
        due_date: '2026-08-20',
        due_time: '09:30',
      }).success,
    ).toBe(true)
    expect(
      postTasksBody.safeParse({ title: 'Untimed', due_time: null }).success,
      'a null time demands nothing of the date',
    ).toBe(true)
  })

  test('holds due_time to 4.11\'s minute precision, echo included', () => {
    const accepted = ['00:00', '09:30', '23:59', '09:30:00']
    for (const due_time of accepted) {
      expect(
        postTasksBody.safeParse({
          title: 'Timed',
          due_date: '2026-08-20',
          due_time,
        }).success,
        `${due_time} is a minute-precision wall clock (the HH:MM:00 form is what a response echoes back)`,
      ).toBe(true)
    }
    const refused = ['09:30:45', '9:30', '24:00', '23:60', '0930', 'morning']
    for (const due_time of refused) {
      expect(
        postTasksBody.safeParse({
          title: 'Timed',
          due_date: '2026-08-20',
          due_time,
        }).success,
        `${due_time} is not a minute-precision wall clock (spec 4.11)`,
      ).toBe(false)
    }
  })

  test('holds due_date to a real calendar date (spec 4.11)', () => {
    expect(
      postTasksBody.safeParse({ title: 'Dated', due_date: '2026-08-20' }).success,
    ).toBe(true)
    expect(
      postTasksBody.safeParse({ title: 'Undated', due_date: null }).success,
    ).toBe(true)
    for (const due_date of [
      '2026-02-30',
      '2026-13-01',
      '2026-8-20',
      '20260820',
      '2026-08-20T00:00:00.000Z',
      1_756_000_000_000,
    ]) {
      expect(
        postTasksBody.safeParse({ title: 'Dated', due_date }).success,
        `${JSON.stringify(due_date)} is not a floating calendar date`,
      ).toBe(false)
    }
  })

  test('refuses a recurrence_rule with no due_date, naming the field', () => {
    const result = postTasksBody.safeParse({
      title: 'Repeating and undated',
      recurrence_rule: 'FREQ=WEEKLY;BYDAY=MO',
    })
    expect(
      result.success,
      '7.6 lists recurrence_rule among the fields that require due_date, and 4.5 backs it with a CHECK',
    ).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['recurrence_rule'])
      expect(result.error.issues[0]?.message).toContain('due_date')
    }
    expect(
      postTasksBody.safeParse({
        title: 'Cleared and repeating',
        due_date: null,
        recurrence_rule: 'FREQ=DAILY',
      }).success,
      'a null date sets no date, so it cannot carry a rule either',
    ).toBe(false)
    expect(
      postTasksBody.safeParse({ title: 'Plain', recurrence_rule: null }).success,
      'a null rule demands nothing of the date',
    ).toBe(true)
  })

  test('caps steps at 10.3\'s fifty and checks each title (AC-043)', () => {
    const titles = (count: number): string[] =>
      Array.from({ length: count }, (_unused, index) => `step ${String(index)}`)
    expect(postTasksBody.safeParse({ title: 'Full', steps: titles(50) }).success).toBe(
      true,
    )
    const over = postTasksBody.safeParse({ title: 'Overfull', steps: titles(51) })
    expect(over.success, 'the cap is 50 (spec 7.6, 10.3)').toBe(false)
    if (!over.success) {
      expect(over.error.issues[0]?.path).toEqual(['steps'])
    }
    const empty = postTasksBody.safeParse({ title: 'Blank step', steps: ['ok', ''] })
    expect(empty.success, 'a step title is 1 to 300 characters (10.3)').toBe(false)
    if (!empty.success) {
      expect(
        empty.error.issues[0]?.path,
        'the path names the element, so the 422 says which step',
      ).toEqual(['steps', 1])
    }
  })

  test('admits a null assignee_id, which the single-member folder repairs', () => {
    expect(
      postTasksBody.safeParse({ title: 'Unassigned', assignee_id: null }).success,
      'the mid-P3 ruling makes INV-5 forcing win over the composite-FK 422 on create (AC-026)',
    ).toBe(true)
    expect(
      postTasksBody.safeParse({ title: 'Assigned', assignee_id: someUuid }).success,
    ).toBe(true)
    expect(
      postTasksBody.safeParse({ title: 'Assigned', assignee_id: 'nobody' }).success,
      'a non-member is a 422 the rows answer; a non-uuid is one the body answers',
    ).toBe(false)
  })

  test('takes the remaining 7.6 fields at their 4.5 nullabilities', () => {
    const result = postTasksBody.safeParse({
      title: 'Everything the body admits',
      folder_id: someUuid,
      notes: 'a note',
      important: true,
      due_date: '2026-08-20',
      due_time: '17:00',
      assignee_id: otherUuid,
      steps: ['one', 'two'],
    })
    expect(result.success).toBe(true)
    expect(
      postTasksBody.safeParse({ title: 'Noteless', notes: null }).success,
      'notes is nullable in 4.5',
    ).toBe(true)
    expect(
      postTasksBody.safeParse({ title: 'Homeless', folder_id: null }).success,
      'INV-1: folder_id is never null',
    ).toBe(false)
    expect(
      postTasksBody.safeParse({
        title: 'Long notes',
        notes: 'x'.repeat(10_001),
      }).success,
      'notes is at most 10000 characters (10.3)',
    ).toBe(false)
    expect(
      postTasksBody.safeParse({ title: 'Flagged', important: 'yes' }).success,
    ).toBe(false)
  })
})

describe('patchTaskBody (7.6: only present fields change)', () => {
  test('accepts the empty body as a no-op', () => {
    const result = patchTaskBody.safeParse({})
    expect(result.success, 'an empty subset is a subset (the P2 PATCH reading)').toBe(
      true,
    )
    if (result.success) expect(result.data).toEqual({})
  })

  test('keeps an absent field absent rather than undefined (AC-035)', () => {
    const result = patchTaskBody.safeParse({ title: 'Only the title' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(
        'notes' in result.data,
        'a handler writes the keys it finds, so an absent field must not arrive as one',
      ).toBe(false)
      expect(Object.keys(result.data)).toEqual(['title'])
    }
  })

  test('takes null on every field 4.5 makes nullable, and on no other', () => {
    for (const body of [
      { notes: null },
      { due_date: null },
      { due_time: null },
      { recurrence_rule: null },
      { assignee_id: null },
    ]) {
      expect(
        patchTaskBody.safeParse(body).success,
        `${JSON.stringify(body)} clears a nullable column`,
      ).toBe(true)
    }
    for (const body of [{ title: null }, { folder_id: null }, { important: null }]) {
      expect(
        patchTaskBody.safeParse(body).success,
        `${JSON.stringify(body)} clears a NOT NULL column (spec 4.5, INV-1)`,
      ).toBe(false)
    }
  })

  test('refuses a body that clears the date and sets the time', () => {
    const result = patchTaskBody.safeParse({ due_date: null, due_time: '08:00' })
    expect(
      result.success,
      '8.4 nulls due_time on the clear, so honoring both would drop a field the caller sent',
    ).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['due_time'])
    }
    expect(
      patchTaskBody.safeParse({ due_date: null, due_time: null }).success,
      'clearing both is the cascade stated twice, not a contradiction',
    ).toBe(true)
    expect(
      patchTaskBody.safeParse({ due_date: null }).success,
      'the clear-date cascade of 8.4 is an ordinary legal PATCH (AC-028)',
    ).toBe(true)
  })

  test('leaves the row-dependent half of INV-6 to the domain module', () => {
    expect(
      patchTaskBody.safeParse({ due_time: '08:00' }).success,
      'legal against a dated task and refused against an undated one, which needs the row (7.11)',
    ).toBe(true)
    expect(
      patchTaskBody.safeParse({ recurrence_rule: 'FREQ=DAILY' }).success,
      '7.6\'s "requires due_date" on a rule is the same shape of rule, and only the row can say which case this is',
    ).toBe(true)
  })

  test('refuses a body that clears the date and sets a rule', () => {
    const result = patchTaskBody.safeParse({
      due_date: null,
      recurrence_rule: 'FREQ=DAILY',
    })
    expect(
      result.success,
      '8.4 nulls recurrence_rule on the clear, and 4.5\'s CHECK forbids the row this body asks for',
    ).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['recurrence_rule'])
    }
    expect(
      patchTaskBody.safeParse({ due_date: null, recurrence_rule: null }).success,
      'clearing both is the cascade stated twice, not a contradiction',
    ).toBe(true)
    expect(
      patchTaskBody.safeParse({
        due_date: '2026-08-20',
        recurrence_rule: 'FREQ=WEEKLY;BYDAY=MO',
      }).success,
      '7.6: a date and a rule together are how the dependency is satisfied on a task that had no date',
    ).toBe(true)
    expect(
      patchTaskBody.safeParse({ recurrence_rule: null }).success,
      '7.6: setting the rule null ends the series and the row stays a normal task',
    ).toBe(true)
  })

  test('strips status, which is why carriesStatus exists (AC-034)', () => {
    const result = patchTaskBody.safeParse({ important: true, status: 'completed' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(
        'status' in result.data,
        'the schema cannot answer this one: its failures are 422s and 7.6 wants 409',
      ).toBe(false)
    }
  })

  test('accepts a move and an assignment by uuid, refusing anything else', () => {
    expect(patchTaskBody.safeParse({ folder_id: someUuid }).success).toBe(true)
    expect(patchTaskBody.safeParse({ assignee_id: someUuid }).success).toBe(true)
    expect(patchTaskBody.safeParse({ folder_id: 'f1' }).success).toBe(false)
    expect(patchTaskBody.safeParse({ assignee_id: 42 }).success).toBe(false)
  })
})

/*
The recurrence_rule arm, on both write bodies at once, because 4.11 requires
the subset revalidated server-side and scopes that to no single endpoint: a
PATCH that stored what the create refuses would put free-form input in the
column by the back door.

The grammar itself is shared/recurrence.test.ts's subject and is not restated
here. What these check is the wiring: that the primitive holds both of the two
bounds 4.5 and 4.11 state, that the 4.11 refusal reaches a caller as a field
error rather than as a type error, and that the accepted subset is accepted,
which is the half a validator written only to the refusals passes while being
useless.
*/
describe('recurrenceRule on both 7.6 write bodies (4.11, 4.5, 10.3)', () => {
  const dated = (recurrence_rule: unknown): unknown => ({
    title: 'Repeating',
    due_date: '2026-08-20',
    recurrence_rule,
  })

  test('accepts the 4.11 subset unchanged, on create and on PATCH', () => {
    for (const rule of [
      'FREQ=DAILY',
      'FREQ=DAILY;INTERVAL=99',
      'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
      'FREQ=WEEKLY;INTERVAL=2;BYDAY=WE',
      'FREQ=MONTHLY;BYMONTHDAY=28',
      'FREQ=YEARLY',
      'FREQ=WEEKLY;BYDAY=MO;UNTIL=20260831',
    ]) {
      const created = postTasksBody.safeParse(dated(rule))
      expect(created.success, `${rule} is inside the 4.11 subset`).toBe(true)
      if (created.success) {
        expect(
          created.data.recurrence_rule,
          '4.11 admits only preset-builder strings, so an accepted rule is already canonical and nothing normalizes it',
        ).toBe(rule)
      }
      expect(
        patchTaskBody.safeParse({ recurrence_rule: rule }).success,
        `${rule} is the same subset on the PATCH body`,
      ).toBe(true)
    }
  })

  test('refuses what 4.11 excludes, on create and on PATCH alike', () => {
    for (const rule of [
      'FREQ=DAILY;COUNT=5',
      'FREQ=MONTHLY;BYMONTHDAY=29',
      'FREQ=MONTHLY;BYMONTHDAY=31',
      'FREQ=HOURLY',
      'FREQ=WEEKLY;INTERVAL=0',
      'FREQ=WEEKLY;INTERVAL=100',
      'FREQ=DAILY;BYDAY=MO',
      'FREQ=WEEKLY;BYMONTHDAY=5',
      'FREQ=WEEKLY;BYDAY=XX',
      'FREQ=WEEKLY;BYDAY=MO;BYSETPOS=1',
      'FREQ=WEEKLY;BYDAY=MO;UNTIL=2026-08-31',
      'BYDAY=MO',
      'every monday',
      '',
    ]) {
      expect(
        postTasksBody.safeParse(dated(rule)).success,
        `${JSON.stringify(rule)} is outside the 4.11 subset (AC-071)`,
      ).toBe(false)
      expect(
        patchTaskBody.safeParse({ recurrence_rule: rule }).success,
        `${JSON.stringify(rule)} is outside it on the PATCH body too`,
      ).toBe(false)
    }
  })

  test('names the field and says which part of the subset was left', () => {
    const result = postTasksBody.safeParse(dated('FREQ=DAILY;COUNT=5'))
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(
        result.error.issues[0]?.path,
        '10.3: the 422 names the field it refused',
      ).toEqual(['recurrence_rule'])
      expect(
        result.error.issues[0]?.message,
        'the grammar\'s reason is written in 4.11\'s terms for exactly this body',
      ).toContain('COUNT')
    }
  })

  test('holds 4.5\'s 200 characters as well as the grammar', () => {
    // Legal in grammar, illegal in length: BYDAY is a list, so a rule can
    // repeat days until it outgrows the column while still parsing.
    const long = `FREQ=WEEKLY;BYDAY=${'MO,TU,WE,TH,FR,SA,SU,'.repeat(12)}MO`
    expect(long.length).toBeGreaterThan(200)
    const result = postTasksBody.safeParse(dated(long))
    expect(
      result.success,
      '4.5 bounds the column at 200 and 10.3 makes it a server-enforced limit, so the grammar alone is not enough',
    ).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['recurrence_rule'])
      expect(result.error.issues[0]?.message).toContain('200')
    }
  })

  test('answers a wrong-typed rule as a field error, never as a body error', () => {
    for (const value of [5, true, ['FREQ=DAILY'], { freq: 'DAILY' }]) {
      const result = postTasksBody.safeParse(dated(value))
      expect(
        result.success,
        `7.0: on a parsed object a wrong type is a validation failure naming the field; sent ${JSON.stringify(value)}`,
      ).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0]?.path).toEqual(['recurrence_rule'])
      }
    }
  })
})

/*
The reminder arm, P3's second deferral and the last one this build carried,
across the three bodies that write a reminder: frozen 7.9's PUT and both of
frozen 7.6's write bodies.

What these check is where the line falls. Every rule 4.8 and 7.9 state about a
reminder is here in one of three positions: a property of the value sent
(10.3's offset range, 4.11's minute precision), a relation between fields of
one body (the exclusive-or on all three, and the whole of the dependency and
mode rules on the create), or a relation with the row, which no schema can see
and which the domain module answers. The cases below assert the first two and
assert that the third is admitted rather than guessed at, because a schema
that refuses a legal PATCH is as wrong as one that accepts an illegal create.
*/
describe('the reminder arm (7.9, 7.6, 4.8, 10.3)', () => {
  const created = (extra: Record<string, unknown>): unknown => ({
    title: 'Remind me',
    due_date: '2026-08-20',
    ...extra,
  })

  /*
  A create carrying a time_of_day needs no due_time and an offset needs one,
  so the mode rule and the exclusive-or would collide on that body if the
  fixture below sent one due_time for both modes. This puts the right one
  beside each mode, leaving the exclusive-or as the only rule under test.
  */
  function modeShapedExtras(reminder: {
    offset_minutes?: number | null
    time_of_day?: string | null
  }): Record<string, unknown> {
    return typeof reminder.time_of_day === 'string' ? { due_time: null } : {}
  }

  test('4.8\'s exclusive-or is the same rule on all three bodies', () => {
    const modes = [
      [{ offset_minutes: 30 }, true],
      [{ time_of_day: '09:00' }, true],
      [{ offset_minutes: 30, time_of_day: null }, true],
      [{ offset_minutes: null, time_of_day: '09:00' }, true],
      [{}, false],
      [{ offset_minutes: null }, false],
      [{ offset_minutes: null, time_of_day: null }, false],
      [{ offset_minutes: 30, time_of_day: '09:00' }, false],
    ] as const

    for (const [reminder, ok] of modes) {
      const why = `4.8 CHECKs ((offset_minutes IS NULL) <> (time_of_day IS NULL)); sent ${JSON.stringify(reminder)}`
      expect(putTaskReminderBody.safeParse(reminder).success, why).toBe(ok)
      expect(
        postTasksBody.safeParse(
          created({ due_time: '18:00', reminder, ...modeShapedExtras(reminder) }),
        ).success,
        `${why}, through 7.6's create body`,
      ).toBe(ok)
      expect(
        patchTaskBody.safeParse({ reminder }).success,
        `${why}, through 7.6's PATCH body`,
      ).toBe(ok)
    }
  })

  test('null is not a mode, which is what AC-147 sends', () => {
    const result = putTaskReminderBody.safeParse({ offset_minutes: null })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(
        result.error.issues[0]?.path,
        'the rule is about the body, not about one of its two fields, so it names no field and says so in a whole sentence',
      ).toEqual([])
      expect(result.error.issues[0]?.message).toContain('Exactly one of')
    }
  })

  test('a nested failure names the field the way every other message here does', () => {
    const result = postTasksBody.safeParse(created({ reminder: {} }))
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(
        result.error.issues[0]?.path,
        'sendValidationError joins the path, so a caller reads "reminder: must carry exactly one ..."',
      ).toEqual(['reminder'])
    }
  })

  test('holds the offset to 10.3\'s range on every body that writes one', () => {
    for (const [offset, ok] of [
      [0, true],
      [10_080, true],
      [-1, false],
      [10_081, false],
      [1_000_000, false],
      [30.5, false],
    ] as const) {
      const reminder = { offset_minutes: offset }
      const why = `10.3 and the 4.8 CHECK admit 0 to 10080 minutes; sent ${String(offset)}`
      expect(putTaskReminderBody.safeParse(reminder).success, why).toBe(ok)
      expect(
        postTasksBody.safeParse(created({ due_time: '18:00', reminder })).success,
        `${why}, on the create`,
      ).toBe(ok)
      expect(
        patchTaskBody.safeParse({ reminder }).success,
        `${why}, on the PATCH`,
      ).toBe(ok)
    }
  })

  test('holds time_of_day to 4.11\'s minute precision, the write form', () => {
    for (const [time, ok] of [
      ['00:00', true],
      ['09:00', true],
      ['23:59', true],
      ['09:00:00', true],
      ['09:00:30', false],
      ['9:00', false],
      ['24:00', false],
      ['morning', false],
    ] as const) {
      expect(
        putTaskReminderBody.safeParse({ time_of_day: time }).success,
        `4.8 stores time_of_day at minute precision, the rule due_time carries; sent ${time}`,
      ).toBe(ok)
    }
  })

  test('a parsed reminder is always 4.8\'s two columns, whichever spelling arrived', () => {
    for (const sent of [
      { offset_minutes: 30 },
      { offset_minutes: 30, time_of_day: null },
      { offset_minutes: 30, unknown_key: 'ignored' },
    ]) {
      const result = putTaskReminderBody.safeParse(sent)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(
          result.data,
          '7.0 answers both keys with one null, so a client can echo what it read, and the domain module reads one shape rather than three',
        ).toEqual({ offset_minutes: 30, time_of_day: null })
      }
    }
  })

  test('the create answers 7.6\'s dependency check for the third field', () => {
    const result = postTasksBody.safeParse({
      title: 'Undated but reminded',
      reminder: { time_of_day: '09:00' },
    })
    expect(
      result.success,
      '7.6: due_time, recurrence_rule and reminder require due_date, 422. INV-6 is the invariant, and AC-149 asserts the create rolls back whole',
    ).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['reminder'])
      expect(result.error.issues[0]?.message).toContain('due_date')
    }
    expect(
      postTasksBody.safeParse({ title: 'Neither', reminder: null }).success,
      'a null reminder sets nothing, so it demands no date, which is how notes and recurrence_rule read a null too',
    ).toBe(true)
  })

  test('the create answers 4.8\'s mode rule, because it sets the due_time itself', () => {
    expect(
      postTasksBody.safeParse(
        created({ due_time: '18:00', reminder: { offset_minutes: 30 } }),
      ).success,
      'the offset mode beside the due_time it is measured from',
    ).toBe(true)
    expect(
      postTasksBody.safeParse(created({ reminder: { time_of_day: '09:00' } }))
        .success,
      'and the date-only mode on a task with no due_time',
    ).toBe(true)

    const offsetWithoutTime = postTasksBody.safeParse(
      created({ reminder: { offset_minutes: 30 } }),
    )
    expect(
      offsetWithoutTime.success,
      '4.8: offset requires the task\'s due_time, and on a create the body is the only place that time can come from (AC-149, AC-090 through the other door)',
    ).toBe(false)
    if (!offsetWithoutTime.success) {
      expect(offsetWithoutTime.error.issues[0]?.path).toEqual([
        'reminder',
        'offset_minutes',
      ])
    }

    const timeOfDayWithTime = postTasksBody.safeParse(
      created({ due_time: '18:00', reminder: { time_of_day: '09:00' } }),
    )
    expect(
      timeOfDayWithTime.success,
      '4.8: time_of_day requires the absence of a due_time, which is AC-147\'s converse wrong mode',
    ).toBe(false)
    if (!timeOfDayWithTime.success) {
      expect(timeOfDayWithTime.error.issues[0]?.path).toEqual([
        'reminder',
        'time_of_day',
      ])
    }
  })

  test('the PATCH leaves the row\'s half of the same rules to the row', () => {
    expect(
      patchTaskBody.safeParse({ reminder: { offset_minutes: 30 } }).success,
      'legal against a task carrying a due_time and refused against one that does not, which only the row can say (7.11 lists the date-dependency rules as server-authoritative)',
    ).toBe(true)
    expect(
      patchTaskBody.safeParse({ reminder: { time_of_day: '09:00' } }).success,
      'and the same on the other mode',
    ).toBe(true)
    expect(
      patchTaskBody.safeParse({
        due_time: '18:30',
        reminder: { offset_minutes: 30 },
      }).success,
      'a due_time moving between two values invalidates no mode (8.4\'s closing paragraph, AC-151)',
    ).toBe(true)
  })

  test('the PATCH refuses the contradictions a body states without the row', () => {
    const clearing = patchTaskBody.safeParse({
      due_date: null,
      reminder: { time_of_day: '09:00' },
    })
    expect(
      clearing.success,
      '8.4\'s cascade deletes the reminder when the date is cleared, so honoring both drops one of the two fields the caller sent',
    ).toBe(false)
    if (!clearing.success) {
      expect(clearing.error.issues[0]?.path).toEqual(['reminder'])
    }

    expect(
      patchTaskBody.safeParse({
        due_time: null,
        reminder: { offset_minutes: 30 },
      }).success,
      'the 8.4 arm ruled on 2026-08-10: clearing due_time deletes an offset reminder, so a body that clears it and sets one asks for the row it just deleted (AC-164)',
    ).toBe(false)

    expect(
      patchTaskBody.safeParse({
        due_time: '18:00',
        reminder: { time_of_day: '09:00' },
      }).success,
      'and its mirror arm, setting due_time on a date-only task deleting a time_of_day reminder',
    ).toBe(false)

    expect(
      patchTaskBody.safeParse({
        due_time: null,
        reminder: { time_of_day: '09:00' },
      }).success,
      'the pair that is not a contradiction: the cascade deletes an offset row and the body sets the mode the resulting task admits',
    ).toBe(true)
  })

  test('the PATCH admits an object and refuses a null, 7.9 owning the removal', () => {
    const result = patchTaskBody.safeParse({ reminder: null })
    expect(
      result.success,
      'a reminder is a row of 4.8 rather than a column of 4.5, and frozen 7.9 gives its removal an endpoint of its own: DELETE /tasks/:id/reminder, 204 and idempotent',
    ).toBe(false)
    if (!result.success) {
      expect(
        result.error.issues[0]?.path,
        '7.0 answers a wrong type on a parsed object with a 422 naming the field, so a client that meant to clear the reminder is told where to go',
      ).toEqual(['reminder'])
      expect(
        result.error.issues[0]?.message,
        'and told where, which the P7 shape review made the message say: the validator\'s own "expected object, received null" is a complaint about a type to a caller who was asking for a removal',
      ).toContain('DELETE /tasks/:id/reminder')
    }
  })

  test('the sentence on that field costs the fields inside it nothing', () => {
    // The object-level message is the object's alone. One shape literal
    // reached through two schemas is why it is shared rather than copied, so
    // the 10.3 row inside it must still answer in its own words.
    const inner = patchTaskBody.safeParse({ reminder: { offset_minutes: -1 } })
    expect(inner.success).toBe(false)
    if (!inner.success) {
      expect(inner.error.issues[0]?.path).toEqual(['reminder', 'offset_minutes'])
      expect(inner.error.issues[0]?.message).toBe('must be 0 to 10080 minutes')
    }
    expect(
      patchTaskBody.safeParse({ reminder: {} }).error?.issues[0]?.message,
      '4.8\'s exclusive-or is the one predicate both bodies call, phrased for the position it is read in',
    ).toBe('must carry exactly one of offset_minutes and time_of_day')
  })

  test('a reminder is refused wholesale when it is not an object at all', () => {
    for (const value of [5, 'PT30M', ['offset_minutes'], true]) {
      expect(
        putTaskReminderBody.safeParse(value).success,
        `7.9's body is the reminder object; sent ${JSON.stringify(value)}`,
      ).toBe(false)
      expect(
        postTasksBody.safeParse(created({ reminder: value })).success,
        `and the same value nested in the create body; sent ${JSON.stringify(value)}`,
      ).toBe(false)
    }
  })
})

describe('carriesStatus (7.6: status is refused by presence, with 409)', () => {
  test('sees the field whatever it says', () => {
    for (const body of [
      { status: 'completed' },
      { status: 'pending' },
      { status: 'abandoned' },
      { status: null },
      { status: '' },
      { title: 'Renamed', status: 'pending' },
    ]) {
      expect(
        carriesStatus(body),
        `${JSON.stringify(body)} carries a status, and the rule is presence rather than difference`,
      ).toBe(true)
    }
  })

  test('sees nothing in a body that carries none', () => {
    for (const body of [
      {},
      { title: 'Renamed' },
      { statuses: ['pending'] },
      { Status: 'pending' },
      null,
      undefined,
      'status',
      42,
      ['status'],
      [{ status: 'pending' }],
    ]) {
      expect(
        carriesStatus(body),
        `${JSON.stringify(body)} carries no status field`,
      ).toBe(false)
    }
  })
})

describe('the 7.7 step bodies', () => {
  test('POST requires a title and takes an optional position', () => {
    expect(postTaskStepsBody.safeParse({ title: 'Rinse' }).success).toBe(true)
    expect(postTaskStepsBody.safeParse({ title: 'Rinse', position: 3 }).success).toBe(
      true,
    )
    expect(
      postTaskStepsBody.safeParse({ position: 3 }).success,
      'title is required by 7.7',
    ).toBe(false)
    expect(postTaskStepsBody.safeParse({ title: '' }).success).toBe(false)
    expect(postTaskStepsBody.safeParse({ title: 'x'.repeat(301) }).success).toBe(false)
    expect(postTaskStepsBody.safeParse({ title: 'x'.repeat(300) }).success).toBe(true)
  })

  test('a position is an integer the column can hold (spec 4.6)', () => {
    for (const position of [0, -1, 2_147_483_647]) {
      expect(
        postTaskStepsBody.safeParse({ title: 'Ordered', position }).success,
        `${String(position)} fits an integer column, and 4.6 allows gaps`,
      ).toBe(true)
    }
    for (const position of [1.5, 2_147_483_648, '3', null, true]) {
      expect(
        postTaskStepsBody.safeParse({ title: 'Ordered', position }).success,
        `${JSON.stringify(position)} is not an integer the column can hold`,
      ).toBe(false)
    }
  })

  test('PATCH takes any subset, the empty one included', () => {
    for (const body of [
      {},
      { title: 'Renamed' },
      { done: true },
      { position: 7 },
      { title: 'Renamed', done: false, position: 1 },
    ]) {
      expect(
        patchStepBody.safeParse(body).success,
        `${JSON.stringify(body)} is a subset of { title, done, position }`,
      ).toBe(true)
    }
    expect(patchStepBody.safeParse({ done: 'yes' }).success).toBe(false)
    expect(
      patchStepBody.safeParse({ done: null }).success,
      '4.6 makes done NOT NULL, so there is nothing to clear it to',
    ).toBe(false)
  })

  test('keeps an absent field absent, as every section 7 PATCH does', () => {
    const result = patchStepBody.safeParse({ done: true })
    expect(result.success).toBe(true)
    if (result.success) expect(Object.keys(result.data)).toEqual(['done'])
  })
})

describe('the 7.0 response shapes', () => {
  const card = {
    id: someUuid,
    title: 'Buy milk',
    status: 'pending',
    important: false,
    due_date: null,
    due_time: null,
    folder: { id: otherUuid, name: 'Inbox', is_default: true },
    assignee: { id: someUuid, display_name: 'Sara', avatar_url: null },
    is_recurring: false,
    steps_done: 0,
    steps_total: 0,
    pulled: false,
    pending_invite_email: null,
    created_at: '2026-08-01T10:00:00.000Z',
    updated_at: '2026-08-01T10:00:00.000Z',
  }
  const detail = {
    ...card,
    notes: null,
    recurrence_rule: null,
    series_id: null,
    section_block_id: null,
    reminder: null,
    steps: [],
    completed_at: null,
    completed_by: null,
    created_by: someUuid,
  }

  test('TaskCard carries exactly the keys 7.0 enumerates', () => {
    expect(Object.keys(taskCard.shape).sort()).toEqual([...TASK_CARD_KEYS].sort())
  })

  test('TaskDetail is TaskCard plus 7.0\'s eight, and nothing else', () => {
    expect(Object.keys(taskDetail.shape).sort()).toEqual(
      [...TASK_CARD_KEYS, ...TASK_DETAIL_EXTRA_KEYS].sort(),
    )
  })

  test('a card with nothing set parses, and so does a full one', () => {
    expect(taskCard.safeParse(card).success).toBe(true)
    expect(
      taskCard.safeParse({
        ...card,
        status: 'completed',
        important: true,
        due_date: '2026-08-20',
        due_time: '09:30:00',
        is_recurring: true,
        steps_done: 2,
        steps_total: 3,
        pulled: true,
        pending_invite_email: 'friend@example.test',
      }).success,
    ).toBe(true)
  })

  test('a card tolerates the seconds Postgres renders on a TIME', () => {
    for (const due_time of ['09:30', '09:30:00']) {
      expect(taskCard.safeParse({ ...card, due_time }).success).toBe(true)
    }
    expect(taskCard.safeParse({ ...card, due_time: '9:30' }).success).toBe(false)
  })

  test('a card refuses a status outside 4.5\'s three', () => {
    expect(taskCard.safeParse({ ...card, status: 'done' }).success).toBe(false)
    expect(taskCard.safeParse({ ...card, status: null }).success).toBe(false)
  })

  test('the assignee is the person shape, and a parse strips an address', () => {
    expect(taskCard.safeParse({ ...card, assignee: null }).success).toBe(true)
    const parsed = taskCard.safeParse({
      ...card,
      assignee: { ...card.assignee, email: 'sara@example.test' },
    })
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(
        parsed.data.assignee !== null && 'email' in parsed.data.assignee,
        '7.4\'s ruled person shape carries no address, and TaskCard uses that shape',
      ).toBe(false)
    }
  })

  test('a card refuses a missing key and a nulled instant', () => {
    const { pulled, ...withoutPulled } = card
    void pulled
    expect(taskCard.safeParse(withoutPulled).success).toBe(false)
    expect(
      taskCard.safeParse({ ...card, created_at: null }).success,
      'created_at is NOT NULL in 4.5',
    ).toBe(false)
    expect(
      taskCard.safeParse({ ...card, steps_done: -1 }).success,
      'a count is never negative',
    ).toBe(false)
  })

  test('the folder a card names is the 7.0 projection, not the Folder object', () => {
    const parsed = taskCard.safeParse({
      ...card,
      folder: { ...card.folder, member_count: 2, counts: { pending: 1, completed: 0 } },
    })
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(Object.keys(parsed.data.folder).sort()).toEqual([
        'id',
        'is_default',
        'name',
      ])
    }
  })

  test('TaskDetail parses the P3 shape and a filled one', () => {
    expect(taskDetail.safeParse(detail).success).toBe(true)
    expect(
      taskDetail.safeParse({
        ...detail,
        status: 'completed',
        notes: 'the notes',
        recurrence_rule: 'FREQ=WEEKLY;BYDAY=MO',
        series_id: otherUuid,
        is_recurring: true,
        reminder: { offset_minutes: 30, time_of_day: null },
        steps: [{ id: otherUuid, title: 'Rinse', done: true, position: 1 }],
        completed_at: '2026-08-02T09:00:00.000Z',
        completed_by: someUuid,
      }).success,
    ).toBe(true)
  })

  test('TaskDetail requires the two keys whose request arms arrived later', () => {
    const { recurrence_rule, ...withoutRule } = detail
    void recurrence_rule
    expect(
      taskDetail.safeParse(withoutRule).success,
      'the key is frozen 7.0\'s whoever fills it, so a response must carry it',
    ).toBe(false)
    const { reminder, ...withoutReminder } = detail
    void reminder
    expect(taskDetail.safeParse(withoutReminder).success).toBe(false)
  })

  test('a reminder carries exactly one of 4.8\'s two modes', () => {
    expect(taskReminder.safeParse({ offset_minutes: 30, time_of_day: null }).success).toBe(
      true,
    )
    expect(
      taskReminder.safeParse({ offset_minutes: null, time_of_day: '09:00:00' }).success,
    ).toBe(true)
    expect(
      taskReminder.safeParse({ offset_minutes: 30, time_of_day: '09:00' }).success,
      'the 4.8 CHECK admits one mode, never both',
    ).toBe(false)
    expect(
      taskReminder.safeParse({ offset_minutes: null, time_of_day: null }).success,
      'and never neither',
    ).toBe(false)
    expect(
      taskReminder.safeParse({ offset_minutes: 10_081, time_of_day: null }).success,
      'the offset is 0 to 10080 minutes (10.3, 4.8)',
    ).toBe(false)
  })

  test('a step is 7.0\'s four fields', () => {
    expect(
      taskStep.safeParse({ id: someUuid, title: 'Rinse', done: false, position: 0 })
        .success,
    ).toBe(true)
    expect(
      taskStep.safeParse({ id: someUuid, title: '', done: false, position: 0 }).success,
    ).toBe(false)
    expect(
      taskStep.safeParse({ id: someUuid, title: 'Rinse', done: false }).success,
    ).toBe(false)
  })

  test('the ruled 7.9 response is the TaskDetail, not a shape of its own', () => {
    expect(
      putTaskReminderResponse,
      'the owner ruled on 2026-08-10 that PUT /tasks/:id/reminder answers the affected TaskDetail; binding the name is what keeps a ruling from being a sentence two shapes could each claim to satisfy',
    ).toBe(taskDetail)
    expect(
      putTaskReminderResponse.safeParse({
        ...detail,
        reminder: { offset_minutes: 30, time_of_day: null },
      }).success,
      'and it reports the reminder the call wrote, which is why the parent task is the object that answers',
    ).toBe(true)
  })

  test('a transition answers 7.6\'s three keys, both companions nullable', () => {
    expect(
      taskTransitionResponse.safeParse({
        task: detail,
        generated_task: null,
        deleted_successor_id: null,
      }).success,
    ).toBe(true)
    expect(
      taskTransitionResponse.safeParse({
        task: detail,
        generated_task: card,
        deleted_successor_id: otherUuid,
      }).success,
      'the companions are P6\'s to fill, and the shape admits them from the first transition',
    ).toBe(true)
    expect(
      taskTransitionResponse.safeParse({ task: detail }).success,
      'a transition answers all three keys, null or not',
    ).toBe(false)
    expect(
      taskTransitionResponse.safeParse({
        task: card,
        generated_task: null,
        deleted_successor_id: null,
      }).success,
      'the task is a TaskDetail, never the card (spec 7.6)',
    ).toBe(false)
  })
})
