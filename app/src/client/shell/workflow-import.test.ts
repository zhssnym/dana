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

  /* #227 area 4. A `labels` key below version 3 is dropped by the parser
     rather than refused — a version 1 file declares no vocabulary and cannot
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

  test('a null labels key is absence rather than loss', () => {
    const prepared = prepareWorkflowImport(
      {
        dana: 'workflow',
        version: 1,
        name: 'Launch',
        folders: [{ name: 'Launch', labels: null, tasks: [{ title: 'Book room' }] }],
      },
      names,
    )
    expect(prepared?.skippedContent).toBe(false)
  })
})

/*
The version, which this module read until an adversarial review measured what
that cost: `version !== 1` refused every file above version 1 with "this is
not a Dana workflow file", including the version 3 that "Save as workflow"
writes for any folder holding a Folder Label. The product could not import its
own export, and no criterion saw it — AC-547 drives the endpoint rather than
this module.
*/
describe('prepareWorkflowImport leaves the version to the endpoint', () => {
  for (const version of [1, 2, 3]) {
    test(`a version ${String(version)} file is recognisably a workflow`, () => {
      expect(
        prepareWorkflowImport(
          {
            dana: 'workflow',
            version,
            folders: [{ name: 'Launch', tasks: [{ title: 'Book room' }] }],
          },
          names,
        ),
      ).not.toBeNull()
    })
  }

  test('a version nobody writes reaches the endpoint rather than being refused here', () => {
    const prepared = prepareWorkflowImport(
      {
        dana: 'workflow',
        version: 99,
        folders: [{ name: 'Launch', tasks: [{ title: 'Book room' }] }],
      },
      names,
    )
    expect(
      prepared,
      'an unknown version is a field error, which 7.16 answers 422 with the field name intact: refusing it here would answer "this is not a Dana workflow file" instead',
    ).not.toBeNull()
    expect((prepared?.body as { version?: unknown }).version).toBe(99)
  })

  test('a version 3 file keeps the vocabulary the endpoint will read', () => {
    const prepared = prepareWorkflowImport(
      {
        dana: 'workflow',
        version: 3,
        folders: [
          {
            name: 'Launch',
            labels: [{ key: 'l1', name: 'Work', color: '#123456' }],
            tasks: [{ title: 'Book room', labels: ['l1'] }],
          },
        ],
      },
      names,
    )
    const folder = (
      prepared?.body.folders as Array<{
        labels?: unknown
        tasks: Array<Record<string, unknown>>
      }>
    )[0]
    expect(folder?.labels, 'the vocabulary travels at the version that declares it').toEqual([
      { key: 'l1', name: 'Work', color: '#123456' },
    ])
    expect(folder?.tasks[0]?.labels).toEqual(['l1'])
    expect(prepared?.skippedContent, 'and nothing was left behind').toBe(false)
  })
})
