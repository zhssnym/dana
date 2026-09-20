/*
AC-790: removing what somebody else made follows Access and not custody, on
the screen and on the wire alike -- a comment, and the two permanent deletes
that had the same defect.

Issue #268. Product authority: **#228's Full-control list**, whose stated
canonical authority is accepted #209 R8A and R10B — "administer members" is
Full control's and moderating another member's comment is named inside it —
folded into frozen 7.14 by that section's dated amendment of 2026-09-20, which
extends Hassan's rulings of the same date on #228
(https://github.com/zhssnym/dana/issues/228#issuecomment-5751449643 and
https://github.com/zhssnym/dana/issues/228#issuecomment-5750892771).

## Why this criterion exists, and why it drives both sides

The route has resolved this correctly since R8A landed: `DELETE /comments/:id`
asks `comment.mutate.own` or `comment.moderate`. **Both conversation surfaces
went on offering Delete on `is_owner`**, which had been the rule before R8A
and was nobody's rule after it. So the defect was a *disagreement* between two
halves of one decision, and a criterion that drove only one of them would have
been green on the day it was written and green on the day it broke.

Hence both arms of each direction, in the same case:

- a **Full-control administrator who owns nothing** is offered Delete on
  another member's comment, and the server honours it;
- a **demoted owner** — `folders.owner_id` still theirs, Access lowered to Can
  comment — is offered nothing, and the server answers 403.

The screen's half is driven through `folderGates`, which is the one place a
folder's surfaces ask what they may offer and the whole of the path between
`my_access` and the decision. Nothing here renders — `vitest.config.ts` is
`environment: 'node'` for the whole suite — and nothing here needs to: the
decision was moved out of the JSX on purpose, and a surface that stops
spreading these answers over its handlers is the browser leg's to catch.

**The second client step is `lib/thread.ts`, where each per-folder bar is
multiplied by the per-comment fact -- `deletable = (mine && mutateOwnComment)
|| moderate`, and `editable`, `likeable` and `replyable` beside it. It is
driven by `src/client/lib/thread.test.ts` beside that file, which carries this
number in its assertions.** It is not here for a mechanical reason worth
stating rather than working around: `tsconfig.server.json` compiles every
`.ts` under `tests/` with `lib: ["es2023"]` and no jsx, and `lib/thread.ts`
reaches the DOM and a `.tsx` through `api/queries.js`, so importing it here
fails the typecheck for every file in this directory. The tsconfig pair says
in terms that the extension is the rule — a test under `tests/` that wants the
DOM is `.tsx` — and a `.tsx` cannot hold the half of this criterion that needs
a database. So the criterion is split by what each half can compile against
and not by what it proves, and both halves run under the one number.

The server's half is driven as a real request against a real database, and it
**reads the row back** rather than trusting the status: a 204 over a row still
present and a 403 over a row already gone are both failures this criterion is
meant to see.

## The Trash surface, folded in rather than filed (2026-09-20)

`lib/trash.ts` had the same defect on one more surface and it is the same
issue's to carry. `purgeable` was `is_owner` for both kinds, which was RFC
0005 change control item 38's rule and had been superseded by R8A. **One
boolean off one field could not have been right whatever field it read**,
because the two acts are two rules: `task.destroy` is Full control with
ownership **ignored**, and `folder.destroy` is Full control **and** the owner
together (governing R5). So the screen was wrong in three ways at once -- a
Full-control member who owned nothing was offered no permanent delete on a
trashed task the server would have destroyed for them, and a demoted owner was
offered both and refused 403 by each.

`FolderGates` gains `destroyTask` and `destroyFolder`, and 7.13's rows gain
`my_access` beside `is_owner`, because neither fact answers alone and a
trashed folder is not in `GET /folders` to read the preset from. The cases
below drive the same two arms over both, and `screens/trash-screen.tsx` needed
no change at all: it read `purgeable` before and reads it now.

`lib/trash.ts`'s own gate -- `mayPurge`, which is the whole of what
`purgeable` is and which `useTrash` calls once per row -- is driven by
`src/client/lib/trash.test.ts`, beside the module and for the same compile
reason as `lib/thread.ts` above: that file reaches the DOM through
`api/queries.js` and cannot be imported from this directory. **What is driven
nowhere is `useTrash`'s own mapping**, the `.map` that turns a 7.13 row into a
`TrashItem`: it is a hook over TanStack Query and mounting one needs a DOM.
So the decision is proved and the shaping around it is not, which is the
honest statement rather than a gap being described as covered.

And a third file, for the one part of this criterion that is not a decision in
a pure function at all: `src/client/components/comments.test.tsx` renders
`CommentsThread` under jsdom and reads the composer, because what
`comment.create` buys a Can-view member is a *disabled field carrying a
particular sentence* and no pure function returns one. It is the only rendered
evidence any half of this criterion has.

Spec: 7.14 as amended 2026-09-20, 10.2; #228's Full-control list and its
authorship rule. AC-205 and AC-518 are the neighbours — the first asserts an
owner who still holds Full control may moderate, which is true and is now a
consequence rather than the rule; the second asserts that an author who loses
standing loses their own delete.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { sql } from 'drizzle-orm'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import {
  forcePreset,
  sharedFolder,
  taskIn,
} from '../support/folder-access-harness.js'
import { Cast, expectStatus } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import { rows } from '../support/helpers.js'
import { FOLDER_ACCESS_PRESETS } from '../../src/shared/folder-access.js'
import type { FolderAccessPreset } from '../../src/shared/folder-access.js'
import { folderGates } from '../../src/client/lib/folder-authority.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'administrator', 'author'], 'ac790')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

/* ------------------------------------------------------------------ *
 * The screen's half
 * ------------------------------------------------------------------ */

