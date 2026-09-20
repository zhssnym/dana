/*
The workflow file, both halves, against the arrangements a real one arrives
in (7.16 as RFC 0005 change control item 44's B3 widened it, DES-206).

Why this file exists at all: the reported defect was "importing does not
work, and what does import loses the notes and the step titles", and both
halves of it were in the format rather than in the endpoint. The schema read
one arrangement and DES-206's own serialiser writes another, so a file the
product handed a person was refused with `folders: expected array`; and the
folder page's exporter wrote `{ title }` per task, so the file it did write
never held a note or a step title for an import to lose. AC-201, AC-237,
AC-272 and AC-273 cover the endpoint's behaviour and are the Adversarial
Test Engineer's; nothing here repeats one. What is here is the format: what
the schema will read, what it drops rather than refuses, what it still
refuses, and that what the exporter writes is what the importer reads.
*/
import { describe, expect, test } from 'vitest'

import type { TaskDetail } from './tasks.js'
import {
  folderToWorkflowFile,
  importWorkflowBody,
  needsImportAnchor,
} from './workflows.js'

/** The file DES-206's own serialiser writes: one folder, its page and its
 * work at the top level, and no `folders` key anywhere. */
const oneFolderFile = {
  dana: 'workflow',
  version: 1,
  name: 'Launch checklist',
  glyph: 'rocket',
  color: '#123456',
  description: 'How we ship',
  items: [
    { kind: 'section', section: { id: 's1', name: 'Before the day' } },
    { kind: 'paragraph', paragraph: { text: 'Read this first.' } },
    { kind: 'image', image: { id: 'i1', ratio: 1.7, caption: 'the room' } },
  ],
  tasks: [
    {
      title: 'Book the room',
      section: 's1',
      notes: 'Ask for the big one.',
      important: true,
      status: 'completed',
      steps: [
        { title: 'Check the calendar', done: true },
        { title: 'Send the invite', done: false },
      ],
    },
  ],
}

function parsed(file: unknown): ReturnType<typeof importWorkflowBody.parse> {
  const result = importWorkflowBody.safeParse(file)
  expect(result.success, JSON.stringify(result.error?.issues)).toBe(true)
  return importWorkflowBody.parse(file)
}

describe('importWorkflowBody folds the one-folder file (DES-206)', () => {
  test('the top-level file becomes one folder named by the file', () => {
    const file = parsed(oneFolderFile)
    expect(file.folders).toHaveLength(1)
    expect(file.folders[0]?.name).toBe('Launch checklist')
  })

  test('notes and real step titles survive the fold', () => {
    const task = parsed(oneFolderFile).folders[0]?.tasks?.[0]
    expect(task?.title).toBe('Book the room')
    expect(task?.notes).toBe('Ask for the big one.')
    expect(task?.important).toBe(true)
    expect(task?.steps?.map((step) => step.title)).toEqual([
      'Check the calendar',
      'Send the invite',
    ])
  })

  test('a tick, a state and a section id are read by nothing', () => {
    const text = JSON.stringify(parsed(oneFolderFile))
    expect(text.includes('done'), 'a tick is a state (7.16)').toBe(false)
    expect(text.includes('completed'), 'a state does not travel').toBe(false)
    expect(text.includes('"s1"'), 'an id does not travel').toBe(false)
  })

  test('page items become sections and paragraphs, in order, without the image', () => {
    expect(parsed(oneFolderFile).folders[0]?.blocks).toEqual([
      { kind: 'section', text: 'Before the day' },
      { kind: 'paragraph', text: 'Read this first.' },
    ])
  })

  test('a file that is neither arrangement is still refused', () => {
    for (const file of [
      { dana: 'workflow', version: 1, name: 'nothing at all' },
      { dana: 'shopping-list', version: 1, folders: [{ name: 'x' }] },
      // Version 3 rather than 2, corrected 2026-09-20. This row read
      // `version: 2` from the day it was written until c7bd863 (#204, the
      // folder writing canvas) widened the schema from `z.literal(1)` to
      // `z.union([z.literal(1), z.literal(2)])` and left the row alone.
      // Version 2 is an honest arrangement now and the case below pins it;
      // what this row is for is the unknown version, so it names one.
      { dana: 'workflow', version: 3, folders: [{ name: 'x' }] },
      'not an object',
      null,
    ]) {
      expect(importWorkflowBody.safeParse(file).success, JSON.stringify(file)).toBe(
        false,
      )
    }
  })

  // The other half of the correction above. #204 made version 2 readable and
  // added nothing that says so, which is how the row above went from true to
  // false with no test naming the change. This is that test.
  test('version 2 is an arrangement, since the folder writing canvas (#204)', () => {
    const file = { dana: 'workflow', version: 2, folders: [{ name: 'x' }] }
    expect(importWorkflowBody.safeParse(file).success, JSON.stringify(file)).toBe(true)
  })
})

