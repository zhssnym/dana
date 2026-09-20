/*
AC-800: the twelve Label mutation routes resolve through the Folder Access
resolver rather than through membership, driven with one real actor at every
one of R8A's six presets against both Label actions -- and asserting what each
preset is **refused** as hard as what it is allowed.

Issue #274, which carries the ruling this criterion pins: **R8 supersedes
#208's R5A**. Product authority: accepted #209 R8A, and #228's per-preset
lists -- "Assigned work / Can comment / Can view may not modify shared Folder
Labels".

## Why this criterion had to exist before the gates were worth anything

AC-523 maps every mutating route to the Folder action it performs, in both
directions over the mounted router, and its own header says in terms that it
**does not check that the mapping is right**. Nothing structural can. So
between #226 and #274 the Label surface was in the state that arrangement
makes visible: eight rows naming two actions at `can_edit`, and six routes
that asked for neither. The table was honest and the bars were not enforced.

This is the other half, on the AC-512 to AC-521 pattern: real people at real
presets driving real requests. **A gate that always returns true passes every
test that only checks the allowed side**, which is why every case below
asserts a refusal beside its success, and why the refusals were proved by
making `mayPerform` answer `{ allowed: true }` unconditionally and watching
them go red.

## Reading the rows rather than the response

Every assertion here reads the database after the request as well as the
status. The reason is hard stop 3's reason one layer over: a 403 that wrote
the row anyway and a 200 that wrote nothing both look exactly like the thing
they are not, and a criterion about authority that reads only a status is
asserting that the server *said* no rather than that nothing happened.
`labelRow`, `listLabels` and `countAssignments` are the three doors used, and
which one each case uses is the one that would notice.

## The two actions, and the three shapes of answer

- **`label.vocabulary.manage`**, `atLeast: 'can_edit'`, no assignment arm.
  Create, rename, archive, restore -- four routes, one bar, and custody is
  irrelevant to it, so a Full-control member who does not own the folder does
  all four (which is AC-480's "no owner exception" surviving the supersession
  unchanged).
- **`label.apply`**, `atLeast: 'can_edit'` with
  `whenAssignedToActor: ['can_contribute']`. The bar bites at Assigned work
  and below **even on their own Task**, which is the sharpest line in this
  file and the one an implementation resolving from `tasks.assignee_id` alone
  would get wrong.
- **Personal Labels are outside Folder Access at every preset** (#228's
  personal-actions rule, `personal.label`). A Can-view member still classifies
  shared work with their own private vocabulary, and the last case drives that
  whole path, because over-gating is the likeliest way to implement this issue
  wrongly and nothing else in the suite would catch it.

Spec: 5.4, 7.0, 7.4, 10.2. Issues #274, #228, #226, #208 R5A and R8.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { sharedFolder, taskIn } from '../support/folder-access-harness.js'
import { Cast, expectStatus } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import {
  archiveFolderLabel,
  countAssignments,
  createFolderLabel,
  createPersonalLabel,
  deleteFolderLabel,
  deleteTaskLabel,
  folderLabelsOf,
  labelRow,
  listLabels,
  patchFolderLabel,
  patchPersonalLabel,
  postFolderLabel,
  putFolderLabel,
  putTaskLabel,
  restoreFolderLabel,
  taskLabelsOf,
} from '../support/labels-harness.js'
import type { FolderAccessPreset } from '../../src/shared/folder-access.js'
import type { RawResponse } from '../support/http-client.js'

let app: AuthTestApp

/** One actor per preset, plus the owner who builds the folder and is never
 * the actor under test: an owner-driven case passes against an
 * implementation that resolves authority from `folders.owner_id`. */
const cast = new Cast(
  ['owner', 'viewer', 'commenter', 'assignee', 'contributor', 'editor', 'admin'],
  'ac800',
)

/** The four presets R8 refuses both Label actions to, and the two it admits.
 * Written out rather than derived from `FOLDER_ACCESS_PRESETS` and the rules
 * table: a criterion that computes its expectation the way the code does
 * proves only that the code agrees with itself. These are transcribed from
 * #228's per-preset lists. */
const BELOW_THE_BAR = [
  'can_contribute',
  'assigned_work',
  'can_comment',
  'can_view',
] as const
const AT_OR_ABOVE = ['can_edit', 'full_control'] as const

interface Stage {
  owner: Actor
  /** The actor holding each preset. */
  at: Record<FolderAccessPreset, Actor>
  folderId: string
  /** A Task in the folder assigned to nobody: the "work that is not yours"
   * every preset below Can edit meets. */
  looseTaskId: string
  /** One Task per preset, currently assigned to that preset's actor. This is
   * what makes `whenAssignedToActor` a real question rather than a branch
   * nothing reaches. */
  ownTask: Record<FolderAccessPreset, string>
}

