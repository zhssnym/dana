import { describe, expect, test } from 'vitest'

import type { LabelDefinition, LabelRef } from '../../shared/labels.js'
import type { PageView } from '../../shared/pages.js'
import type { TaskDetail } from '../../shared/tasks.js'
import {
  folderToWorkflowFile,
  importWorkflowBody,
  WORKFLOW_FILE_VERSIONS,
} from '../../shared/workflows.js'
import { prepareWorkflowImport } from './workflow-import.js'

const names = new Set<string>()

function workflow(task: Record<string, unknown>): unknown {
  return {
    dana: 'workflow',
    version: 1,
    folders: [{ name: 'Launch', tasks: [task] }],
  }
}

describe('prepareWorkflowImport delegates field validation to the endpoint', () => {
  test('only a recognisable Dana workflow envelope is required locally', () => {
    expect(prepareWorkflowImport(null, names)).toBeNull()
    expect(prepareWorkflowImport({ dana: 'other', version: 1, folders: [{}] }, names)).toBeNull()
    expect(prepareWorkflowImport({ dana: 'workflow', version: 1 }, names)).not.toBeNull()
    expect(
      prepareWorkflowImport(
        { dana: 'workflow', version: 1, folders: 'not an array' },
        names,
      ),
    ).not.toBeNull()
    expect(
      prepareWorkflowImport(
        { dana: 'workflow', version: 1, folders: [{ name: 'Launch' }] },
        names,
      ),
    ).not.toBeNull()
  })

  test('a title over its cap reaches the server unchanged', () => {
    const title = 'x'.repeat(301)
    const prepared = prepareWorkflowImport(workflow({ title }), names)
    expect(prepared).not.toBeNull()
    expect(
      ((prepared?.body.folders as Array<{ tasks: Array<{ title: string }> }>)[0]
        ?.tasks[0]?.title),
    ).toBe(title)
  })

  test('a malformed repeat and the file-wide task cap reach the server', () => {
    const malformed = prepareWorkflowImport(
      workflow({ title: 'Book room', recurrence_rule: 'FREQ=NOPE' }),
      names,
    )
    expect(malformed).not.toBeNull()

    const many = prepareWorkflowImport(
      {
        dana: 'workflow',
        version: 1,
        folders: [
          {
            name: 'Launch',
            tasks: Array.from({ length: 1001 }, () => ({ title: 'Task' })),
          },
        ],
      },
      names,
    )
    expect(many?.taskCount).toBe(1001)
  })

  test('an existing folder name is adjusted without validating the rest', () => {
    const prepared = prepareWorkflowImport(
      workflow({ title: 'Book room' }),
      new Set(['Launch']),
    )
    expect((prepared?.body.folders as Array<{ name: string }>)[0]?.name).toBe(
      'Launch (imported)',
    )
  })
})