/** A viewer's facts as `lib/folder-authority.ts` takes them. */
function facts(access: FolderAccessPreset, isOwner: boolean) {
  return { access, isOwner, isDefault: false }
}

describe('AC-790 what a conversation surface offers', () => {
  /* #228's Full-control list: moderating another member's words is member
     administration. The whole ladder is asserted rather than the two named
     rows alone, because "Full control and above" and "Can edit and above" are
     the same answer on the two rows the defect was found at. */
  const EXPECTED: Record<FolderAccessPreset, boolean> = {
    full_control: true,
    can_edit: false,
    can_contribute: false,
    assigned_work: false,
    can_comment: false,
    can_view: false,
  }

  for (const preset of FOLDER_ACCESS_PRESETS) {
    test(`AC-790: ${preset}, owning nothing, moderates: ${String(EXPECTED[preset])}`, () => {
      expect(folderGates(facts(preset, false)).moderate).toBe(EXPECTED[preset])
    })
  }

  test('AC-790: ownership confers nothing — an owner at each preset answers the same', () => {
    for (const preset of FOLDER_ACCESS_PRESETS) {
      expect(
        folderGates(facts(preset, true)).moderate,
        `#228: moderation is Full control's and custody is not Access (${preset})`,
      ).toBe(EXPECTED[preset])
    }
  })

  test('AC-790: the same two rows over the two permanent deletes', () => {
    const administrator = folderGates(facts('full_control', false))
    expect(
      administrator.destroyTask,
      "#228's Full-control list: destroying a trashed Task is administrative and ownership is ignored",
    ).toBe(true)
    expect(
      administrator.destroyFolder,
      'governing R5: destroying the whole Folder still needs custody, so the two are not one gate',
    ).toBe(false)

    const demoted = folderGates(facts('can_comment', true))
    expect(demoted.destroyTask, 'a demoted owner destroys no trashed task').toBe(false)
    expect(demoted.destroyFolder, 'nor the folder they still own').toBe(false)
  })

  test('AC-790: the author’s own half is standing too, and Can view loses it', () => {
    /* #228's authorship rule: authorship is provenance rather than standing
       authority. Both surfaces drew Edit and Delete on `mine` alone, so a
       member reduced to Can view was offered both on every comment they had
       ever left and answered 403 by the route (AC-518). The gate answers the
       standing half; `lib/thread.ts` multiplies it by `mine`. */
    expect(
      folderGates(facts('can_comment', false)).mutateOwnComment,
      'Can comment keeps their own words changeable',
    ).toBe(true)
    expect(
      folderGates(facts('can_view', false)).mutateOwnComment,
      'Can view keeps the words and loses the power to change them',
    ).toBe(false)
    expect(
      folderGates(facts('can_view', true)).mutateOwnComment,
      'and owning the folder confers none of it back',
    ).toBe(false)
    expect(
      folderGates(facts('can_view', false)).likeComment,
      "#228's Can-comment list: Can view leaves no mark on a thread",
    ).toBe(false)
  })

  test('AC-790: writing into the thread at all is Can comment’s, Reply included', () => {
    /* `comment.create`, and Reply is the same act as a first comment. The
       owner's ruling of 2026-09-20 splits what the two surfaces do with the
       answer: Reply is **hidden**, being one of a row's own controls, and the
       composer is **rendered and disabled** carrying a sentence, because it
       carries the fact that the conversation takes comments and hiding it
       would hide the fact with the act. `components/comments.test.tsx` is
       where that half is driven. */
    for (const preset of FOLDER_ACCESS_PRESETS) {
      expect(folderGates(facts(preset, false)).createComment, preset).toBe(
        preset !== 'can_view',
      )
    }
    expect(
      folderGates(facts('can_view', true)).createComment,
      'and owning the folder does not make a reader a participant',
    ).toBe(false)
  })

  test('AC-790: the two rows the defect was found at, named', () => {
    expect(
      folderGates(facts('full_control', false)).moderate,
      'a Full-control administrator who owns nothing is offered Delete on another member\u2019s comment',
    ).toBe(true)
    expect(
      folderGates(facts('can_comment', true)).moderate,
      'an owner whose Access was lowered to Can comment is offered nothing',
    ).toBe(false)
  })
})

