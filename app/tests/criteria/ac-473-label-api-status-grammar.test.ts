/*
AC-473 to AC-478: the Label API's status grammar, the archive contract, the
cross-Folder invariant, the access-loss rule and the five caps (issue #226,
parent #208).

## AC-473 is the gate no structural sweep can see, and that is why it exists

`ac-397` drives every route whose **path** carries an id as a signed-in
stranger and asserts a hand-written table in both directions, so a Label route
that forgot its `accessOf` gate fails there. `GET /api/v1/labels` is outside
that entirely: its Folder selector is `folder_id` in the **query string**, so
the route carries no path parameter, never enumerates, and could read any
account's Folder vocabulary while the whole suite stayed green. This file is
that gate's only structural check. The backend README names
`GET /events?folder=` as the standing example of the class; this is the second.

AC-473 also carries hard stop 3 for this surface. Three query fields are
declared — `scope`, `state` and `folder_id` — and a declared field the server
does not act on is stripped, dropped and answered 200 with nothing on the
wire to say so. That has cost this project four packages once already. So each
of the three is asserted by its **effect**: a listing that changes when the
field changes, never a request that was merely accepted.

## The rest

- **AC-474 is in its own file**, beside the other projection criterion.
- **AC-475, archive.** Non-destructive in five separate senses, each asserted:
  assignments survive, projections keep the Label with `archived: true`, the
  default listing drops it, it cannot be newly applied (409), restore
  re-enables application under the same id, and an archived assignment can
  still be removed.
- **AC-476, the cross-Folder invariant**, which #226 calls out as the one
  worth real thought. Asserted twice and deliberately: once through the API,
  where it is a 422 naming `label_id`, and once by **direct SQL**, because
  #226 asks for a Folder Label from Folder A to be unattachable to a Task in
  Folder B "even through a direct SQL mistake". A guard that lives only in a
  handler passes the first and fails the second.
- **AC-477, access loss.** A retained Personal assignment is invisible while
  its target is inaccessible and visible again when access returns, with the
  row never deleted in between.
- **AC-478, the caps.** The five numbers are product-visible contract by
  #208's own words, so they are asserted as numbers. The race-safety of the
  guards is `src/server/domain/cap-guards.test.ts`, which measures the
  statement order under a recorder; that property cannot be measured by a
  suite that runs these paths one at a time.

Spec: 5.4, 7.0, 7.4, 10.2, 10.3. Issue #226, #208 R4, R5, R5A, R8.
*/
import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import {
  FOLDER_PERSONAL_LABEL_CAP,
  PERSONAL_LABEL_DEFINITION_CAP,
  TASK_FOLDER_LABEL_CAP,
  TASK_PERSONAL_LABEL_CAP,
} from '../../src/shared/labels.js'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { expectRejectedBy, rows } from '../support/helpers.js'
import {
  Cast,
  addMemberOk,
  connect,
  createFolder,
  expectStatus,
  removeMember,
  seedTask,
} from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import {
  archiveFolderLabel,
  archivePersonalLabel,
  cardLabelsOf,
  countAssignments,
  createFolderLabel,
  createPersonalLabel,
  deleteFolderLabel,
  deleteTaskLabel,
  folderLabelsOf,
  getLabels,
  listLabels,
  patchPersonalLabel,
  postFolderLabel,
  postPersonalLabel,
  putFolderLabel,
  putTaskLabel,
  restorePersonalLabel,
  taskLabelsOf,
} from '../support/labels-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'member', 'stranger'], 'ac473')

interface Stage {
  owner: Actor
  member: Actor
  stranger: Actor
  shared: string
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
  const shared = await createFolder(owner, 'ac473 shared')
  await addMemberOk(owner, shared, member.id)
  const taskId = await seedTask(app.db, {
    folderId: shared,
    createdBy: owner.id,
    title: 'ac473 the task',
  })
  staged = { owner, member, stranger, shared, taskId }
  return staged
}