describe('importWorkflowBody reads a step given as its title', () => {
  const bare = {
    dana: 'workflow',
    version: 1,
    folders: [
      {
        name: 'Launch',
        tasks: [{ title: 'Book the room', steps: ['Check the calendar', '  '] }],
      },
    ],
  }

  test('a string is an unticked step, and a blank one is not a step', () => {
    expect(parsed(bare).folders[0]?.tasks?.[0]?.steps).toEqual([
      { title: 'Check the calendar' },
    ])
  })
})

describe('importWorkflowBody drops what it cannot read and refuses what 10.3 refuses', () => {
  function withTask(task: Record<string, unknown>): unknown {
    return {
      dana: 'workflow',
      version: 1,
      folders: [{ name: 'Launch', tasks: [{ title: 'Book the room', ...task }] }],
    }
  }

  test('a reminder as HH:MM is read; another vocabulary is dropped', () => {
    expect(parsed(withTask({ reminder: '08:30' })).folders[0]?.tasks?.[0]?.reminder)
      .toEqual({ time_of_day: '08:30' })
    expect(
      parsed(withTask({ reminder: '1 hour before' })).folders[0]?.tasks?.[0]
        ?.reminder,
      'a label this schema does not speak is not a reminder',
    ).toBeUndefined()
  })

  test('a null in an optional key means absent rather than malformed', () => {
    const task = parsed(
      withTask({ notes: null, important: null, recurrence_rule: null, reminder: null, steps: null }),
    ).folders[0]?.tasks?.[0]
    expect(task).toEqual({ title: 'Book the room' })
  })

  test('a repeat still has to be a rule', () => {
    expect(
      importWorkflowBody.safeParse(withTask({ recurrence_rule: 'every so often' }))
        .success,
    ).toBe(false)
  })

  test('the 10.3 caps are where they were', () => {
    const overTitle = withTask({ title: 'x'.repeat(301) })
    expect(importWorkflowBody.safeParse(overTitle).success, 'title over 300').toBe(
      false,
    )
    expect(
      importWorkflowBody.safeParse(withTask({ notes: 'x'.repeat(10001) })).success,
      'notes over 10000',
    ).toBe(false)
    const folders = (count: number): unknown => ({
      dana: 'workflow',
      version: 1,
      folders: Array.from({ length: count }, (_, index) => ({
        name: `f${String(index)}`,
      })),
    })
    expect(importWorkflowBody.safeParse(folders(50)).success, '50 folders').toBe(true)
    expect(importWorkflowBody.safeParse(folders(51)).success, '51 folders').toBe(
      false,
    )
    const across = (blocks: number, tasks: number): unknown => ({
      dana: 'workflow',
      version: 1,
      folders: [
        {
          name: 'Launch',
          blocks: Array.from({ length: blocks }, () => ({
            kind: 'paragraph',
            text: 'x',
          })),
          tasks: Array.from({ length: tasks }, () => ({ title: 'x' })),
        },
      ],
    })
    expect(importWorkflowBody.safeParse(across(501, 1)).success, '501 blocks').toBe(
      false,
    )
    expect(importWorkflowBody.safeParse(across(1, 1001)).success, '1001 tasks').toBe(
      false,
    )
  })
})