/* ------------------------------------------------------------------ *
 * The route's half
 * ------------------------------------------------------------------ */

interface Stage {
  owner: Actor
  /** full_control, and owns nothing */
  administrator: Actor
  /** the member whose words are the target */
  author: Actor
  folderId: string
}

async function stage(name: string): Promise<Stage> {
  const [owner, administrator, author] = (await cast.of(app)) as [
    Actor,
    Actor,
    Actor,
  ]
  const folderId = await sharedFolder(app, owner, name, [
    [administrator, 'full_control'],
    [author, 'can_edit'],
  ])
  return { owner, administrator, author, folderId }
}

async function saidBy(actor: Actor, folderId: string, body: string): Promise<string> {
  const posted = await actor.browser.json(`/folders/${folderId}/comments`, 'POST', {
    body,
  })
  expectStatus(posted, 201, 'a member comments (spec 7.14)')
  return String((posted.json() as { id: string }).id)
}

/** Whether the row is still there, read from the table rather than from any
 * projection: a refusal that answered 403 and deleted anyway is the failure
 * this criterion is looking for. */
async function stillThere(commentId: string): Promise<boolean> {
  const found = await rows(
    app.db,
    sql`SELECT id FROM comments WHERE id = ${commentId}::uuid`,
  )
  return found.length === 1
}

describe('AC-790 what DELETE /comments/:id honours', () => {
  test('AC-790: a Full-control member who owns nothing moderates, and the row is gone', async () => {
    const { administrator, author, folderId } = await stage('ac790 moderation')
    const target = await saidBy(author, folderId, 'ac790 words to be moderated')

    const removed = await administrator.browser.api(`/comments/${target}`, {
      method: 'DELETE',
    })
    expectStatus(
      removed,
      204,
      "#228's Full-control list: removing another member's comment is member administration, and custody is not required for it",
    )
    expect(
      await stillThere(target),
      'the comment is actually gone, not merely answered 204',
    ).toBe(false)
  })

  test('AC-790: an owner demoted below Full control is refused, and the row is intact', async () => {
    const { owner, author, folderId } = await stage('ac790 demotion')
    const target = await saidBy(author, folderId, 'ac790 words a demoted owner keeps')

    /* Straight into the column, and `folder-access-harness.ts` says at its
       definition why this one fixture cannot go through the API: nobody may
       demote the owner but the owner, and the continuity invariant refuses
       the last Full-control member's demotion. Custody is untouched —
       `folders.owner_id` is still theirs, which is the whole point of the
       case. */
    await forcePreset(app.db, folderId, owner.id, 'can_comment')

    const refused = await owner.browser.api(`/comments/${target}`, {
      method: 'DELETE',
    })
    expectStatus(
      refused,
      403,
      'custody is not Access (#228, governing R5): an owner below Full control does not moderate',
    )
    expect(
      await stillThere(target),
      'the words survive the refusal',
    ).toBe(true)

    const ownership = await rows(
      app.db,
      sql`SELECT owner_id FROM folders WHERE id = ${folderId}::uuid`,
    )
    expect(
      String(ownership[0]?.owner_id),
      'the refusal is about Access and this person is still the owner',
    ).toBe(owner.id)
  })
})

/* ------------------------------------------------------------------ *
 * The route's half, Trash: the same two people, the same two answers,
 * and two acts that are not one rule
 * ------------------------------------------------------------------ */

/** Whether a row is still in its own table. Read from the table rather than
 * from `GET /trash`, for the reason `stillThere` above gives. */
async function rowSurvives(table: 'tasks' | 'folders', id: string): Promise<boolean> {
  const found = await rows(
    app.db,
    table === 'tasks'
      ? sql`SELECT id FROM tasks WHERE id = ${id}::uuid`
      : sql`SELECT id FROM folders WHERE id = ${id}::uuid`,
  )
  return found.length === 1
}

