/*
AC-782: the DES-206 one-folder arrangement carries its Label vocabulary
through normalisation, so a version 3 file whose `labels` sits at the top level
imports with its classification rather than losing it in silence.

## What was lost, and what it looked like from outside

`normalizeWorkflowFile` folds a file with no `folders` key into one folder
built from `name`, `tasks` and `items`. **`labels` was not on that list**, so a
hand-written one-folder version 3 file was rebuilt without its vocabulary
before validation ever saw it, and the two things that then happened were both
wrong and neither said so:

- with task keys, 422 `folders.0.tasks.0.labels: the key "l1" is not one of
  this folder's labels` — which blames the task for the folder's missing
  declaration and sends its owner to fix the wrong half of the file;
- with no task keys, **201 with the vocabulary gone**, reported by nothing.
  `workflow-import.ts` reports what normalisation dropped, and the shell's
  envelope check keeps a version 3 file away from it entirely.

Only hand-written files reach it, because `folderToWorkflowFile` always writes
a `folders` array. It is minor in reach and it is exactly the thing #227 exists
to stop being silent, which is why it is carried rather than left.

## Carried rather than refused, and the reason is the arrangement's own

The alternative was to refuse the file with a message naming the real cause.
Both answers beat silence, and carrying wins because **the arrangement is
honest**: it is the shape DES-206's own serialiser wrote, and every other key
it wrote at the top level — the page items, the work, the folder's name — is
folded rather than argued with. A file whose author put the vocabulary beside
the work it classifies has written a file that means one thing.

## The version still gates it, which is what the third case holds

The fold hands the key to `normalizeFolder`, which drops it from any file below
version 3 exactly as it drops a per-folder one. So a one-folder version 1 file
carrying a foreign tag list at the top level still imports with nothing
invented from it — the tolerance AC-548 pins, reached through the other
arrangement.

## And the folded vocabulary is a real one, which the fourth case holds

A fold that put the key somewhere the rules could not reach would accept a file
contradicting itself. So the two refusals are driven through this arrangement
too: a name declared twice (AC-780) and a key no folder declares (AC-548), both
422 with the folded folder's path.

**The two refusals are two mechanisms, and only one of them is a schema
rule.** The undeclared key is `canonicalWorkflowBody`'s, where the file's own
values are compared to each other. The repeated *name* is
`labels_folder_name_idx`'s: there is one fold in this product and it is
`lower(name)`, so the collision is found by the INSERT and
`createWorkflowFolderLabels` maps its 23505 into the same 422 with the same
field path. That matters to this file because the folded folder has to reach
**both** — a fold that put the vocabulary where the importer could not create
it would fail differently from one that put it where the schema could not read
it, and this case would not tell them apart if it only asserted "not 201".

Spec: 7.16, 10.3. Issue #227 area 4, DES-206.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import { namesOf } from '../support/labels-harness.js'
import {
  folderLabelRows,
  importWorkflow,
  importWorkflowOk,
  taskFolderLabelIds,
  taskNamed,
  tasksByTitle,
} from '../support/label-lifecycle-harness.js'

let app: AuthTestApp
const cast = new Cast(['importer'], 'ac782')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-782 the one-folder file keeps its vocabulary', () => {
  test('a top-level vocabulary and top-level work arrive joined', async () => {
    const [importer] = (await cast.of(app)) as [Actor]
    const made = await importWorkflowOk(importer, {
      dana: 'workflow',
      version: 3,
      name: 'ac782 hand written',
      labels: [
        { key: 'l1', name: 'ac782 Urgent', color: '#AA1122', description: 'before the rest' },
        { key: 'l2', name: 'ac782 Someday', color: '#112233' },
      ],
      tasks: [
        { title: 'ac782 book the room', labels: ['l1'] },
        { title: 'ac782 send the invite' },
      ],
    })
    expect(made, 'one folder, folded from the top level').toHaveLength(1)
    const folderId = String(made[0]?.id)
    expect(
      made[0]?.name,
      'named by the file’s own name, as the fold has always named it',
    ).toBe('ac782 hand written')

    const labels = await folderLabelRows(app.db, folderId)
    expect(
      namesOf(labels),
      'the vocabulary is created: until this fold carried `labels`, the folded folder was rebuilt from name, tasks and items alone and this file answered 422 blaming the task for the folder’s missing declaration (#227 area 4)',
    ).toEqual(['ac782 Someday', 'ac782 Urgent'])
    expect(
      labels.find((label) => label.name === 'ac782 Urgent')?.description,
      'with the three value fields the per-folder arrangement carries, the fold translating rather than trimming',
    ).toBe('before the rest')

    const tasks = await tasksByTitle(app.db, folderId)
    const urgent = labels.find(
      (label) => label.name === 'ac782 Urgent',
    ) as { id: string }
    expect(
      await taskFolderLabelIds(app.db, taskNamed(tasks, 'ac782 book the room')),
      'and the key joins to it, which is the whole point of carrying the declaration into the same folder as the work',
    ).toEqual([urgent.id])
    expect(
      await taskFolderLabelIds(
        app.db,
        taskNamed(tasks, 'ac782 send the invite'),
      ),
      'while the task that named no key wears nothing',
    ).toEqual([])
  })

  test('a vocabulary no task uses is not the silent case any more', async () => {
    const [importer] = (await cast.of(app)) as [Actor]
    const made = await importWorkflowOk(importer, {
      dana: 'workflow',
      version: 3,
      name: 'ac782 unused vocabulary',
      labels: [{ key: 'l1', name: 'ac782 Research', color: '#334455' }],
      tasks: [{ title: 'ac782 the only task' }],
    })
    const folderId = String(made[0]?.id)
    expect(
      namesOf(await folderLabelRows(app.db, folderId)),
      'this file used to answer 201 with the vocabulary gone and nothing reporting it — the loss with no error at all, and an empty category is exactly what a template exists to set up (#227 area 4)',
    ).toEqual(['ac782 Research'])
  })

  test('and the version still gates the key, through this arrangement as through the other', async () => {
    const [importer] = (await cast.of(app)) as [Actor]
    const made = await importWorkflowOk(importer, {
      dana: 'workflow',
      version: 1,
      name: 'ac782 from another product',
      labels: ['work', 'home'],
      tasks: [{ title: 'ac782 foreign tags', labels: ['work'] }],
    })
    const folderId = String(made[0]?.id)
    expect(
      [...(await tasksByTitle(app.db, folderId)).keys()],
      'a version 1 file declares no vocabulary, so its `labels` is a foreign arrangement wherever it sits: the fold carries the key and `normalizeFolder` drops it on the version, which is one rule rather than two (spec 7.16; issue #227 area 4)',
    ).toEqual(['ac782 foreign tags'])
    expect(
      await folderLabelRows(app.db, folderId),
      'and nothing is invented from the tag names',
    ).toEqual([])
  })

  test('the folded vocabulary is validated where it lands, not merely stored', async () => {
    const [importer] = (await cast.of(app)) as [Actor]
    const twice = await importWorkflow(importer, {
      dana: 'workflow',
      version: 3,
      name: 'ac782 contradicts itself by name',
      labels: [
        { key: 'l1', name: 'ac782 Urgent', color: '#AA1122' },
        { key: 'l2', name: 'ac782 urgent', color: '#112233' },
      ],
      tasks: [{ title: 'ac782 work', labels: ['l1'] }],
    })
    expect(
      twice.status,
      'AC-780’s refusal reaches the folded folder: the vocabulary is folded into a folder the importer really creates, so the index sees both names and its 23505 comes back as this 422 — before that mapping existed the same file answered 500 (spec 7.16, 10.3)',
    ).toBe(422)
    expect(
      String(
        (twice.json() as { error?: { message?: unknown } }).error?.message ?? '',
      ),
      'addressed by the folded folder’s own path, which is the only path a one-folder file has',
    ).toContain('folders.0.labels')

    const undeclared = await importWorkflow(importer, {
      dana: 'workflow',
      version: 3,
      name: 'ac782 contradicts itself by key',
      labels: [{ key: 'l1', name: 'ac782 Urgent', color: '#AA1122' }],
      tasks: [{ title: 'ac782 work', labels: ['l2'] }],
    })
    expect(
      undeclared.status,
      'and AC-548’s: a key the file does not declare is still refused rather than dropped, now that there is a declaration to measure it against (#227 area 4)',
    ).toBe(422)
  })
})
