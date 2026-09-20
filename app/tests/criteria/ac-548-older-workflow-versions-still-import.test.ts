/*
AC-548: version 1 and version 2 workflow files still import, unchanged, after
the format gained a Label vocabulary at version 3 — and a version nobody has
written yet is still refused.

## What a version number is for here, and what it is not for

It says what a **reader** must understand. #227 bumped it to 3 because a
version-2 reader's schema does not declare `labels`, so a version-3 file handed
to one would have its whole classification stripped by `z.object` and import as
a folder that quietly lost something. The bump is how that reader is told to
refuse instead.

It is emphatically **not** a deprecation. Every file anybody has ever saved out
of Dana is a version 1 or a version 2, and #227 requires in terms that they go
on importing. So this file drives real older files through the live endpoint
and asserts the folder they make: the page, the work, the steps, the star, the
notes — and no Labels, because they carried none.

## An older file is not only a file Dana wrote

**The first draft of this criterion tested Dana's own version 1 and version 2
shapes and nothing else, and neither carries a `labels` key — so it could not
see the regression an adversarial review then measured.** Declaring `labels`
on the task and the folder made it a *validated* key at every version, and six
inputs that were accepted before #227 (the key stripped by `z.object`) became
422 after it. The one that matters is `tasks[].labels: ["work", "home"]`:
`labels` as an array of tag names per task is what most to-do exports write,
Todoist among them, and tolerating foreign arrangements is the entire reason
`normalizeWorkflowFile` exists. A version 1 file declares no vocabulary and so
cannot contradict itself about one; 422 telling its owner that "work" is not
one of this folder's labels is a sentence about a vocabulary that file never
claimed to have.

So two of those inputs are driven here, and the *same* refusal at version 3 is
driven beside them. The pair is the point: the tolerance is scoped by the
version rather than removed, and a change that deleted the refusal outright
would pass the first two cases and fail the third.

## The unknown version is the other half

A criterion that only proved "old files still work" would be satisfied by a
schema that accepted any number at all, which would put the silent-strip
failure straight back. So the last case names a version nothing writes and
requires 422. `src/shared/workflows.test.ts` carries the same pairs at the unit
level, including both 10.3 Label caps; this one drives the endpoint, because
the refusal a person meets is an HTTP status rather than a parse result.

Spec: 7.16, 10.3. Issue #227 area 4.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import {
  folderLabelRows,
  importWorkflow,
  importWorkflowOk,
  tasksByTitle,
} from '../support/label-lifecycle-harness.js'
import { readTask } from '../support/tasks-harness.js'

let app: AuthTestApp
const cast = new Cast(['importer'], 'ac528')

/** A version 1 file: the original arrangement, page blocks and work. */
const VERSION_ONE = {
  dana: 'workflow',
  version: 1,
  name: 'ac528 version one',
  folders: [
    {
      name: 'ac528 version one',
      blocks: [
        { kind: 'section', text: 'ac528 before the day' },
        { kind: 'paragraph', text: 'ac528 read this first.' },
      ],
      tasks: [
        {
          title: 'ac528 v1 book the room',
          notes: 'ac528 ask for the big one',
          important: true,
          steps: [{ title: 'ac528 check the calendar' }],
        },
        { title: 'ac528 v1 send the invite' },
      ],
    },
  ],
}

/** A version 2 file, declared as one, with no document of its own: the shape
 * a serialiser wrote between #204 and #227. The document half is AC-505's. */