let staged: Stage | undefined

async function stage(): Promise<Stage> {
  if (staged !== undefined) return staged
  const [owner, viewer, commenter, assignee, contributor, editor, admin] =
    (await cast.of(app)) as [Actor, Actor, Actor, Actor, Actor, Actor, Actor]
  const at: Record<FolderAccessPreset, Actor> = {
    full_control: admin,
    can_edit: editor,
    can_contribute: contributor,
    assigned_work: assignee,
    can_comment: commenter,
    can_view: viewer,
  }
  const folderId = await sharedFolder(
    app,
    owner,
    'ac800 the shared vocabulary',
    (Object.keys(at) as FolderAccessPreset[]).map(
      (preset) => [at[preset], preset] as const,
    ),
  )
  const looseTaskId = await taskIn(
    owner,
    folderId,
    'ac800 nobody holds this',
    null,
  )
  const ownTask = {} as Record<FolderAccessPreset, string>
  for (const preset of Object.keys(at) as FolderAccessPreset[]) {
    ownTask[preset] = await taskIn(
      owner,
      folderId,
      `ac800 held by ${preset}`,
      at[preset].id,
    )
  }
  staged = { owner, at, folderId, looseTaskId, ownTask }
  return staged
}

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

/** The error envelope's code and message, for the half of a refusal that is
 * about what the person is told. 7.0's shape, read rather than matched as a
 * whole sentence: the `why` strings are product copy and may be reworded, but
 * the code and the subject of the sentence are the contract. */
function refusal(response: RawResponse): { code: string; message: string } {
  const body = response.json() as {
    error?: { code?: unknown; message?: unknown }
  }
  return {
    code: String(body.error?.code ?? ''),
    message: String(body.error?.message ?? ''),
  }
}

/** Whether the folder's catalog holds a definition by this name, read by the
 * owner, who can see all of it. A refused create that wrote anyway is
 * invisible to the refused caller and obvious here. */
async function catalogHolds(fx: Stage, name: string): Promise<boolean> {
  const rows = await listLabels(fx.owner, {
    scope: 'folder',
    folder_id: fx.folderId,
    state: 'all',
  })
  return rows.some((row) => row.name === name)
}

describe('AC-800 the shared Label vocabulary is Can edit’s', () => {
  test('AC-800: the four vocabulary writes are refused below Can edit, and write nothing', async () => {
    const fx = await stage()
    const subject = await createFolderLabel(fx.owner, fx.folderId, {
      name: 'ac800 Owner made this',
      color: '#224466',
      description: 'the definition every refusal below leaves alone',
    })

    for (const preset of BELOW_THE_BAR) {
      const actor = fx.at[preset]
      const name = `ac800 ${preset} tried to create`

      const created = await postFolderLabel(actor, fx.folderId, { name })
      expectStatus(
        created,
        403,
        `#274: ${preset} may not create a shared Folder Label. 403 rather than 404, because they demonstrably see the folder (10.2)`,
      )
      expect(
        await catalogHolds(fx, name),
        `and the catalog is as it was: a 403 that created the row would be the one failure a status assertion cannot see`,
      ).toBe(false)

      expectStatus(
        await patchFolderLabel(actor, fx.folderId, subject.id, {
          name: `ac800 ${preset} renamed it`,
          color: '#FF0000',
        }),
        403,
        `#274: nor rename, recolour or describe one`,
      )
      expectStatus(
        await archiveFolderLabel(actor, fx.folderId, subject.id),
        403,
        `#274: nor archive it`,
      )
      expectStatus(
        await restoreFolderLabel(actor, fx.folderId, subject.id),
        403,
        `#274: nor restore it`,
      )

      const row = await labelRow(app.db, subject.id)
      expect(
        [row.name, row.color],
        `${preset} left the definition exactly as the owner wrote it`,
      ).toEqual(['ac800 Owner made this', '#224466'])
    }

    /* Archive state is read separately, because a rename and an archive are
       different columns and the check above reads neither archived_at. */
    const listed = await listLabels(fx.owner, {
      scope: 'folder',
      folder_id: fx.folderId,
      state: 'all',
    })
    expect(
      listed.find((row) => row.id === subject.id)?.archived,
      'and it is still active, four refused archives later',
    ).toBe(false)
  })

  test('AC-800: Can edit and Full control do all four, and neither owns the folder', async () => {
    const fx = await stage()

    for (const preset of AT_OR_ABOVE) {
      const actor = fx.at[preset]
      const made = await createFolderLabel(actor, fx.folderId, {
        name: `ac800 ${preset} made this`,
        color: '#5566CC',
        description: `created by ${preset}`,
      })

      const renamed = await patchFolderLabel(actor, fx.folderId, made.id, {
        name: `ac800 ${preset} renamed this`,
        color: '#AA2255',
      })
      expectStatus(
        renamed,
        200,
        `accepted R8A: ${preset} manages the shared Label vocabulary`,
      )
      const row = await labelRow(app.db, made.id)
      expect(
        [row.name, row.color],
        'and the rename reached the row rather than only the response',
      ).toEqual([`ac800 ${preset} renamed this`, '#AA2255'])

      expectStatus(
        await archiveFolderLabel(actor, fx.folderId, made.id),
        200,
        `${preset} archives`,
      )
      expectStatus(
        await restoreFolderLabel(actor, fx.folderId, made.id),
        200,
        `and restores`,
      )
    }

    /* The property AC-480 asserted under R5A and that survives the
       supersession unchanged: ownership is custody and says nothing about
       Work. Neither actor above owns this folder. */
    expect(
      [fx.at.can_edit.id, fx.at.full_control.id],
      'neither of the two actors above is the folder owner, so none of it passed on custody',
    ).not.toContain(fx.owner.id)
  })
})

