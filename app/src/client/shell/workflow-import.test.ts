import { describe, expect, test } from 'vitest'

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