const VERSION_TWO = {
  dana: 'workflow',
  version: 2,
  name: 'ac528 version two',
  folders: [
    {
      name: 'ac528 version two',
      tasks: [{ title: 'ac528 v2 the only task' }],
    },
  ],
}

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-548 the older versions are files, not history', () => {
  test('a version 1 file imports whole and brings no labels', async () => {
    const [importer] = (await cast.of(app)) as [Actor]
    const made = await importWorkflowOk(importer, VERSION_ONE)
    expect(made, 'one folder').toHaveLength(1)
    const folderId = String(made[0]?.id)

    const tasks = await tasksByTitle(app.db, folderId)
    expect(
      [...tasks.keys()].sort(),
      'both tasks arrive, exactly as they did before #227 widened the format',
    ).toEqual(['ac528 v1 book the room', 'ac528 v1 send the invite'])
    expect(
      await folderLabelRows(app.db, folderId),
      'and the folder holds no Folder Labels: a file that carried none creates none, rather than the import inventing a vocabulary (#227 area 4)',
    ).toEqual([])

    /* Read as a 7.6 detail rather than as a 7.10 card, because notes and step
       titles are not on a card at all — which is the very confusion
       `shared/workflows.ts`'s header records as the original data loss. */
    const detail = await readTask(
      importer,
      tasks.get('ac528 v1 book the room') as string,
    )
    expect(
      detail.notes,
      'the notes travelled, which is item 44’s B3 list unchanged',
    ).toBe('ac528 ask for the big one')
    expect(detail.important, 'and the star').toBe(true)
    expect(
      (detail.steps as { title: string }[]).map((step) => step.title),
      'and the step titles',
    ).toEqual(['ac528 check the calendar'])
    expect(
      detail.labels,
      'and the detail’s Label arrays are both empty, which is what "no vocabulary" looks like from the wire',
    ).toEqual({ personal: [], folder: [] })
  })

  test('a version 2 file imports', async () => {
    const [importer] = (await cast.of(app)) as [Actor]
    const made = await importWorkflowOk(importer, VERSION_TWO)
    const folderId = String(made[0]?.id)
    expect(
      [...(await tasksByTitle(app.db, folderId)).keys()],
      'the work arrives',
    ).toEqual(['ac528 v2 the only task'])
    expect(
      await folderLabelRows(app.db, folderId),
      'and no vocabulary is invented for it either',
    ).toEqual([])
  })

  test('a version 1 file whose tasks carry foreign tag names still imports', async () => {
    const [importer] = (await cast.of(app)) as [Actor]
    const made = await importWorkflowOk(importer, {
      dana: 'workflow',
      version: 1,
      name: 'ac528 from another product',
      folders: [
        {
          name: 'ac528 from another product',
          tasks: [
            { title: 'ac528 foreign tags', labels: ['work', 'home'] },
            { title: 'ac528 no tags' },
          ],
        },
      ],
    })
    const folderId = String(made[0]?.id)
    expect(
      [...(await tasksByTitle(app.db, folderId)).keys()].sort(),
      'the work arrives: a version 1 file declares no vocabulary, so its `labels` is a foreign arrangement to be dropped rather than a Dana one to be validated (#227 area 4)',
    ).toEqual(['ac528 foreign tags', 'ac528 no tags'])
    expect(
      await folderLabelRows(app.db, folderId),
      'and nothing is invented from the tag names: folding them into a vocabulary would have to invent a colour and a key, which is a product decision #227 did not take',
    ).toEqual([])
  })

  test('a null in a folder’s optional keys means absent, as it does in a task’s', async () => {
    const [importer] = (await cast.of(app)) as [Actor]
    const made = await importWorkflowOk(importer, {
      dana: 'workflow',
      version: 1,
      name: 'ac528 nulls',
      folders: [
        {
          name: 'ac528 nulls',
          labels: null,
          blocks: null,
          tasks: [{ title: 'ac528 the only task', labels: null, steps: null }],
        },
      ],
    })
    const folderId = String(made[0]?.id)
    expect(
      [...(await tasksByTitle(app.db, folderId)).keys()],
      'a serialiser that spells "none" as null has not written a malformed file, and the rule is the format’s rather than any one key’s',
    ).toEqual(['ac528 the only task'])
  })

  test('a version 3 file that contradicts its own vocabulary is refused', async () => {
    const [importer] = (await cast.of(app)) as [Actor]
    const refused = await importWorkflow(importer, {
      dana: 'workflow',
      version: 3,
      name: 'ac528 contradicts itself',
      folders: [
        {
          name: 'ac528 contradicts itself',
          labels: [{ key: 'l1', name: 'ac528 work', color: '#123456' }],
          tasks: [{ title: 'ac528 names a key it has not', labels: ['l2'] }],
        },
      ],
    })
    expect(
      refused.status,
      'the tolerance above is scoped by the version, not removed: a file that declares a vocabulary and then names a key outside it is refused rather than imported with its classification silently gone (#227 area 4)',
    ).toBe(422)
  })

  test('a version nobody writes is still refused', async () => {
    const [importer] = (await cast.of(app)) as [Actor]
    const refused = await importWorkflow(importer, {
      ...VERSION_TWO,
      version: 4,
      name: 'ac528 from the future',
      folders: [{ name: 'ac528 from the future', tasks: [{ title: 'x' }] }],
    })
    expect(
      refused.status,
      'an unknown version is 422 rather than read hopefully: accepting any number would put back exactly the silent strip the bump exists to prevent (#227 area 4)',
    ).toBe(422)
  })
})