describe('AC-800 applying a Folder Label is Can edit’s, or your own work’s', () => {
  test('AC-800: on work that is not theirs, every preset below Can edit is refused', async () => {
    const fx = await stage()
    const label = await createFolderLabel(fx.owner, fx.folderId, {
      name: 'ac800 For the unheld task',
    })

    for (const preset of BELOW_THE_BAR) {
      expectStatus(
        await putTaskLabel(fx.at[preset], fx.looseTaskId, label.id),
        403,
        `#228: ${preset} may not apply a shared Folder Label to a Task that is not currently theirs`,
      )
    }
    expect(
      await countAssignments(app.db, 'task_folder_labels', label.id),
      'and four refusals wrote no assignment at all',
    ).toBe(0)

    for (const preset of AT_OR_ABOVE) {
      expectStatus(
        await putTaskLabel(fx.at[preset], fx.looseTaskId, label.id),
        200,
        `accepted R8A: ${preset} applies Folder Labels across the folder's work`,
      )
    }
    expect(
      await countAssignments(app.db, 'task_folder_labels', label.id),
      'the two admitted applications are one row, the PUT being idempotent',
    ).toBe(1)
    expect(
      (await taskLabelsOf(fx.owner, fx.looseTaskId)).folder.map((one) => one.id),
      'and the Task wears it',
    ).toContain(label.id)
  })

  test('AC-800: on their own Task, Can contribute applies and Assigned work and below do not', async () => {
    const fx = await stage()
    const label = await createFolderLabel(fx.owner, fx.folderId, {
      name: 'ac800 For work you hold',
    })

    /* The `whenAssignedToActor` arm, which is the whole of Can contribute's
       Label authority: the Task is currently assigned to them. */
    expectStatus(
      await putTaskLabel(
        fx.at.can_contribute,
        fx.ownTask.can_contribute,
        label.id,
      ),
      200,
      'R8: Can contribute applies and removes existing Folder Labels on work they may self-manage',
    )
    expect(
      (await taskLabelsOf(fx.at.can_contribute, fx.ownTask.can_contribute))
        .folder.map((one) => one.id),
      'and the assignment is on the Task they hold',
    ).toContain(label.id)

    /* And the line #228 draws immediately under it. Assigned work executes an
       existing plan; classifying shared work is not execution, and holding
       the Task does not widen it. */
    for (const preset of ['assigned_work', 'can_comment', 'can_view'] as const) {
      expectStatus(
        await putTaskLabel(fx.at[preset], fx.ownTask[preset], label.id),
        403,
        `#228: ${preset} may not modify shared Folder Labels, their own current Task included`,
      )
    }
    expect(
      await countAssignments(app.db, 'task_folder_labels', label.id),
      'so exactly one of the four Tasks carries it: Can contribute’s',
    ).toBe(1)
  })

  test('AC-800: removal is refused at the same bar, and the standing assignment survives it', async () => {
    const fx = await stage()
    const label = await createFolderLabel(fx.owner, fx.folderId, {
      name: 'ac800 Applied then defended',
    })
    expectStatus(
      await putTaskLabel(fx.owner, fx.looseTaskId, label.id),
      200,
      'the owner applies it first, so there is something to remove',
    )

    for (const preset of BELOW_THE_BAR) {
      expectStatus(
        await deleteTaskLabel(fx.at[preset], fx.looseTaskId, label.id),
        403,
        `R8 names application and removal in one clause, so ${preset} is refused both`,
      )
    }
    expect(
      await countAssignments(app.db, 'task_folder_labels', label.id),
      'and the assignment still stands: a 403 that deleted the row is the failure this reads for',
    ).toBe(1)

    expectStatus(
      await deleteTaskLabel(fx.at.can_edit, fx.looseTaskId, label.id),
      200,
      'Can edit removes it',
    )
    expect(
      await countAssignments(app.db, 'task_folder_labels', label.id),
      'and the removal reached the row',
    ).toBe(0)

    /* Can contribute's own-work arm covers removal too, which is the half a
       gate written only on the PUT would miss. */
    expectStatus(
      await putTaskLabel(fx.at.can_edit, fx.ownTask.can_contribute, label.id),
      200,
      'put back on the contributor’s own Task by somebody who may',
    )
    expectStatus(
      await deleteTaskLabel(
        fx.at.can_contribute,
        fx.ownTask.can_contribute,
        label.id,
      ),
      200,
      'R8: Can contribute removes an existing Folder Label from work they may self-manage',
    )
    expect(
      await countAssignments(app.db, 'task_folder_labels', label.id),
      'and that removal reached the row as well',
    ).toBe(0)
  })

  test('AC-800: the refusal is a 403 that says why, not a 404 and not a bare status', async () => {
    const fx = await stage()
    const label = await createFolderLabel(fx.owner, fx.folderId, {
      name: 'ac800 The refusal itself',
    })

    const vocabulary = refusal(
      await postFolderLabel(fx.at.can_view, fx.folderId, {
        name: 'ac800 never created',
      }),
    )
    expect(vocabulary.code, '7.0’s envelope for a refused act').toBe('forbidden')
    expect(
      vocabulary.message,
      'and it names the thing refused rather than answering an empty sentence: the resolver’s `why` is on the wire, which is what makes a 403 readable',
    ).toContain('Label vocabulary')

    const apply = refusal(
      await putTaskLabel(fx.at.can_view, fx.looseTaskId, label.id),
    )
    expect(apply.code, 'the same envelope on the assignment pair').toBe(
      'forbidden',
    )
    expect(
      apply.message,
      'carrying R8’s own sentence about shared Folder Labels',
    ).toContain('Folder Labels')

    /* And the distinction 10.2 turns on: a member is refused, a stranger is
       told nothing. The `can_view` actor above got 403 because they can see
       the folder; somebody outside it gets 404 from the same routes, which is
       `ac-397`'s whole table and is not re-driven here. */
    expect(
      [vocabulary.code, apply.code],
      'neither refusal is a not_found, which would be the wrong answer for somebody who can see the folder',
    ).not.toContain('not_found')
  })
})

