/*
AC-015: given a member below Full control, Can edit included, when moving the
folder to Trash, then 403 and nothing is deleted; given a member holding Full
control who is not the owner, then it proceeds; given a non-member, then 404
rather than 403.

## What this criterion said, and what moved it

**It read:** "given a non-owner member, when deleting the folder, then 403."
That made trashing the folder an act of **custody** -- the owner's, and nobody
else's -- which is the ownership-as-authority proxy issue #228 exists to
remove.

**It now reads** what the header above says: the act is **Full control's**.
Custody keeps what only custody can do -- restoring a trashed folder even from
a lowered Access, transferring ownership, and permanent destruction, which
needs the owner *and* current Full control together.

**The record that authorises it is Hassan's ruling of 2026-09-20**,
https://github.com/zhssnym/dana/issues/228#issuecomment-5750892771, **and not
accepted R8A, which does not settle this and the ruling says so rather than
pretending otherwise.** R8A gives Can edit "plan/change all shared Folder
work" and Full control "administer members, Access, Responsibilities and all
shared Folder work", and trashing the whole folder can honestly be read into
either. The ruling took the narrower reading on one ground, stated here so the
next reader inherits the argument rather than the conclusion:

> **the recoverable direction of a wrong call is the restrictive one.**
> Widening later is a decision somebody makes. Narrowing later takes away
> something people already had.

(#228's own Full-control list, which is the product issue's text rather than
an accepted #209 record, independently says "trash/restore Folder
administratively". It corroborates the ruling and is not its authority.)

**Nothing in the suite moved when the rule did**, which was checked rather
than assumed: the actor this criterion refuses holds **Can edit**, below Full
control under the old reading and the new one alike. The ruling's own summary
says AC-015's actor is the owner; it is not, and the conclusion it drew from
that is right for a different reason.

## What the file drives

The refusal, at Can edit, with the folder and its contents whole afterwards --
a delete that fails after cascading is worse than one that succeeds. The
grant, at Full control without ownership, which is the half of the new rule
nothing else in this file would see. And 7.0's leak rule around both: 403 to a
member who can see the folder, 404 to a stranger who cannot.

Spec: 5.4, 7.0, 7.4, 10.2; Hassan's ruling of 2026-09-20 on issue #228.
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import {
  Cast,
  addMemberOk,
  connect,
  countRows,
  createFolder,
  expectFolderInvariants,
  expectStatus,
  folderInList,
  seedTask,
} from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'editor', 'deputy', 'stranger'])

interface Stage {
  owner: Actor
  /** Can edit: every piece of the folder's Work and not the folder itself. */
  editor: Actor
  /** Full control, and owns nothing. */
  deputy: Actor
  stranger: Actor
  folderId: string
  taskId: string
}
let staged: Stage | undefined

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const [owner, editor, deputy, stranger] = await cast.of(app)
    if (
      owner === undefined ||
      editor === undefined ||
      deputy === undefined ||
      stranger === undefined
    ) {
      throw new Error('cast must produce four actors')
    }
    await connect(app.db, owner.id, editor.id)
    await connect(app.db, owner.id, deputy.id)
    const folderId = await createFolder(owner, 'p2 ac015 shared')
    await addMemberOk(owner, folderId, editor.id, 'can_edit')
    const taskId = await seedTask(app.db, {
      folderId,
      createdBy: owner.id,
      assigneeId: editor.id,
    })
    staged = { owner, editor, deputy, stranger, folderId, taskId }
  }
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

describe("AC-015: the folder's own trip to Trash is Full control's", () => {
  test('AC-015: a Can-edit member moving the folder to Trash answers 403', async () => {
    const { editor, folderId } = await stage()
    const response = await editor.browser.api(`/folders/${folderId}`, {
      method: 'DELETE',
    })
    expectStatus(
      response,
      403,
      "Hassan's ruling of 2026-09-20 on #228: trashing the folder is Full control's, and Can edit is broad authority over the contents rather than over the container (spec 7.4)",
    )
  })

  test('AC-015: the refusal deleted nothing', async () => {
    const { owner, editor, folderId, taskId } = await stage()
    for (const viewer of [owner, editor]) {
      expect(
        await folderInList(viewer, folderId),
        'the folder must survive the refused delete for every member (spec 5.4)',
      ).toBeDefined()
    }
    expect(
      await countRows(
        app.db,
        sql`SELECT count(*)::int AS n FROM tasks WHERE id = ${taskId}`,
      ),
      'its tasks must survive too (spec 5.4)',
    ).toBe(1)
    expect(
      await countRows(
        app.db,
        sql`SELECT count(*)::int AS n FROM folder_members WHERE folder_id = ${folderId}`,
      ),
      'both memberships must survive (spec 5.4)',
    ).toBe(2)
  })

  test('AC-015: a Full-control member who is not the owner moves it to Trash', async () => {
    /* The half of the rewritten rule that is a grant, and the half nothing
       else in this file would see: under the superseded owner-only reading
       this actor answered 403. Its own folder, because it succeeds. */
    const { owner, deputy } = await stage()
    const folderId = await createFolder(owner, 'p2 ac015 administered')
    await addMemberOk(owner, folderId, deputy.id, 'full_control')

    const entry = await folderInList(deputy, folderId)
    expect(
      entry?.is_owner,
      'the actor must not be the owner, or this case proves the old rule',
    ).toBe(false)

    const response = await deputy.browser.api(`/folders/${folderId}`, {
      method: 'DELETE',
    })
    expectStatus(
      response,
      200,
      "Hassan's ruling of 2026-09-20 on #228: recoverable administrative deletion is Full control's and needs no custody (spec 7.4)",
    )
    expect(
      await folderInList(owner, folderId),
      'and the folder is gone from the owner list, trashed rather than destroyed (7.13)',
    ).toBeUndefined()
  })

  test('AC-015 adversarial: a stranger deleting reads 404, never 403', async () => {
    const { stranger, folderId } = await stage()
    const response = await stranger.browser.api(`/folders/${folderId}`, {
      method: 'DELETE',
    })
    expectStatus(
      response,
      404,
      'an inaccessible folder must read as nonexistent (spec 7.0, 10.2)',
    )
  })

  test('AC-015: invariants hold afterwards', async () => {
    const { owner, editor, deputy, stranger, folderId } = await stage()
    await expectFolderInvariants(
      app.db,
      [folderId],
      [owner.id, editor.id, deputy.id, stranger.id],
    )
  })
})
