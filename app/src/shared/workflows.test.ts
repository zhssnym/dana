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
      // Version 4 rather than 3, moved 2026-09-20 by issue #227, which added
      // version 3 for the Folder Label vocabulary. The decision this row pins
      // has not moved — **an unknown version is refused rather than read
      // hopefully** — only which number is unknown has, which is the same
      // move the note below this records for #204 and version 2. The row read
      // `version: 2` until c7bd863 widened the schema and left it alone, and
      // the pair of cases added then is why this one could not go quiet again.
      { dana: 'workflow', version: 4, folders: [{ name: 'x' }] },
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

  // And version 3, added by #227 for the Folder Label vocabulary, written
  // here in the same pair so that the next number to arrive meets the same
  // two cases rather than one of them.
  test('version 3 is an arrangement, since the Folder Labels (#227)', () => {
    const file = { dana: 'workflow', version: 3, folders: [{ name: 'x' }] }
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

/*
The Label vocabulary, version 3 (#227 area 4).

**Every case here was written because a mutation of the code it watches left
the whole suite green.** An adversarial review raised both caps to 100000,
deleted each half of the `superRefine`, and removed `'labels'` from
`dropNulls`, one at a time: nothing in any test or any criterion moved. So
this block is the format's own guard on its newest keys, and it is the unit
half — AC-547 drives the round trip and AC-548 drives the version line through
the endpoint.

**The cap numbers are literals and must stay literals.** Reading
`FOLDER_LABEL_DEFINITION_CAP` here would make the test agree with whatever the
constant says, which is exactly the mutation it exists to catch; the sibling
"the 10.3 caps are where they were" above spells 301, 50 and 1001 for the same
reason. 250 and 100 are 10.3's numbers, and a change to either is a contract
change that should have to edit this line.
*/
describe('importWorkflowBody reads a Label vocabulary at version 3, and nowhere else', () => {
  function labels(count: number): { key: string; name: string; color: string }[] {
    return Array.from({ length: count }, (_, index) => ({
      key: `l${String(index)}`,
      name: `Label ${String(index)}`,
      color: '#123456',
    }))
  }

  function v3(folder: Record<string, unknown>): unknown {
    return {
      dana: 'workflow',
      version: 3,
      folders: [{ name: 'Launch', ...folder }],
    }
  }

  test('a declared key travels and an undeclared one is refused', () => {
    const file = v3({
      labels: labels(2),
      tasks: [{ title: 'Book the room', labels: ['l0'] }],
    })
    expect(parsed(file).folders[0]?.tasks?.[0]?.labels, 'the key is the join').toEqual([
      'l0',
    ])
    expect(
      importWorkflowBody.safeParse(
        v3({ labels: labels(2), tasks: [{ title: 'x', labels: ['nope'] }] }),
      ).success,
      'a key no folder declared is a file contradicting itself, and is refused rather than dropped: dropping it loses classification silently and leaves a file that looks imported and is not',
    ).toBe(false)
  })

  test('a key is declared once per folder, and each folder has its own', () => {
    expect(
      importWorkflowBody.safeParse(
        v3({
          labels: [
            { key: 'l0', name: 'Work', color: '#123456' },
            { key: 'l0', name: 'Home', color: '#654321' },
          ],
        }),
      ).success,
      'a repeated key makes the join ambiguous, and picking one is what "never merge by name" forbids a step later',
    ).toBe(false)
    expect(
      importWorkflowBody.safeParse({
        dana: 'workflow',
        version: 3,
        folders: [
          { name: 'A', labels: labels(1), tasks: [{ title: 'a', labels: ['l0'] }] },
          { name: 'B', labels: labels(1), tasks: [{ title: 'b', labels: ['l0'] }] },
        ],
      }).success,
      'and two folders each declaring l0 are two Labels, because scope is part of identity',
    ).toBe(true)
  })

  /* The name half of the same rule, added 2026-09-20 with AC-780. Until it
     existed a file naming one folder's Label twice parsed clean, reached
     `createWorkflowFolderLabels`' raw INSERT, met 0022's
     `labels_folder_name_idx` and answered 500. The unit half is here for the
     reason every case in this block is: the whole suite was green while the
     rule was absent. */
  test('a name is declared once per folder too, and case is not a difference', () => {
    for (const [what, second] of [
      ['the same name twice', 'Work'],
      ['the same name in another case', 'wORK'],
      ['the same name with space around it', '  Work  '],
    ] as const) {
      expect(
        importWorkflowBody.safeParse(
          v3({
            labels: [
              { key: 'l0', name: 'Work', color: '#123456' },
              { key: 'l1', name: second, color: '#654321' },
            ],
          }),
        ).success,
        `${what}: labels_folder_name_idx is on (folder_id, lower(name)) and labelName trims, so this pair is one row to the database and 422 here rather than 500 there`,
      ).toBe(false)
    }
    expect(
      importWorkflowBody.safeParse({
        dana: 'workflow',
        version: 3,
        folders: [
          { name: 'A', labels: [{ key: 'l0', name: 'Work', color: '#123456' }] },
          { name: 'B', labels: [{ key: 'l0', name: 'Work', color: '#654321' }] },
        ],
      }).success,
      'and two folders may each hold a "Work", scope being part of identity exactly as it is for the key',
    ).toBe(true)
  })

  test('the one-folder fold carries the vocabulary it was handed', () => {
    const folder = parsed({
      dana: 'workflow',
      version: 3,
      name: 'Launch',
      labels: [{ key: 'l0', name: 'Work', color: '#123456' }],
      tasks: [{ title: 'Book the room', labels: ['l0'] }],
    }).folders[0]
    expect(
      folder?.labels?.map((label) => label.key),
      'a top-level `labels` folds with the top-level work it classifies: rebuilding the folder from name, tasks and items alone dropped the declaration before validation saw it, so the file met 422 about the task or imported with the vocabulary gone',
    ).toEqual(['l0'])
    expect(folder?.tasks?.[0]?.labels, 'and the key still joins to it').toEqual([
      'l0',
    ])
  })

  test('10.3’s two Label caps are where they were', () => {
    expect(
      importWorkflowBody.safeParse(v3({ labels: labels(250) })).success,
      '250 definitions in one folder',
    ).toBe(true)
    expect(
      importWorkflowBody.safeParse(v3({ labels: labels(251) })).success,
      '251',
    ).toBe(false)
    const onTask = (count: number): unknown =>
      v3({
        labels: labels(count),
        tasks: [
          {
            title: 'Book the room',
            labels: labels(count).map((label) => label.key),
          },
        ],
      })
    expect(importWorkflowBody.safeParse(onTask(100)).success, '100 on a task').toBe(
      true,
    )
    expect(importWorkflowBody.safeParse(onTask(101)).success, '101').toBe(false)
  })

  test('a null vocabulary means absent, at both levels', () => {
    /* Version 3 deliberately: at any other version the key is dropped by the
       version rule below, which would hide whether `dropNulls` still names
       `labels` at all. */
    const folder = parsed(
      v3({ labels: null, tasks: [{ title: 'Book the room', labels: null }], blocks: null }),
    ).folders[0]
    expect(folder?.labels, 'the folder’s').toBeUndefined()
    expect(folder?.tasks?.[0], 'and the task’s').toEqual({ title: 'Book the room' })
  })

  test('a labels key at any other version is a foreign arrangement, and is dropped', () => {
    /* The six shapes an adversarial review measured, every one of them
       accepted before #227 declared the key and 422 after it. The first is
       the one that matters: `labels` as an array of tag names per task is
       what most to-do exports write, Todoist included. */
    const v1 = (folder: Record<string, unknown>): unknown => ({
      dana: 'workflow',
      version: 1,
      name: 'Launch',
      folders: [{ name: 'Launch', ...folder }],
    })
    const shapes: [string, unknown][] = [
      ['tag names per task', v1({ tasks: [{ title: 'x', labels: ['work', 'home'] }] })],
      ['one tag as a string', v1({ tasks: [{ title: 'x', labels: 'work' }] })],
      ['a null vocabulary', v1({ labels: null, tasks: [{ title: 'x' }] })],
      ['a vocabulary of names', v1({ labels: ['work'], tasks: [{ title: 'x' }] })],
      [
        'a vocabulary with no keys',
        v1({ labels: [{ name: 'Work', color: '#123456' }], tasks: [{ title: 'x' }] }),
      ],
      [
        'the one-folder fold',
        { dana: 'workflow', version: 1, name: 'Launch', tasks: [{ title: 'x', labels: ['work'] }] },
      ],
    ]
    for (const [what, file] of shapes) {
      const folder = parsed(file).folders[0]
      expect(folder?.labels, `${what}: the folder carries no vocabulary`).toBeUndefined()
      expect(folder?.tasks?.[0]?.labels, `${what}: and the task carries no keys`).toBeUndefined()
      expect(folder?.tasks?.[0]?.title, `${what}: and the work still arrives`).toBe('x')
    }
  })

  test('version 2 is no more a Label reader than version 1', () => {
    const folder = parsed({
      dana: 'workflow',
      version: 2,
      folders: [
        { name: 'Launch', labels: ['work'], tasks: [{ title: 'x', labels: ['work'] }] },
      ],
    }).folders[0]
    expect(folder?.labels).toBeUndefined()
    expect(folder?.tasks?.[0]?.labels).toBeUndefined()
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