describe('AC-800 Personal Labels stay outside Folder Access', () => {
  test('AC-800: a Can-view member keeps their whole private vocabulary and applies it', async () => {
    const fx = await stage()
    const viewer = fx.at.can_view

    /* #228's personal-actions rule, and the half of #274 that is about not
       over-reaching: a Personal Label is the person's own, governed by
       account ownership, and no Folder preset narrows it. The obvious wrong
       implementation of this issue gates the assignment routes on the route
       rather than on the Label's scope, and every assertion below goes red
       for it. */
    const mine = await createPersonalLabel(viewer, {
      name: 'ac800 Mine alone',
      color: '#88AA22',
    })
    expectStatus(
      await patchPersonalLabel(viewer, mine.id, { name: 'ac800 Still mine' }),
      200,
      'their own vocabulary is theirs to rename at any preset (#208 R4, 7.24)',
    )

    expectStatus(
      await putTaskLabel(viewer, fx.looseTaskId, mine.id),
      200,
      '#228: a Can-view member classifies work they can read with their own private vocabulary',
    )
    expect(
      await countAssignments(app.db, 'task_personal_labels', mine.id),
      'and the row is there',
    ).toBe(1)
    expect(
      (await taskLabelsOf(viewer, fx.looseTaskId)).personal.map((one) => one.id),
      'and they see it on the Task',
    ).toContain(mine.id)

    expectStatus(
      await putFolderLabel(viewer, fx.folderId, mine.id),
      200,
      'and the folder itself, which is the same personal act one target over',
    )
    expect(
      (await folderLabelsOf(viewer, fx.folderId)).map((one) => one.id),
      'their own arrangement of their own library',
    ).toContain(mine.id)

    expectStatus(
      await deleteTaskLabel(viewer, fx.looseTaskId, mine.id),
      200,
      'and they take their own classification off again',
    )
    expectStatus(
      await deleteFolderLabel(viewer, fx.folderId, mine.id),
      200,
      'on both targets',
    )
    expect(
      [
        await countAssignments(app.db, 'task_personal_labels', mine.id),
        await countAssignments(app.db, 'folder_personal_labels', mine.id),
      ],
      'both rows are gone, so nothing here was refused quietly and answered 200',
    ).toEqual([0, 0])
  })
})
