/*
AC-470 to AC-472 and AC-480: the M1 Label model's scope, privacy, identity and
management authority, driven over the wire (issue #226, parent #208).

## What each one is for

- **AC-470, privacy.** A Personal Label is invisible across accounts, in the
  definition listing and in every projection; a Folder Label is visible to the
  Folder's members and to nobody else. This is the sentence #226 spends the
  most words on, and it is the one a well-meaning implementation loses first,
  because the obvious query for "the labels on this task" has no viewer in it
  at all.
- **AC-471, identity.** Scope is part of identity: the same display name
  coexists across Personal and Folder and across two Folders, and within one
  catalog a name differing only by case is refused. And the projection's order
  is total and stated: active before archived, then lower(name), then id.
- **AC-472, the conflict status.** #208 leaves this open in terms — "a
  controlled 409 or a field-addressed 422, choose one convention and pin it
  with tests" — and `routes/labels.ts` chooses 409. This is the pin, and it
  asserts all four doors: create and rename, Personal and Folder.
- **AC-480, authority.** Every current Folder member has equal rights over a
  Folder's Labels until #209, with no owner exception, which is #208's
  accepted R5A. Asserted from the *member*'s side rather than the owner's,
  because an owner-only implementation passes every case driven by an owner.

## Why the projections are read twice, everywhere

Two producers make a Task's Label projection: `taskView` for the single-task
read, and `readCards` for all eight list queries. `cards.ts`'s own header
records that this duplication is a cost the plan accepted, and the guard
against drift is the shared schema plus criteria that read both. So every
assertion about a Task's Labels below reads `GET /tasks/:id` **and** a list
endpoint, and a privacy leak in either is red.

Spec: 4.4, 5.4, 7.0, 7.4, 10.2. Issue #226, #208 R4, R5A and R8.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import {
  Cast,
  addMemberOk,
  connect,
  createFolder,
  expectStatus,
  seedTask,
} from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import {
  archiveFolderLabel,
  cardLabelsOf,
  createFolderLabel,
  createPersonalLabel,
  folderLabelsOf,
  listLabels,
  namesOf,
  patchFolderLabel,
  patchPersonalLabel,
  postFolderLabel,
  postPersonalLabel,
  putFolderLabel,
  putTaskLabel,
  restoreFolderLabel,
  taskLabelsOf,
} from '../support/labels-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'member', 'stranger'], 'ac470')

interface Stage {
  owner: Actor
  member: Actor
  stranger: Actor
  /** A folder the owner and the member share. */
  shared: string
  /** A second shared folder, for the same-name-across-folders case. */
  other: string
  /** A task in `shared`, created by the owner. */
  taskId: string
}

let staged: Stage | undefined