describe('prepareWorkflowImport reports partial normalisation', () => {
  test('reports an image, foreign reminder, and empty step that cannot travel', () => {
    const prepared = prepareWorkflowImport(
      {
        dana: 'workflow',
        version: 1,
        name: 'Launch',
        items: [
          { kind: 'paragraph', paragraph: { text: 'Read this' } },
          { kind: 'image', image: { data: 'AAAA' } },
        ],
        tasks: [
          {
            title: 'Book room',
            reminder: '1 hour before',
            steps: ['Check calendar', ''],
          },
        ],
      },
      names,
    )
    expect(prepared?.skippedContent).toBe(true)
  })

  test('does not call supported legacy arrangements partial', () => {
    const prepared = prepareWorkflowImport(
      {
        dana: 'workflow',
        version: 1,
        name: 'Launch',
        items: [{ kind: 'paragraph', paragraph: { text: 'Read this' } }],
        tasks: [
          {
            title: 'Book room',
            reminder: '08:30',
            steps: ['Check calendar'],
          },
        ],
      },
      names,
    )
    expect(prepared?.skippedContent).toBe(false)
    expect(prepared?.taskCount).toBe(1)
  })

  /* #227 area 4. `labels` below version 3 is dropped by the parser rather
     than refused — a version 1 file declares no vocabulary and cannot
     contradict one — so the person is told something was left behind instead
     of the file being refused or the classification vanishing in silence. */
  test('reports a labels key an older file carried and the parser dropped', () => {
    const prepared = prepareWorkflowImport(
      {
        dana: 'workflow',
        version: 1,
        name: 'Launch',
        folders: [
          {
            name: 'Launch',
            tasks: [{ title: 'Book room', labels: ['work', 'home'] }],
          },
        ],
      },
      names,
    )
    expect(prepared, 'the file still imports').not.toBeNull()
    expect(
      (prepared?.body.folders as Array<{ tasks: Array<Record<string, unknown>> }>)[0]
        ?.tasks[0]?.labels,
      'with the foreign key gone',
    ).toBeUndefined()
    expect(prepared?.skippedContent, 'and the loss reported').toBe(true)
  })

  test('reports a folder’s dropped vocabulary, and a null as no loss at all', () => {
    const withVocabulary = prepareWorkflowImport(
      {
        dana: 'workflow',
        version: 1,
        name: 'Launch',
        folders: [
          { name: 'Launch', labels: ['work'], tasks: [{ title: 'Book room' }] },
        ],
      },
      names,
    )
    expect(withVocabulary?.skippedContent, 'a vocabulary the parser dropped').toBe(true)

    const withNull = prepareWorkflowImport(
      {
        dana: 'workflow',
        version: 1,
        name: 'Launch',
        folders: [{ name: 'Launch', labels: null, tasks: [{ title: 'Book room' }] }],
      },
      names,
    )
    expect(
      withNull?.skippedContent,
      'a null is a serialiser spelling "none", which lost nothing',
    ).toBe(false)
  })

  /* The one-folder arrangement, added 2026-09-20 with AC-782, which taught
     `normalizeWorkflowFile` to carry a top-level `labels` into the folded
     folder. `sourceFolders` falls back to `[source]` here, so the top-level
     key is the folded folder's key to this module and the report is unchanged
     by the fold: a version 1 file's vocabulary is still dropped on the
     version and still reported. A test rather than a sentence, because the
     two modules now read one key from two shapes and nothing else would
     notice them disagreeing. */
  test('a top-level vocabulary in the one-folder arrangement is reported like any other', () => {
    const prepared = prepareWorkflowImport(
      {
        dana: 'workflow',
        version: 1,
        name: 'Launch',
        labels: ['work'],
        tasks: [{ title: 'Book room' }],
      },
      names,
    )
    expect(prepared, 'the file still imports').not.toBeNull()
    expect(
      (prepared?.body.folders as Array<Record<string, unknown>>)[0]?.labels,
      'with the foreign vocabulary gone, the version gating the key wherever it sat',
    ).toBeUndefined()
    expect(prepared?.skippedContent, 'and the loss reported').toBe(true)
  })
})

/* ------------------------------------------------------------------ *
 * The envelope's version, which is the contract's and not this file's
 * (#260)
 *
 * Nothing exercised the picker above version 1 until this block, which is
 * the whole of why the defect shipped: `Save as workflow` has written
 * version 2 for every folder since #204 on 2026-09-17, the endpoint has read
 * both since the same commit, and the picker kept a hand-written
 * `value.version !== 1` that answered every one of those files with "that
 * file isn't a workflow Dana can read".
 *
 * Two kinds of case, because one of them would have caught it and the other
 * catches the next one. The round trips below run the real writer, through
 * JSON, into the real picker, at every version the writer emits. The two
 * after them assert the picker and the contract agree about *every* version
 * rather than about a fixed few, reading the list from the contract, so a
 * further version is covered here the day it is added.
 *
 * It was written at versions 1 and 2 and the day arrived during this
 * branch's own rebase: #227 added 3 for a Folder Label vocabulary, the
 * derived cases went red on the list rather than on a number, and the round
 * trip below at version 3 is what answering them cost.
 * ------------------------------------------------------------------ */

const TASK_ID = '00000000-0000-4000-8000-000000000001'
const BLOCK_ID = '00000000-0000-4000-8000-0000000000b1'

/* Built without a cast, deliberately. The same helper in
   `shared/workflows.test.ts` casts, and the cast is why it silently stopped
   naming every field of a shape that has since grown one. */
