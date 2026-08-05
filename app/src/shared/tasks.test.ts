import { describe, expect, test } from 'vitest'

import {
  carriesStatus,
  patchStepBody,
  patchTaskBody,
  postTaskStepsBody,
  postTasksBody,
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

  test('strips the two arms P6 and P7 own rather than refusing them', () => {
    const result = postTasksBody.safeParse({
      title: 'Water the plants',
      due_date: '2026-08-20',
      recurrence_rule: 'FREQ=WEEKLY;BYDAY=MO',
      reminder: { offset_minutes: 30 },
    })
    expect(
      result.success,
      'at P3 both fall to 7.0\'s tolerated-unknown rule (RFC 0001 P3 row)',
    ).toBe(true)
    if (result.success) {
      expect(result.data).toEqual({
        title: 'Water the plants',
        due_date: '2026-08-20',
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

  test('TaskDetail keeps the two deferred keys even while their bodies do not', () => {
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