/** The field a 422 named. 10.3 puts it at the head of the message, which
 * `sendFieldValidationError` builds as `${field}: ${problem}.`; reading the
 * head rather than matching the sentence keeps this off wording no section
 * fixes. */
function refusedField(response: { json: () => unknown }): string {
  const body = response.json() as { error?: { message?: unknown } }
  return String(body.error?.message ?? '').split(':')[0] ?? ''
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
 * AC-473
 * ------------------------------------------------------------------ */

describe('AC-473 the definition listing is gated and its three query fields arrive', () => {
  test('AC-473: an inaccessible folder_id is 404, not 403 and not an empty list', async () => {
    const fx = await stage()
    await createFolderLabel(fx.owner, fx.shared, { name: 'ac473 Secret' })

    const refused = await getLabels(fx.stranger, { folder_id: fx.shared })
    expect(
      refused.status,
      'the folder_id selector is a resource id taken from the query string, so ac-397 never drives it and this is its only structural gate. 404 because a 403 would confirm the folder exists (10.2), and an empty 200 would be a different lie — it would say the folder is reachable and holds nothing',
    ).toBe(404)

    const unknown = await getLabels(fx.owner, { folder_id: randomUUID() })
    expect(
      unknown.status,
      'and a folder that exists nowhere reads exactly as one the caller may not have, which is what makes the refusal above carry no information',
    ).toBe(404)

    const allowed = await getLabels(fx.member, { folder_id: fx.shared })
    expect(
      allowed.status,
      'a member of the folder is answered',
    ).toBe(200)
  })

  test('AC-473: each of scope, state and folder_id changes the answer', async () => {
    const fx = await stage()
    const here = await createFolder(fx.owner, 'ac473 narrow here')
    const there = await createFolder(fx.owner, 'ac473 narrow there')
    const personal = await createPersonalLabel(fx.owner, {
      name: 'ac473 personal one',
    })
    const inHere = await createFolderLabel(fx.owner, here, {
      name: 'ac473 here one',
    })
    const inThere = await createFolderLabel(fx.owner, there, {
      name: 'ac473 there one',
    })
    const retired = await createPersonalLabel(fx.owner, {
      name: 'ac473 retired one',
    })
    expectStatus(
      await archivePersonalLabel(fx.owner, retired.id),
      200,
      'one archived Label, so `state` has something to do',
    )

    /* Hard stop 3, one assertion per declared field: the value arrives and
       changes the answer, rather than being accepted and dropped. */
    const idsOf = async (query: Parameters<typeof listLabels>[1]) =>
      (await listLabels(fx.owner, query)).map((label) => label.id)

    const bare = await idsOf({})
    expect(bare, 'the default carries Personal').toContain(personal.id)
    expect(bare, 'and Folder, scope defaulting to all').toContain(inHere.id)
    expect(
      bare,
      'and not the archived one, state defaulting to active',
    ).not.toContain(retired.id)

    const personalOnly = await idsOf({ scope: 'personal' })
    expect(personalOnly, 'scope=personal keeps the Personal').toContain(
      personal.id,
    )
    expect(personalOnly, 'and drops the Folder').not.toContain(inHere.id)

    const folderOnly = await idsOf({ scope: 'folder' })
    expect(folderOnly, 'scope=folder keeps the Folder').toContain(inHere.id)
    expect(folderOnly, 'and drops the Personal').not.toContain(personal.id)

    const archivedOnly = await idsOf({ state: 'archived' })
    expect(archivedOnly, 'state=archived is the archived one').toContain(
      retired.id,
    )
    expect(archivedOnly, 'and nothing active').not.toContain(personal.id)

    const both = await idsOf({ state: 'all' })
    expect(both, 'state=all is both').toContain(retired.id)
    expect(both, 'both, really').toContain(personal.id)

    const narrowed = await idsOf({ scope: 'folder', folder_id: here })
    expect(narrowed, 'folder_id narrows to that folder').toContain(inHere.id)
    expect(
      narrowed,
      'and excludes a Folder Label of another accessible folder, which is the whole of what the field does',
    ).not.toContain(inThere.id)
  })

  test('AC-473: an invalid query value is 422 naming the field', async () => {
    const fx = await stage()
    const refused = await fx.owner.browser.api('/labels?scope=library')
    expect(
      refused.status,
      'Library scope is M2+ and no value outside the two M1 scopes is admitted (#208 R4)',
    ).toBe(422)
    expect(
      refusedField(refused),
      'and the refusal names the field, which is 10.3\'s grammar',
    ).toBe('scope')
  })
})

/* ------------------------------------------------------------------ *
 * AC-475
 * ------------------------------------------------------------------ */

describe('AC-475 archive retires a Label without detaching anything', () => {
  test('AC-475: assignments survive, projections keep it, application stops, restore re-enables', async () => {
    const fx = await stage()
    const folderId = await createFolder(fx.owner, 'ac475 archive')
    const first = await seedTask(app.db, {
      folderId,
      createdBy: fx.owner.id,
      title: 'ac475 already labelled',
    })
    const second = await seedTask(app.db, {
      folderId,
      createdBy: fx.owner.id,
      title: 'ac475 not yet labelled',
    })
    const label = await createFolderLabel(fx.owner, folderId, {
      name: 'ac475 Seasonal',
    })
    expectStatus(
      await putTaskLabel(fx.owner, first, label.id),
      200,
      'applied while active',
    )

    expectStatus(
      await archiveFolderLabel(fx.owner, folderId, label.id),
      200,
      'archive answers the definition it changed',
    )

    /* 1. The row is still there. Asserted against the database rather than
          against a projection, because a projection that filtered archived
          Labels out would look identical to one that had detached them. */
    expect(
      await countAssignments(app.db, 'task_folder_labels', label.id),
      'archive detaches nothing (#208 R5 clause 8)',
    ).toBe(1)

    // 2. And both producers still carry it, flagged.
    for (const [where, labels] of [
      ['GET /tasks/:id', await taskLabelsOf(fx.owner, first)],
      ['the folder list read', await cardLabelsOf(fx.owner, folderId, first)],
    ] as const) {
      const chip = labels.folder.find((one) => one.id === label.id)
      expect(chip, `${where}: the archived Label stays on the work it is on`).toBeDefined()
      expect(
        chip?.archived,
        `${where}: and says so, which is what lets a chip be drawn subdued`,
      ).toBe(true)
    }

    // 3. The default listing drops it, and state=archived finds it.
    expect(
      (await listLabels(fx.owner, { scope: 'folder', folder_id: folderId })).map(
        (one) => one.id,
      ),
      'an archived Label leaves the ordinary picker',
    ).not.toContain(label.id)
    expect(
      (
        await listLabels(fx.owner, {
          scope: 'folder',
          folder_id: folderId,
          state: 'archived',
        })
      ).map((one) => one.id),
      'and stays discoverable under Archived',
    ).toContain(label.id)

    // 4. It cannot be newly applied.
    const refused = await putTaskLabel(fx.owner, second, label.id)
    expect(
      refused.status,
      '#208 R8: archived Labels cannot be newly applied. 409 rather than 422, because the Label is perfectly valid and it is its state that refuses',
    ).toBe(409)
    expect(
      (await taskLabelsOf(fx.owner, second)).folder,
      'and a 409 that still wrote would not be a refusal',
    ).toEqual([])

    // 5. An archived assignment may still be removed.
    expectStatus(
      await deleteTaskLabel(fx.owner, first, label.id),
      200,
      'archive stops new application and never traps what is already applied',
    )
    expect(
      await countAssignments(app.db, 'task_folder_labels', label.id),
      'the removal reached the row',
    ).toBe(0)

    // 6. Restore re-enables application under the same id.
    const restored = await fx.owner.browser.json(
      `/folders/${folderId}/labels/${label.id}/restore`,
      'POST',
    )
    expectStatus(restored, 200, 'restore answers the definition')
    const body = restored.json() as { id: string; archived: boolean }
    expect(
      body.id,
      '#208 R8: restore uses the same Label id, which is what keeps every saved View and filter that named it meaningful',
    ).toBe(label.id)
    expect(body.archived, 'and it is active again').toBe(false)
    expectStatus(
      await putTaskLabel(fx.owner, second, label.id),
      200,
      'and it applies again',
    )
  })

  test('AC-475: an archived Label may still be renamed, recoloured and described', async () => {
    const fx = await stage()
    const label = await createPersonalLabel(fx.owner, { name: 'ac475 Retired' })
    expectStatus(
      await archivePersonalLabel(fx.owner, label.id),
      200,
      'retired first',
    )
    const edited = await patchPersonalLabel(fx.owner, label.id, {
      name: 'ac475 Retired and tidied',
      color: '#112233',
      description: 'tidying an archived vocabulary is a reasonable thing to do',
    })
    expectStatus(
      edited,
      200,
      '#208 R5 clause 7: rename, colour and description may remain available while archived, and #226 says so outright',
    )
    const after = edited.json() as { archived: boolean; name: string }
    expect(after.archived, 'and the edit did not quietly restore it').toBe(true)
    expect(after.name, 'the new name is the one that was sent').toBe(
      'ac475 Retired and tidied',
    )
    expectStatus(
      await restorePersonalLabel(fx.owner, label.id),
      200,
      'restore still works on the renamed row',
    )
  })
})

/* ------------------------------------------------------------------ *
 * AC-476
 * ------------------------------------------------------------------ */

describe('AC-476 a Folder Label cannot leave its Folder, at either layer', () => {
  test('AC-476: through the API it is 422 naming label_id', async () => {
    const fx = await stage()
    const here = await createFolder(fx.owner, 'ac476 here')
    const there = await createFolder(fx.owner, 'ac476 there')
    const theirLabel = await createFolderLabel(fx.owner, there, {
      name: 'ac476 Theirs',
    })
    const taskHere = await seedTask(app.db, {
      folderId: here,
      createdBy: fx.owner.id,
      title: 'ac476 a task in here',
    })

    const refused = await putTaskLabel(fx.owner, taskHere, theirLabel.id)
    expect(
      refused.status,
      '#226: an accessible Label of the wrong target is 422, not 404. The caller can see both the task and the label — they own the folder the label is in — so a 404 would be a lie about something they can reach, and the honest answer is that the pairing is wrong',
    ).toBe(422)
    expect(
      refusedField(refused),
      'and #226 asks for the field to be named',
    ).toBe('label_id')
    expect(
      (await taskLabelsOf(fx.owner, taskHere)).folder,
      'nothing was written',
    ).toEqual([])
  })

  test('AC-476: through direct SQL the database refuses it', async () => {
    const fx = await stage()
    const here = await createFolder(fx.owner, 'ac476 sql here')
    const there = await createFolder(fx.owner, 'ac476 sql there')
    const theirLabel = await createFolderLabel(fx.owner, there, {
      name: 'ac476 SQL theirs',
    })
    const taskHere = await seedTask(app.db, {
      folderId: here,
      createdBy: fx.owner.id,
      title: 'ac476 sql task',
    })

    /*
    The half a handler cannot prove. #226 asks for the invariant to hold "even
    through a direct SQL mistake", so this bypasses the route entirely and
    writes the row a broken handler would write. Migration 0022 makes
    `task_folder_labels` carry its Folder and points both of its foreign keys
    at that column, so there is no value of `folder_id` that satisfies both:
    name the task's Folder and the Label key fails, name the Label's and the
    task key does.

    Asserted by constraint name through `expectRejectedBy`, which every
    translation keeps verbatim — the Postgres leg's created databases answer
    in this cluster's language, and `guard-postgres-leg-isolation` fails a test
    that reads server prose.
    */
    await expectRejectedBy(
      () =>
        app.db.execute(
          sql`INSERT INTO task_folder_labels (folder_id, task_id, label_id)
              VALUES (${here}::uuid, ${taskHere}::uuid, ${theirLabel.id}::uuid)`,
        ),
      'task_folder_labels_label_scope_fkey',
    )
    await expectRejectedBy(
      () =>
        app.db.execute(
          sql`INSERT INTO task_folder_labels (folder_id, task_id, label_id)
              VALUES (${there}::uuid, ${taskHere}::uuid, ${theirLabel.id}::uuid)`,
        ),
      'task_folder_labels_task_scope_fkey',
    )
    expect(
      await countAssignments(app.db, 'task_folder_labels', theirLabel.id),
      'and neither attempt left a row behind',
    ).toBe(0)
  })

  test('AC-476: a Folder object refuses a Folder Label', async () => {
    const fx = await stage()
    const folderId = await createFolder(fx.owner, 'ac476 self')
    const own = await createFolderLabel(fx.owner, folderId, {
      name: 'ac476 Its own',
    })

    const refused = await putFolderLabel(fx.owner, folderId, own.id)
    expect(
      refused.status,
      '#208 R4: a Folder Label classifies the Tasks in its Folder and never the Folder that owns them. 422 rather than 404 because the caller can see the label; what is wrong is the target',
    ).toBe(422)
    expect(refusedField(refused), 'named, as #226 asks').toBe('label_id')
    expect(
      await folderLabelsOf(fx.owner, folderId),
      'and the folder carries no labels at all',
    ).toEqual([])

    /* The database refuses it too: `folder_personal_labels.owner_user_id` is
       NOT NULL and its composite key points at `labels(id, owner_user_id)`,
       where a Folder Label's owner is NULL, so no pair exists that names one. */
    await expectRejectedBy(
      () =>
        app.db.execute(
          sql`INSERT INTO folder_personal_labels (folder_id, label_id, owner_user_id)
              VALUES (${folderId}::uuid, ${own.id}::uuid, ${fx.owner.id}::uuid)`,
        ),
      'folder_personal_labels_label_scope_fkey',
    )
  })

  test('AC-476: a Personal Label of another account is 404, not 422', async () => {
    const fx = await stage()
    const theirs = await createPersonalLabel(fx.member, {
      name: 'ac476 not yours',
    })
    const refused = await putTaskLabel(fx.owner, fx.taskId, theirs.id)
    expect(
      refused.status,
      'the two refusals are different facts and must not be confused: 422 says "you can see this and it does not fit", 404 says "you cannot see this". A Personal Label of another account is the second, and answering 422 here would confirm it exists',
    ).toBe(404)
  })
})

/* ------------------------------------------------------------------ *
 * AC-477
 * ------------------------------------------------------------------ */

describe('AC-477 a retained Personal assignment is invisible while the target is', () => {
  test('AC-477: losing and regaining folder access hides and restores it, with the row untouched', async () => {
    const fx = await stage()
    const folderId = await createFolder(fx.owner, 'ac477 access loss')
    await addMemberOk(fx.owner, folderId, fx.member.id)
    const taskId = await seedTask(app.db, {
      folderId,
      createdBy: fx.owner.id,
      title: 'ac477 the shared task',
    })
    const mine = await createPersonalLabel(fx.member, { name: 'ac477 Mine' })

    expectStatus(
      await putTaskLabel(fx.member, taskId, mine.id),
      200,
      'the member classifies shared work with their own vocabulary',
    )
    expectStatus(
      await putFolderLabel(fx.member, folderId, mine.id),
      200,
      'and the folder too',
    )

    // The membership goes. #208: the assignment may remain stored.
    expectStatus(
      await removeMember(fx.owner, folderId, fx.member.id),
      204,
      'the owner removes the member',
    )

    expect(
      await countAssignments(app.db, 'task_personal_labels', mine.id),
      '#208: the Personal assignment may remain stored through a loss of access, and here it does — this is the row the rest of the case is about',
    ).toBe(1)
    expect(
      await countAssignments(app.db, 'folder_personal_labels', mine.id),
      'and the folder one with it',
    ).toBe(1)

    /* Invisible to reads, filters, search and counts. The strongest form of
       that is the target being unreachable at all, which it is, so the
       assertion is that nothing about it leaks through any door the member
       still has. */
    expectStatus(
      await fx.member.browser.api(`/tasks/${taskId}`),
      404,
      'the task is gone from the member\'s reach entirely (10.2)',
    )
    const folders = await fx.member.browser.api('/folders')
    expectStatus(folders, 200, 'the member still reads their own folder list')
    expect(
      (folders.json() as { id: string }[]).map((one) => one.id),
      'and the folder they were removed from is not in it',
    ).not.toContain(folderId)

    const definition = await listLabels(fx.member, { scope: 'all', state: 'all' })
    expect(
      definition.map((one) => one.id),
      'the Label definition itself is still theirs and still listed, which is the point: the vocabulary is the person\'s, the assignment is what the access governs',
    ).toContain(mine.id)
    expect(
      JSON.stringify(definition),
      'and no metadata of the target they lost rides along with it',
    ).not.toContain(taskId)

    // Access returns, and so does the association.
    await addMemberOk(fx.owner, folderId, fx.member.id)
    expect(
      (await taskLabelsOf(fx.member, taskId)).personal.map((one) => one.id),
      '#208: if access is later restored and the target still exists, the Personal association may become visible again — with no repair step, because nothing deleted it',
    ).toContain(mine.id)
    expect(
      (await folderLabelsOf(fx.member, folderId)).map((one) => one.id),
      'and the folder one likewise',
    ).toContain(mine.id)
  })

  test('AC-477: purging the target removes the assignment', async () => {
    const fx = await stage()
    const folderId = await createFolder(fx.owner, 'ac477 purge')
    const taskId = await seedTask(app.db, {
      folderId,
      createdBy: fx.owner.id,
      title: 'ac477 doomed',
    })
    const mine = await createPersonalLabel(fx.owner, { name: 'ac477 Doomed' })
    expectStatus(
      await putTaskLabel(fx.owner, taskId, mine.id),
      200,
      'applied first',
    )

    /* A purge is the hard delete 8.8 performs at the end of Trash's thirty
       days; driven here as the DELETE it is, because what this asserts is the
       cascade in migration 0022 rather than the retention window. */
    await app.db.execute(sql`DELETE FROM tasks WHERE id = ${taskId}::uuid`)
    expect(
      await countAssignments(app.db, 'task_personal_labels', mine.id),
      '#208: purging the target removes the assignment, which is the FK cascade rather than a sweep somebody has to remember to run',
    ).toBe(0)
    expect(
      (await listLabels(fx.owner, { scope: 'personal' })).map((one) => one.id),
      'and the definition survives its target, the vocabulary being the person\'s',
    ).toContain(mine.id)
  })
})

/* ------------------------------------------------------------------ *
 * AC-478
 * ------------------------------------------------------------------ */

describe('AC-478 the five caps are the numbers #208 made contract', () => {
  test('AC-478: an assignment cap refuses at its boundary and names the collection', async () => {
    const fx = await stage()
    const folderId = await createFolder(fx.owner, 'ac478 caps')
    const taskId = await seedTask(app.db, {
      folderId,
      createdBy: fx.owner.id,
      title: 'ac478 the crowded task',
    })

    /*
    Filling a hundred Labels through the API would be two hundred requests, so
    the rows below the boundary are seeded directly and only the boundary
    itself is driven. The seeded rows are ordinary rows written exactly as the
    endpoint writes them, and the constraint that would refuse a bad one is
    the same; what is under test here is the guard's arithmetic and its
    refusal, not the insert.
    */
    const ids: string[] = []
    for (let n = 0; n < TASK_PERSONAL_LABEL_CAP; n += 1) {
      const made = await rows(
        app.db,
        sql`INSERT INTO labels (scope, owner_user_id, name, color)
            VALUES ('personal', ${fx.owner.id}::uuid,
                    ${`ac478 filler ${String(n)}`}, '#101010')
            RETURNING id`,
      )
      ids.push(String(made[0]?.id))
    }
    for (const id of ids) {
      await app.db.execute(
        sql`INSERT INTO task_personal_labels (task_id, label_id, owner_user_id)
            VALUES (${taskId}::uuid, ${id}::uuid, ${fx.owner.id}::uuid)`,
      )
    }

    const oneMore = await createPersonalLabel(fx.owner, {
      name: 'ac478 one too many',
    })
    const refused = await putTaskLabel(fx.owner, taskId, oneMore.id)
    expect(
      refused.status,
      `#226: a cap refusal is 422 naming the relevant collection. The number is ${String(TASK_PERSONAL_LABEL_CAP)}, which #208 makes product-visible contract rather than an implementation detail`,
    ).toBe(422)
    expect(refusedField(refused), 'and the collection is named').toBe('labels')

    /* At the cap, re-applying one that is already there still succeeds: the
       guard counts the rows that are not the one being written, so an
       idempotent repeat cannot be refused by a limit it did not move. */
    expectStatus(
      await putTaskLabel(fx.owner, taskId, ids[0] as string),
      200,
      'a repeat of a Label already applied is admitted at the cap, because it adds nothing',
    )

    /* And the Folder cap on the same task is a different number counted
       separately, which is what "per kind" means. */
    const folderLabel = await createFolderLabel(fx.owner, folderId, {
      name: 'ac478 folder one',
    })
    expectStatus(
      await putTaskLabel(fx.owner, taskId, folderLabel.id),
      200,
      `the ${String(TASK_FOLDER_LABEL_CAP)} Folder Labels a task may carry are counted apart from its ${String(TASK_PERSONAL_LABEL_CAP)} Personal ones, so a full Personal set does not block the shared vocabulary`,
    )
  })

  test('AC-478: the definition and Folder-assignment caps are the stated numbers', async () => {
    /* The two remaining numbers are asserted as constants rather than by
       filling them: 500 definitions is 500 requests, and what the constant
       is for is that the refusal message and the criterion read one source.
       The guards' race-safety is cap-guards.test.ts, which measures the
       statement order rather than the outcome. */
    expect(
      PERSONAL_LABEL_DEFINITION_CAP,
      '#226: 500 Personal Label definitions per user',
    ).toBe(500)
    expect(
      FOLDER_PERSONAL_LABEL_CAP,
      '#226: 100 Personal Labels applied to one Folder',
    ).toBe(100)
  })

  test('AC-478: a refused create writes nothing and the caller may try again', async () => {
    const fx = await stage()
    const folderId = await createFolder(fx.owner, 'ac478 refusals')
    /* The cheap half of the same property: a 422 or a 409 from this surface
       leaves the catalog as it was, so a caller who fixes the name succeeds
       on the next attempt rather than finding a half-written row in the way. */
    await createFolderLabel(fx.owner, folderId, { name: 'ac478 Taken' })
    expectStatus(
      await postFolderLabel(fx.owner, folderId, { name: 'AC478 TAKEN' }),
      409,
      'the collision is refused',
    )
    expectStatus(
      await postFolderLabel(fx.owner, folderId, { name: 'ac478 Free' }),
      201,
      'and the catalog is in the state it was, so the next name works',
    )
    expectStatus(
      await postPersonalLabel(fx.owner, { name: '   ' }),
      422,
      'a name that is only whitespace is empty after the trim, which is a bad value and therefore 422 rather than 409',
    )
    expectStatus(
      await deleteFolderLabel(fx.owner, folderId, randomUUID()),
      404,
      'and an unassignment naming a Label nobody has is 404 rather than a silent success',
    )
  })
})