function detail(folderLabels: readonly LabelRef[] = []): TaskDetail {
  return {
    id: TASK_ID,
    title: 'Book the room',
    status: 'pending',
    important: true,
    start_date: null,
    due_date: null,
    due_time: null,
    folder: {
      id: '00000000-0000-4000-8000-0000000000f1',
      name: 'Launch',
      is_default: false,
    },
    assignee: null,
    is_recurring: false,
    steps_done: 0,
    steps_total: 1,
    pulled: false,
    pending_invite_email: null,
    section_block_id: null,
    created_by: null,
    created_at: '2026-09-17T09:00:00.000Z',
    updated_at: '2026-09-17T09:00:00.000Z',
    notes: 'Ask for the big one.',
    recurrence_rule: null,
    series_id: null,
    reminder: { offset_minutes: null, time_of_day: '08:30:00' },
    steps: [
      {
        id: '00000000-0000-4000-8000-00000000000a',
        title: 'Check the calendar',
        done: false,
        position: 0,
      },
    ],
    completed_at: null,
    completed_by: null,
    /* #227's projection. `personal` stays empty on purpose: the writer never
       writes a Personal Label at any version, so a non-empty one here would
       be asserting about a key that cannot appear in the file. */
    labels: { personal: [], folder: [...folderLabels] },
  }
}

/* The Folder's reusable vocabulary as `GET /labels?scope=folder&folder_id=`
   answers it, and the assignment on the task that joins to it. Two shapes
   rather than one because `folderToWorkflowFile` reads the definition for the
   file's `labels` list and the task's ref for the key it writes on the task,
   and a helper that conflated them would not notice the two disagreeing. */
const LABEL_ID = '00000000-0000-4000-8000-0000000000c1'
const VOCABULARY: readonly LabelDefinition[] = [
  {
    id: LABEL_ID,
    scope: 'folder',
    name: 'Blocked',
    color: '#C0392B',
    description: null,
    archived: false,
    folder_id: '00000000-0000-4000-8000-0000000000f1',
  },
]
const ASSIGNED: readonly LabelRef[] = [
  {
    id: LABEL_ID,
    scope: 'folder',
    name: 'Blocked',
    color: '#C0392B',
    archived: false,
    folder_id: '00000000-0000-4000-8000-0000000000f1',
  },
]

/** A folder page as `useFolderPage` answers one. The hook is unconditional,
 * so this — and therefore version 2 — is what a real folder has. */
const PAGE: PageView = {
  revision: '1',
  blocks: [
    {
      id: BLOCK_ID,
      kind: 'paragraph',
      position: 0,
      page_position: 'a0',
      section_block_id: null,
      list_parent_block_id: null,
      checked: null,
      rich_content: null,
      text: 'Read this first.',
      file_id: null,
      file_width: null,
      file_height: null,
      ref_folder_id: null,
      width_pct: null,
      updated_at: '2026-09-17T09:00:00.000Z',
    },
  ],
  items: [
    { kind: 'block', id: BLOCK_ID },
    { kind: 'task', id: TASK_ID },
  ],
  task_placements: [{ id: TASK_ID, section_block_id: null }],
}

/** What the picker is actually handed: the bytes `FolderPage.tsx` puts in
 * the download, read back as JSON. The arguments mirror that call site
 * exactly (`page.data?.blocks ?? []`, then `page.data`, then the vocabulary
 * `labelRowsOf` hands it since #227), so a change to either end of the round
 * trip shows up here. */
function savedAsWorkflow(
  pageView: PageView | undefined,
  vocabulary: readonly LabelDefinition[] = [],
): unknown {
  const saved = folderToWorkflowFile(
    'Launch',
    [detail(vocabulary.length > 0 ? ASSIGNED : [])],
    pageView?.blocks ?? [],
    pageView,
    vocabulary,
  )
  return JSON.parse(JSON.stringify(saved.file))
}

function versionOf(file: unknown): unknown {
  return (file as { version: unknown }).version
}

