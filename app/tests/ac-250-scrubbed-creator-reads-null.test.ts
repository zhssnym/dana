/*
AC-250: given the creator's account deleted under 8.10, then `created_by` is
null on every card and detail the task appears on, while `tasks.created_by`
still points at the scrubbed row.

RFC 0005 unit 12a admits null into `created_by` through exactly one door: "It
is null only where the creator's account was scrubbed by 8.10, which is what
'renders as Deleted user' in that section means on the wire." This file is
that door, and it walks through it rather than describing it.

**The null is produced by a real deletion, never by a fixture with a null in
it**, which is AC-178's discipline applied on the API side. 8.10 is a
transaction of eight steps and this criterion turns on which of them touch the
creator: step 4 removes the account's memberships, step 7 scrubs the user row
and sets deleted_at, and the surviving references keep pointing at it. A
fixture that wrote a null into the column would assert the rendering and not
the sentence, and would still pass on the day 8.10 started nulling the
reference instead of scrubbing the user.

**Two implementations are wrong in opposite directions and both are checked.**

One nulls the column to make deletion easy. That is what AC-138 already
refuses on the column, and the same assertion stands here beside the wire so
this file cannot be read as licensing it: null on the wire is a rendering of a
surviving reference, never the absence of one.

The other joins the creator through folder membership rather than through 4.1.
Step 4 deletes the departed account's membership row, so such a projection
nulls the creator of every row in the folder, which is indistinguishable from
correct on a fixture where the deleted account wrote everything. So the
surviving member's own task sits in the same folder and must still carry their
stub after the deletion, which is what separates "the creator's account is
gone" from "somebody's account is gone".

The row is read before the deletion too, so a card that answered null all
along would fail on the before rather than pass on the after.

Spec: 7.0 as RFC 0005 unit 12a replaces its TaskCard line, 8.10 (steps 4 and
7, and the surviving-references sentence), 4.1 (soft deletion, the null
"Deleted user" renders from), 4.5 (created_by RESTRICT), 7.1, 7.10, 7.6.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast, expectStatus } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import { deleteAccount, userRowById } from './sharing-harness.js'
import { createTaskOk, readTask, requireTaskRow } from './tasks-harness.js'
import {
  folderOpen,
  requireCard,
  sharedFolder,
  tasksRowsOf,
  tasksView,
  ZONE_BEHIND,
} from './views-harness.js'

let app: AuthTestApp
const cast = new Cast(['keeper', 'doomed'], 's18')

/** No calendar day is read here; every 7.10 body takes a zone and this is it. */
const tz = ZONE_BEHIND

interface Stage {
  keeper: Actor
  doomed: Actor
  folderId: string
  byDoomedId: string
  byKeeperId: string
}
let staged: Stage | undefined

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const [keeper, doomed] = await cast.of(app)
    if (keeper === undefined || doomed === undefined) {
      throw new Error('cast must produce two actors')
    }
    // The keeper owns the folder, so nothing here rides 8.9's transfer: what
    // survives the deletion is this file's whole subject.
    const folderId = await sharedFolder(app.db, keeper, doomed, 's18 ac250 authorship')

    const byDoomed = await createTaskOk(
      doomed,
      {
        title: 's18 ac250 written by the doomed account',
        folder_id: folderId,
        assignee_id: keeper.id,
      },
      'the departing member authors a task, assigned away so R-CLEAN has nothing of theirs to clear (spec 7.6, 5.3)',
    )
    // The control row, in the same folder, authored by the account that
    // stays: a projection joining the creator through membership nulls this
    // one too and is caught by it.
    const byKeeper = await createTaskOk(
      keeper,
      {
        title: 's18 ac250 written by the survivor',
        folder_id: folderId,
        assignee_id: keeper.id,
      },
      'and the surviving member authors one beside it (spec 7.6)',
    )
    staged = {
      keeper,
      doomed,
      folderId,
      byDoomedId: byDoomed.id,
      byKeeperId: byKeeper.id,
    }
  }
  return staged
}

/** One task's `created_by` off all three surfaces the widened card reaches. */
async function creatorEverywhere(
  viewer: Actor,
  folderId: string,
  taskId: string,
): Promise<{ folderRead: unknown; viewBody: unknown; detail: unknown }> {
  const open = await folderOpen(viewer, folderId, tz)
  const folderCard = requireCard(
    [...open.scheduled, ...open.unscheduled],
    taskId,
    `the folder read must carry task ${taskId} (spec 6 Q7)`,
  )
  const viewCard = requireCard(
    tasksRowsOf(await tasksView(viewer, tz)),
    taskId,
    'and Q2 must carry the same undated open task (spec 6 Q2)',
  )
  const detail = await readTask(viewer, taskId)
  return {
    folderRead: folderCard.created_by,
    viewBody: viewCard.created_by,
    detail: detail.created_by,
  }
}

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-250 a scrubbed creator reads null', () => {
  test('AC-250: the creator is named while the account is alive', async () => {
    const { keeper, doomed, folderId, byDoomedId } = await stage()
    const seen = await creatorEverywhere(keeper, folderId, byDoomedId)
    expect(
      seen.folderRead,
      'the premise the deletion is measured against: a card that answered null all along would pass the after and fail here (spec 7.0 as unit 12a replaces it)',
    ).toMatchObject({ id: doomed.id })
    expect(seen.viewBody, 'on the view body too').toMatchObject({ id: doomed.id })
    expect(seen.detail, 'and on the detail').toMatchObject({ id: doomed.id })
  })

  test('AC-250: after the scrub the creator is null on every surface', async () => {
    const { keeper, doomed, folderId, byDoomedId } = await stage()
    expectStatus(
      await deleteAccount(doomed),
      204,
      'DELETE /me with the literal confirm string answers 204 (spec 7.1, 8.10)',
    )
    expect(
      (await userRowById(app.db, doomed.id))?.deleted_at,
      'the premise: step 7 scrubbed the row and marked it deleted rather than removing it (spec 8.10, 4.1)',
    ).not.toBeNull()

    expect(
      await creatorEverywhere(keeper, folderId, byDoomedId),
      'unit 12a\'s one door to null: a creator whose account 8.10 scrubbed has no stub to answer with, which is what "renders as Deleted user" means on the wire (spec 7.0 as unit 12a replaces it, 4.1)',
    ).toEqual({ folderRead: null, viewBody: null, detail: null })
  })

  test('AC-250: the column underneath still names the scrubbed row', async () => {
    const { doomed, byDoomedId } = await stage()
    expect(
      String((await requireTaskRow(app.db, byDoomedId)).created_by),
      'null on the wire is a rendering of a surviving reference and never the absence of one: 4.5 makes the key RESTRICT precisely so history cannot be orphaned, and an implementation that nulled the column to make deletion easy is red here (spec 8.10, 4.5)',
    ).toBe(doomed.id)
  })

  test('AC-250: a live creator in the same folder is untouched by it', async () => {
    const { keeper, folderId, byKeeperId } = await stage()
    const seen = await creatorEverywhere(keeper, folderId, byKeeperId)
    expect(
      seen,
      'step 4 removed the departed account\'s membership, so a projection reaching the creator through folder_members nulls this row too and is indistinguishable from correct on a fixture the deleted account wrote alone (spec 8.10 step 4, 4.1)',
    ).toEqual({
      folderRead: seen.folderRead,
      viewBody: seen.folderRead,
      detail: seen.folderRead,
    })
    expect(
      seen.folderRead,
      'and it is the surviving author, still named (spec 4.5)',
    ).toMatchObject({ id: keeper.id })
  })
})
