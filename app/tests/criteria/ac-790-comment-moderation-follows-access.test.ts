/*
AC-790: removing somebody else's comment follows Access and not custody, on
the screen and on the wire alike.

Issue #268. Product authority: **#228's Full-control list**, whose stated
canonical authority is accepted #209 R8A and R10B — "administer members" is
Full control's and moderating another member's comment is named inside it —
folded into frozen 7.14 by that section's dated amendment of 2026-09-20, which
extends Hassan's rulings of the same date on #228
(https://github.com/zhssnym/dana/issues/228#issuecomment-5751449643 and
https://github.com/zhssnym/dana/issues/228#issuecomment-5750892771).

## Why this criterion exists, and why it drives two things

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

**The second client step, `deletable = mine || moderates` in `lib/thread.ts`,
is driven by `src/client/lib/thread.test.ts` beside that file and carries this
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
import { forcePreset, sharedFolder } from '../support/folder-access-harness.js'
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