/** A trashed task in a fresh shared folder, and the folder it sits in. */
async function trashedTask(name: string): Promise<Stage & { taskId: string }> {
  const staged = await stage(name)
  const taskId = await taskIn(staged.owner, staged.folderId, `${name} doomed`, null)
  expectStatus(
    await staged.owner.browser.api(`/tasks/${taskId}`, { method: 'DELETE' }),
    204,
    'DELETE /tasks/:id trashes it (spec 7.13)',
  )
  return { ...staged, taskId }
}

/** A trashed folder, its roster still attached so the permanent delete has
 * somebody to refuse. */
async function trashedFolder(name: string): Promise<Stage> {
  const staged = await stage(name)
  expectStatus(
    await staged.owner.browser.api(`/folders/${staged.folderId}`, {
      method: 'DELETE',
    }),
    200,
    'DELETE /folders/:id trashes it (spec 7.4, 7.13)',
  )
  return staged
}

describe('AC-790 what the two permanent deletes honour', () => {
  test('AC-790: a Full-control member who owns nothing destroys a trashed task, and the row is gone', async () => {
    const { administrator, taskId } = await trashedTask('ac790 purge task')

    expectStatus(
      await administrator.browser.api(`/trash/tasks/${taskId}`, {
        method: 'DELETE',
      }),
      204,
      "#228's Full-control list: permanently deleting a Task from Trash is an irreversible administrative act, and ownership is ignored by it",
    )
    expect(
      await rowSurvives('tasks', taskId),
      'the task is actually gone, not merely answered 204',
    ).toBe(false)
  })

  test('AC-790: the same person is refused the folder, and the row is intact', async () => {
    const { administrator, folderId } = await trashedFolder('ac790 purge folder')

    expectStatus(
      await administrator.browser.api(`/trash/folders/${folderId}`, {
        method: 'DELETE',
      }),
      403,
      'governing R5: permanent destruction of the whole Folder needs custody as well as Full control, so the two acts are not one rule',
    )
    expect(
      await rowSurvives('folders', folderId),
      'the folder survives the refusal',
    ).toBe(true)
  })

  test('AC-790: an owner demoted to Can comment is refused both, and both rows are intact', async () => {
    const withTask = await trashedTask('ac790 demoted purge task')
    await forcePreset(app.db, withTask.folderId, withTask.owner.id, 'can_comment')
    expectStatus(
      await withTask.owner.browser.api(`/trash/tasks/${withTask.taskId}`, {
        method: 'DELETE',
      }),
      403,
      'custody is not Access: an owner below Full control destroys no trashed Task',
    )
    expect(await rowSurvives('tasks', withTask.taskId)).toBe(true)

    const withFolder = await trashedFolder('ac790 demoted purge folder')
    await forcePreset(app.db, withFolder.folderId, withFolder.owner.id, 'can_comment')
    expectStatus(
      await withFolder.owner.browser.api(`/trash/folders/${withFolder.folderId}`, {
        method: 'DELETE',
      }),
      403,
      'nor the Folder they still own: Full control is required beside custody, not instead of it',
    )
    expect(await rowSurvives('folders', withFolder.folderId)).toBe(true)
  })

  test('AC-790: GET /trash answers each reader their own my_access on the same rows', async () => {
    const { owner, administrator, author, taskId } = await trashedTask(
      'ac790 trash projection',
    )

    /* The same row read by three people at two presets. `my_access` is the
       *viewer's* own and never the owner's and never the folder's, which is
       the whole of what the field means and the thing a single shared value
       would get wrong while passing every other assertion here. */
    for (const [who, actor, expected] of [
      ['the owner', owner, 'full_control'],
      ['the Full-control administrator', administrator, 'full_control'],
      ['the Can-edit member', author, 'can_edit'],
    ] as const) {
      const read = await actor.browser.api('/trash')
      expectStatus(read, 200, `${who} reads Trash (spec 7.13)`)
      const body = read.json() as {
        tasks: { id: string; my_access: string; is_owner: boolean }[]
      }
      const row = body.tasks.find((entry) => entry.id === taskId)
      expect(row, `${who} sees the trashed task`).toBeDefined()
      expect(
        row?.my_access,
        `7.13 as amended 2026-09-20: my_access is ${who}'s own preset`,
      ).toBe(expected)
      expect(row?.is_owner, `and is_owner stays custody for ${who}`).toBe(
        actor.id === owner.id,
      )
    }
  })
})