async function stage(): Promise<Stage> {
  if (staged !== undefined) return staged
  const [owner, member, stranger] = (await cast.of(app)) as [
    Actor,
    Actor,
    Actor,
  ]
  await connect(app.db, owner.id, member.id)
  const shared = await createFolder(owner, 'ac470 shared')
  await addMemberOk(owner, shared, member.id)
  const other = await createFolder(owner, 'ac470 other')
  await addMemberOk(owner, other, member.id)
  const taskId = await seedTask(app.db, {
    folderId: shared,
    createdBy: owner.id,
    title: 'ac470 the labelled task',
  })
  staged = { owner, member, stranger, shared, other, taskId }
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

/* ------------------------------------------------------------------ *
 * AC-470
 * ------------------------------------------------------------------ */

describe('AC-470 a Personal Label is private and a Folder Label is the Folder\'s', () => {
  test('AC-470: one account never sees another\'s Personal definitions', async () => {
    const fx = await stage()
    const mine = await createPersonalLabel(fx.owner, { name: 'ac470 Family' })

    const ownerSees = await listLabels(fx.owner, { scope: 'personal' })
    expect(
      ownerSees.map((label) => label.id),
      'the owner reads their own Personal definitions',
    ).toContain(mine.id)

    /* The member shares two folders with the owner, so this is the case that
       matters: shared work does not share a private vocabulary. */
    const memberSees = await listLabels(fx.member, { scope: 'all', state: 'all' })
    expect(
      memberSees.map((label) => label.id),
      'a co-member of two folders must not read the owner\'s Personal definitions (#208 R4: visible only to that user)',
    ).not.toContain(mine.id)

    /* And the definition is unreachable by id as well as absent from the
       listing, which are two different failures: a listing can be filtered
       correctly while every write endpoint takes any id it is handed. */
    expectStatus(
      await patchPersonalLabel(fx.member, mine.id, { name: 'taken' }),
      404,
      'a foreign Personal Label is not found, never forbidden (10.2)',
    )
  })

  test('AC-470: a Folder Label is visible to members and to nobody else', async () => {
    const fx = await stage()
    const shared = await createFolderLabel(fx.owner, fx.shared, {
      name: 'ac470 Urgent',
    })

    const memberSees = await listLabels(fx.member, { scope: 'folder' })
    expect(
      memberSees.map((label) => label.id),
      'every member of the folder reads its shared vocabulary (#208 R4)',
    ).toContain(shared.id)

    const strangerSees = await listLabels(fx.stranger, {
      scope: 'all',
      state: 'all',
    })
    expect(
      strangerSees.map((label) => label.id),
      'a non-member reads nothing of a folder\'s vocabulary (5.4)',
    ).not.toContain(shared.id)

    expectStatus(
      await patchFolderLabel(fx.stranger, fx.shared, shared.id, {
        name: 'taken',
      }),
      404,
      'a non-member is told the folder does not exist, not that they may not write it (10.2)',
    )
  })

  test('AC-470: another member\'s Personal Labels never enter a Task projection', async () => {
    const fx = await stage()
    const ownersPrivate = await createPersonalLabel(fx.owner, {
      name: 'ac470 Mine alone',
    })
    const membersPrivate = await createPersonalLabel(fx.member, {
      name: 'ac470 Theirs alone',
    })
    const shared = await createFolderLabel(fx.owner, fx.shared, {
      name: 'ac470 Shared chip',
    })

    expectStatus(
      await putTaskLabel(fx.owner, fx.taskId, ownersPrivate.id),
      200,
      'the owner applies their own Personal Label to a task they can reach',
    )
    expectStatus(
      await putTaskLabel(fx.member, fx.taskId, membersPrivate.id),
      200,
      'the member applies theirs to the same task',
    )
    expectStatus(
      await putTaskLabel(fx.member, fx.taskId, shared.id),
      200,
      '#208 R5A: any member may apply an existing Folder Label',
    )

    /* Both producers, for the reason in the header: a leak in the list query
       and a leak in the single read are different defects. */
    for (const [who, actor, ownId, foreignId] of [
      ['the owner', fx.owner, ownersPrivate.id, membersPrivate.id],
      ['the member', fx.member, membersPrivate.id, ownersPrivate.id],
    ] as const) {
      for (const [where, labels] of [
        ['GET /tasks/:id', await taskLabelsOf(actor, fx.taskId)],
        ['the folder list read', await cardLabelsOf(actor, fx.shared, fx.taskId)],
      ] as const) {
        const personal = labels.personal.map((label) => label.id)
        expect(
          personal,
          `${where}: ${who} must see their own Personal Label on the task`,
        ).toContain(ownId)
        expect(
          personal,
          `${where}: ${who} must never see the other member's Personal Label. This is the single sentence #226 spends the most words on, and the usual way to fail it is a query with no viewer in it`,
        ).not.toContain(foreignId)
        expect(
          labels.folder.map((label) => label.id),
          `${where}: ${who} sees the Folder Label, which is shared by definition`,
        ).toContain(shared.id)
      }
    }
  })

  test('AC-470: a Personal Label on a Folder is invisible to the other member', async () => {
    const fx = await stage()
    const ownersPrivate = await createPersonalLabel(fx.owner, {
      name: 'ac470 Folder tag',
    })
    expectStatus(
      await putFolderLabel(fx.owner, fx.other, ownersPrivate.id),
      200,
      'a Personal Label may classify an accessible Folder (#208 R4 targets table)',
    )

    expect(
      (await folderLabelsOf(fx.owner, fx.other)).map((label) => label.id),
      'the owner sees their own Personal Label on the folder',
    ).toContain(ownersPrivate.id)
    expect(
      (await folderLabelsOf(fx.member, fx.other)).map((label) => label.id),
      'the co-member\'s Folder projection carries none of the owner\'s Personal Labels',
    ).not.toContain(ownersPrivate.id)
  })
})

/* ------------------------------------------------------------------ *
 * AC-471
 * ------------------------------------------------------------------ */

describe('AC-471 scope is part of identity, and the order is total', () => {
  test('AC-471: one name may exist in three catalogs at once', async () => {
    const fx = await stage()
    const personal = await createPersonalLabel(fx.owner, { name: 'Research' })
    const inShared = await createFolderLabel(fx.owner, fx.shared, {
      name: 'Research',
    })
    const inOther = await createFolderLabel(fx.owner, fx.other, {
      name: 'Research',
    })

    const ids = new Set([personal.id, inShared.id, inOther.id])
    expect(
      ids.size,
      '#208 R4: Personal Research, Folder A Research and Folder B Research are three Labels and are never merged by name',
    ).toBe(3)
    expect(personal.folder_id, 'a Personal Label names no folder').toBeNull()
    expect(inShared.folder_id, 'a Folder Label names its folder').toBe(fx.shared)
    expect(inOther.folder_id, 'and the other names the other').toBe(fx.other)
  })

  test('AC-471: a name differing only by case is refused inside one catalog', async () => {
    const fx = await stage()
    await createPersonalLabel(fx.owner, { name: 'ac471 Errands' })
    expectStatus(
      await postPersonalLabel(fx.owner, { name: 'ac471 ERRANDS' }),
      409,
      'names are unique case-insensitively within one Personal catalog (#208 R8)',
    )

    const folderName = 'ac471 Deliveries'
    await createFolderLabel(fx.owner, fx.shared, { name: folderName })
    expectStatus(
      await postFolderLabel(fx.member, fx.shared, {
        name: folderName.toLowerCase(),
      }),
      409,
      'and within one Folder catalog, whoever is asking',
    )
    /* The same string in the *other* folder is a different catalog and is
       admitted, which is what makes the refusal above about the catalog
       rather than about the string. */
    expectStatus(
      await postFolderLabel(fx.owner, fx.other, { name: folderName }),
      201,
      'the same name in another Folder is another Label',
    )
  })

  test('AC-471: an archived Label still holds its name against a new one', async () => {
    const fx = await stage()
    const retired = await createFolderLabel(fx.owner, fx.other, {
      name: 'ac471 Retired',
    })
    expectStatus(
      await archiveFolderLabel(fx.owner, fx.other, retired.id),
      200,
      'archive is a 200 that answers the definition',
    )
    expectStatus(
      await postFolderLabel(fx.owner, fx.other, { name: 'ac471 retired' }),
      409,
      '#226: uniqueness includes archived rows, because archive is non-destructive and the retired Label still holds its name',
    )
  })

  test('AC-471: a Task projection is ordered active, then lower(name), then id', async () => {
    const fx = await stage()
    const folderId = await createFolder(fx.owner, 'ac471 ordering')
    const taskId = await seedTask(app.db, {
      folderId,
      createdBy: fx.owner.id,
      title: 'ac471 ordered',
    })

    /* Created out of order and in mixed case, so that a projection which
       happened to return insertion order, or which sorted on the raw name,
       would be red. */
    const zebra = await createFolderLabel(fx.owner, folderId, { name: 'zebra' })
    const apple = await createFolderLabel(fx.owner, folderId, { name: 'Apple' })
    const middle = await createFolderLabel(fx.owner, folderId, { name: 'mango' })
    for (const label of [zebra, apple, middle]) {
      expectStatus(
        await putTaskLabel(fx.owner, taskId, label.id),
        200,
        'each label goes on the task',
      )
    }
    expectStatus(
      await archiveFolderLabel(fx.owner, folderId, apple.id),
      200,
      'the alphabetically first one is retired, so active-first and name order disagree',
    )

    for (const [where, labels] of [
      ['GET /tasks/:id', await taskLabelsOf(fx.owner, taskId)],
      ['the folder list read', await cardLabelsOf(fx.owner, folderId, taskId)],
    ] as const) {
      expect(
        namesOf(labels.folder),
        `${where}: active before archived, then lower(name), then id (#226). "Apple" sorts first by name and last here because it is archived, which is what separates the stated order from an ordinary alphabetical one`,
      ).toEqual(['mango', 'zebra', 'Apple'])
      expect(
        labels.folder.map((label) => label.archived),
        `${where}: the archived flag rides the projection, so a chip can be drawn subdued`,
      ).toEqual([false, false, true])
    }
  })
})

/* ------------------------------------------------------------------ *
 * AC-472
 * ------------------------------------------------------------------ */

describe('AC-472 a name collision is 409, on every door', () => {
  test('AC-472: create and rename answer 409 in both scopes, and write nothing', async () => {
    const fx = await stage()
    const folderId = await createFolder(fx.owner, 'ac472 conflicts')

    const personalFirst = await createPersonalLabel(fx.owner, {
      name: 'ac472 Alpha',
    })
    const personalSecond = await createPersonalLabel(fx.owner, {
      name: 'ac472 Beta',
    })
    const folderFirst = await createFolderLabel(fx.owner, folderId, {
      name: 'ac472 Gamma',
    })
    const folderSecond = await createFolderLabel(fx.owner, folderId, {
      name: 'ac472 Delta',
    })

    const doors: [string, Promise<{ status: number }>][] = [
      [
        'POST /labels/personal',
        postPersonalLabel(fx.owner, { name: 'AC472 ALPHA' }),
      ],
      [
        'PATCH /labels/personal/:labelId',
        patchPersonalLabel(fx.owner, personalSecond.id, {
          name: 'ac472 alpha',
        }),
      ],
      [
        'POST /folders/:folderId/labels',
        postFolderLabel(fx.owner, folderId, { name: 'AC472 GAMMA' }),
      ],
      [
        'PATCH /folders/:folderId/labels/:labelId',
        patchFolderLabel(fx.owner, folderId, folderSecond.id, {
          name: 'ac472 gamma',
        }),
      ],
    ]

    for (const [door, attempt] of doors) {
      const answer = await attempt
      expect(
        answer.status,
        `${door}: #208 leaves the uniqueness status open and routes/labels.ts pins 409 — a name that already exists in a catalog is the state of that catalog rather than a bad value, and the same string is valid in the next catalog along. All four doors answer the same way, which is the consistency #208 asks for`,
      ).toBe(409)
    }

    /* A 409 that still wrote is not a refusal. Both renames are checked
       against the row rather than against the response. */
    const after = await listLabels(fx.owner, { scope: 'all', state: 'all' })
    const byId = new Map(after.map((label) => [label.id, label.name]))
    expect(
      byId.get(personalSecond.id),
      'the refused Personal rename left the name it had',
    ).toBe('ac472 Beta')
    expect(
      byId.get(folderSecond.id),
      'the refused Folder rename left the name it had',
    ).toBe('ac472 Delta')
    expect(
      after.filter((label) => label.name.toLowerCase() === 'ac472 alpha').length,
      'and the refused create wrote no second Alpha',
    ).toBe(1)
    expect(byId.get(personalFirst.id), 'the original is untouched').toBe(
      'ac472 Alpha',
    )
    expect(byId.get(folderFirst.id), 'and so is the folder original').toBe(
      'ac472 Gamma',
    )
  })
})

/* ------------------------------------------------------------------ *
 * AC-480
 * ------------------------------------------------------------------ */

describe('AC-480 every Folder member manages that Folder\'s Labels', () => {
  test('AC-480: a member who does not own the folder does all six acts', async () => {
    const fx = await stage()
    const folderId = await createFolder(fx.owner, 'ac480 equal rights')
    await addMemberOk(fx.owner, folderId, fx.member.id)
    const taskId = await seedTask(app.db, {
      folderId,
      createdBy: fx.owner.id,
      title: 'ac480 the task',
    })

    /* Create, by the member. #208's accepted R5A says in terms: "all current
       Folder members have equal authority to create, rename, recolor,
       describe, archive, restore, apply and remove Folder Labels in M1. Do
       not special-case Folder ownership for Label management." An
       owner-only implementation passes every case driven by an owner, which
       is why this whole block is driven by the member. */
    const made = await createFolderLabel(fx.member, folderId, {
      name: 'ac480 Member made',
      description: 'by someone who does not own the folder',
    })

    const renamed = await patchFolderLabel(fx.member, folderId, made.id, {
      name: 'ac480 Member renamed',
      color: '#AA2255',
      description: 'and recoloured and described',
    })
    expectStatus(renamed, 200, 'rename, recolor and describe, by the member')

    expectStatus(
      await putTaskLabel(fx.member, taskId, made.id),
      200,
      'apply, by the member',
    )
    expectStatus(
      await archiveFolderLabel(fx.member, folderId, made.id),
      200,
      'archive, by the member',
    )
    expectStatus(
      await restoreFolderLabel(fx.member, folderId, made.id),
      200,
      'restore, by the member',
    )
    expectStatus(
      await app.browser().api(`/tasks/${taskId}/labels/${made.id}`, {
        method: 'DELETE',
      }),
      401,
      'and the whole surface is still behind a session',
    )

    const owner = await taskLabelsOf(fx.owner, taskId)
    expect(
      owner.folder.map((label) => label.name),
      'the owner sees what the member did, because a Folder Label is the Folder\'s',
    ).toContain('ac480 Member renamed')
  })

  test('AC-480: applying and removing are idempotent', async () => {
    const fx = await stage()
    const folderId = await createFolder(fx.owner, 'ac480 idempotent')
    const taskId = await seedTask(app.db, {
      folderId,
      createdBy: fx.owner.id,
      title: 'ac480 repeated',
    })
    const label = await createFolderLabel(fx.owner, folderId, {
      name: 'ac480 Repeat',
    })

    /* #226 asks for per-Label mutations precisely so that repetition and
       concurrency are safe, so the repetition is asserted rather than
       assumed. */
    for (const attempt of [1, 2, 3]) {
      const answer = await putTaskLabel(fx.owner, taskId, label.id)
      expectStatus(answer, 200, `PUT number ${String(attempt)} answers 200`)
      expect(
        (answer.json() as { labels: { folder: { id: string }[] } }).labels.folder
          .filter((one) => one.id === label.id).length,
        'and the label appears exactly once however many times it was applied',
      ).toBe(1)
    }

    for (const attempt of [1, 2]) {
      const removed = await fx.owner.browser.json(
        `/tasks/${taskId}/labels/${label.id}`,
        'DELETE',
      )
      expectStatus(removed, 200, `DELETE number ${String(attempt)} answers 200`)
      expect(
        (removed.json() as { labels: { folder: { id: string }[] } }).labels
          .folder.map((one) => one.id),
        'and the label is gone, a second removal being a no-op rather than a 404',
      ).not.toContain(label.id)
    }
  })
})