describe('needsImportAnchor reads the folded file', () => {
  test('a top-level file whose task repeats asks for a zone', () => {
    expect(
      needsImportAnchor(
        parsed({
          dana: 'workflow',
          version: 1,
          name: 'Weekly',
          tasks: [{ title: 'Book the room', recurrence_rule: 'FREQ=WEEKLY;BYDAY=MO' }],
        }),
      ),
    ).toBe(true)
    expect(needsImportAnchor(parsed(oneFolderFile))).toBe(false)
  })
})

/* ------------------------------------------------------------------ *
 * The write half
 * ------------------------------------------------------------------ */

function detail(over: Partial<TaskDetail>): TaskDetail {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    title: 'Book the room',
    status: 'pending',
    important: false,
    due_date: null,
    due_time: null,
    folder: { id: '00000000-0000-4000-8000-0000000000f1', name: 'Launch', color: null, icon: null, is_default: false },
    assignee: null,
    is_recurring: false,
    steps_done: 0,
    steps_total: 0,
    pulled: false,
    pending_invite_email: null,
    section_block_id: null,
    created_by: null,
    created_at: '2026-08-30T09:00:00.000Z',
    updated_at: '2026-08-30T09:00:00.000Z',
    notes: null,
    recurrence_rule: null,
    series_id: null,
    reminder: null,
    steps: [],
    completed_at: null,
    completed_by: null,
    ...over,
  } as TaskDetail
}

describe('folderToWorkflowFile writes what the import reads', () => {
  const task = detail({
    notes: 'Ask for the big one.',
    important: true,
    recurrence_rule: 'FREQ=WEEKLY;BYDAY=MO',
    reminder: { offset_minutes: null, time_of_day: '08:30:00' },
    steps: [
      { id: '00000000-0000-4000-8000-00000000000a', title: 'Check the calendar', done: true, position: 0 },
      { id: '00000000-0000-4000-8000-00000000000b', title: 'Send the invite', done: false, position: 1 },
    ],
    assignee: null,
  })

  const file = folderToWorkflowFile('Launch', [task], [
    { kind: 'section', text: 'Before the day' },
    { kind: 'paragraph', text: 'Read this first.' },
    { kind: 'image', text: null },
    { kind: 'paragraph', text: '   ' },
  ])

  test('the keep-set travels', () => {
    expect(file.folders[0]?.tasks?.[0]).toEqual({
      title: 'Book the room',
      notes: 'Ask for the big one.',
      important: true,
      recurrence_rule: 'FREQ=WEEKLY;BYDAY=MO',
      reminder: { time_of_day: '08:30' },
      steps: [{ title: 'Check the calendar' }, { title: 'Send the invite' }],
    })
  })

  test('sections and paragraphs travel and an image does not', () => {
    expect(file.folders[0]?.blocks).toEqual([
      { kind: 'section', text: 'Before the day' },
      { kind: 'paragraph', text: 'Read this first.' },
    ])
  })

  test('no id, no person, no date, no state and no tick is written at all', () => {
    const text = JSON.stringify(file)
    for (const key of [
      'id',
      'assignee',
      'created_by',
      'due_date',
      'status',
      'done',
      'position',
      'completed_at',
    ]) {
      expect(text.includes(`"${key}"`), `${key} is not in the file`).toBe(false)
    }
  })

  test('what it writes, the import reads back unchanged', () => {
    expect(parsed(JSON.parse(JSON.stringify(file)))).toEqual(file)
  })

  test('a folder with no name still writes a file the import accepts', () => {
    const unnamed = folderToWorkflowFile('   ', [detail({})])
    expect(unnamed.folders[0]?.name).toBe('Imported workflow')
    expect(importWorkflowBody.safeParse(unnamed).success).toBe(true)
  })
})