/*
**These four cases moved with the writer, and the last one is why they could
not quietly stop covering anything.** They read "a folder with no page writes
version 1", "with a page writes 2", "with a vocabulary writes 3", and then a
fourth case asserting that those three *were* every version the writer emits —
whose own comment said "if the writer ever emits a fourth, one of these rows
stops standing for a version and this fails rather than quietly covering less".
#185 is that fourth, and the case did exactly what it was written to do.

What the block pins has not changed: **the picker reads every file "Save as
workflow" writes**, which is the defect #260 was opened about — a picker with a
hand-written version literal refusing Dana's own exports. What has changed is
that the writer now emits one version for every folder, because format 4's page
is in every file it writes. So the three rows become one row driven over the
three folders, and the fourth becomes the same guard stated for one version:
whatever the writer emits, over every shape of folder, is inside the contract's
own list.
*/
describe('the picker reads every file "Save as workflow" writes', () => {
  const shapes: [string, PageView | undefined, readonly LabelDefinition[]][] = [
    ['a folder with no page', undefined, []],
    ['a folder with a page', PAGE, []],
    ['a folder with a page and a vocabulary', PAGE, VOCABULARY],
  ]

  test('every shape of folder writes version 4, and the picker reads it', () => {
    for (const [what, page, vocabulary] of shapes) {
      const file = savedAsWorkflow(page, vocabulary)
      expect(versionOf(file), `${what}: the writer emits one version (#185)`).toBe(4)
      expect(
        importWorkflowBody.safeParse(file).success,
        `${what}: the contract reads it`,
      ).toBe(true)
      expect(prepareWorkflowImport(file, names), `${what}: the picker reads it`).not.toBeNull()
    }
  })

  /* #227 area 4. The point of carrying a vocabulary through the picker rather
     than having it stripped as foreign: nothing is reported as left behind. */
  test('a vocabulary reaches the request rather than being stripped', () => {
    const prepared = prepareWorkflowImport(savedAsWorkflow(PAGE, VOCABULARY), names)
    expect(prepared).not.toBeNull()
    expect(
      (prepared?.body.folders as Array<{ labels?: unknown[] }>)[0]?.labels,
      'the vocabulary reaches the request',
    ).toHaveLength(1)
    expect(prepared?.skippedContent, 'and nothing is reported as dropped').toBe(false)
  })

  /* And the work reaches the toast, which is the count `prepareWorkflowImport`
     answers. A format 4 Task is a block of the page, so a count that read only
     `folder.tasks` would tell every person importing a current file that their
     folder arrived empty (#185). */
  test('the Tasks on the page are the Tasks the toast counts', () => {
    expect(prepareWorkflowImport(savedAsWorkflow(PAGE), names)?.taskCount).toBe(1)
  })

  test('every version the writer emits is one the contract lists', () => {
    // The guard the fourth case above was: whatever the writer emits, over
    // every shape of folder, is inside WORKFLOW_FILE_VERSIONS. It fails if the
    // writer starts emitting a number nobody added to the list.
    const emitted = new Set(
      shapes.map(([, page, vocabulary]) => versionOf(savedAsWorkflow(page, vocabulary))),
    )
    expect([...emitted].filter((version) => !(WORKFLOW_FILE_VERSIONS as readonly unknown[]).includes(version))).toEqual([])
    expect(emitted.size, 'and it is one version, not a menu').toBe(1)
  })
})

describe('the picker refuses exactly the versions the endpoint refuses', () => {
  test('every version the contract reads reaches the request', () => {
    for (const version of WORKFLOW_FILE_VERSIONS) {
      const file = { dana: 'workflow', version, folders: [{ name: 'Launch' }] }
      expect(importWorkflowBody.safeParse(file).success, `contract v${String(version)}`).toBe(
        true,
      )
      expect(prepareWorkflowImport(file, names), `picker v${String(version)}`).not.toBeNull()
    }
  })

  test('a version past the contract is refused here rather than at the endpoint', () => {
    // Derived rather than written: whatever the list holds, this is outside
    // it, so this case keeps meaning what it says after the next bump.
    const unread = Math.max(...WORKFLOW_FILE_VERSIONS) + 1
    const file = { dana: 'workflow', version: unread, folders: [{ name: 'Launch' }] }
    expect(importWorkflowBody.safeParse(file).success).toBe(false)
    expect(prepareWorkflowImport(file, names)).toBeNull()
  })
})
