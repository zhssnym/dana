/*
AC-428: given the same six rows, when one person resolves each by exact Dana
URL and searches for all of them by name, then the two doors agree row for
row; and given any number of either operation, then no membership, no
Authority, no event and no dependency has been created by having referenced
anything.

**Why the agreement is a criterion of its own.** The issue makes it a
requirement in its own right, and the reason is that the two doors are written
separately: `resolveReference` calls the three gates directly, and the search
queries repeat those gates' `FROM` clauses inline. Two spellings of one rule
is exactly the arrangement that drifts, and it drifts silently — a search that
quietly matched a row the resolver refuses would leak the very metadata the
resolver exists to withhold, the label, straight into a picker list. The table
below is over the same six ids in both directions, so a disagreement in either
direction fails.

**Why "grants nothing" is worth asserting rather than arguing.** Nothing in
`domain/references.ts` writes, and that is visible by reading it today. The
criterion is for tomorrow: a resolver that "helpfully" recorded a view, joined
the caller to the folder it resolved, or wrote a reference row would be an
ordinary-looking change, and every other test in this suite would stay green.
The counts here are over the three tables where such a change would land, and
the last case re-asks the refusal question afterwards, because a grant that
left no row but opened a door is the same failure.

Spec: 5.3, 5.4, 10.2, 4.13. Issue #223.
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast, countRows, expectStatus } from '../support/folders-harness.js'
import {
  NEEDLE,
  REFERENCE_CAST,
  REFERENCE_PREFIX,
  idsOf,
  resolveReference,
  searchReferences,
  stageReferences,
  summariesOf,
} from '../support/references-harness.js'
import type { ReferenceStage } from '../support/references-harness.js'

let app: AuthTestApp
const cast = new Cast([...REFERENCE_CAST], REFERENCE_PREFIX)

let staged: ReferenceStage | undefined
async function stage(): Promise<ReferenceStage> {
  staged ??= await stageReferences(app, cast)
  return staged
}

/** The six rows both doors are asked about, and whether the viewer may have
 * each one. Three are theirs; three are the stranger's and match the same
 * needle, so a door that returned one of them is leaking rather than
 * merely being generous. */
function targets(
  fx: ReferenceStage,
): readonly { kind: string; id: string; accessible: boolean; what: string }[] {
  return [
    { kind: 'task', id: fx.contextTaskId, accessible: true, what: 'own task' },
    {
      kind: 'folder',
      id: fx.contextFolderId,
      accessible: true,
      what: 'own folder',
    },
    { kind: 'shelf', id: fx.shelfId, accessible: true, what: 'own shelf' },
    {
      kind: 'task',
      id: fx.strangerTaskId,
      accessible: false,
      what: "another person's task",
    },
    {
      kind: 'folder',
      id: fx.strangerFolderId,
      accessible: false,
      what: "another person's folder",
    },
    {
      kind: 'shelf',
      id: fx.strangerShelfId,
      accessible: false,
      what: "another person's shelf",
    },
  ]
}

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-428 the paste door and the typing door tell one story', () => {
  test('AC-428: exact-URL resolution and typed search agree on all six rows', async () => {
    const fx = await stage()
    const found = await searchReferences(fx.viewer, NEEDLE)
    expectStatus(found, 200, 'the typed search answers')
    const searchIds = idsOf(summariesOf(found, 'the typed search'))

    const disagreements: string[] = []
    for (const target of targets(fx)) {
      const answer = await resolveReference(fx.viewer, target.kind, target.id)
      const resolved = answer.status === 200
      const searched = searchIds.includes(target.id)
      if (resolved !== searched || resolved !== target.accessible) {
        disagreements.push(
          `${target.what}: resolve answered ${String(answer.status)}, search ${searched ? 'returned' : 'withheld'} it, and the viewer ${target.accessible ? 'may' : 'may not'} have it`,
        )
      }
    }
    expect(
      disagreements,
      'a paste and a keystroke must reach the same verdict about the same row, in both directions (issue #223)',
    ).toEqual([])
  })

  test('AC-428: no reference operation creates a membership, an event or a task', async () => {
    const fx = await stage()
    const members = () =>
      countRows(app.db, sql`SELECT count(*)::int AS n FROM folder_members`)
    const events = () => countRows(app.db, sql`SELECT count(*)::int AS n FROM events`)
    const tasks = () => countRows(app.db, sql`SELECT count(*)::int AS n FROM tasks`)

    const before = [await members(), await events(), await tasks()]

    for (const target of targets(fx)) {
      await resolveReference(fx.viewer, target.kind, target.id)
      await resolveReference(fx.stranger, target.kind, target.id)
    }
    await searchReferences(fx.viewer, NEEDLE)
    await searchReferences(fx.viewer, NEEDLE, fx.contextFolderId)
    await searchReferences(fx.stranger, NEEDLE)

    expect(
      [await members(), await events(), await tasks()],
      'a Dana Link is a reference: resolving one joins nobody to anything (5.3), records no act (4.13) and stores no relationship row (issue #223)',
    ).toEqual(before)
  })

  test('AC-428: and having referenced it, the stranger is still refused', async () => {
    const fx = await stage()
    for (const target of targets(fx).filter((row) => row.accessible)) {
      const answer = await resolveReference(
        fx.stranger,
        target.kind,
        target.id,
      )
      expectStatus(
        answer,
        404,
        `resolving the viewer's ${target.what} repeatedly must not have opened it to the stranger: a grant that leaves no row is still a grant (spec 5.4, 10.2)`,
      )
    }
    const reads: readonly [string, string][] = [
      [`/tasks/${fx.contextTaskId}`, 'the task'],
      [`/folders/${fx.contextFolderId}`, 'the folder'],
      [`/shelves/${fx.shelfId}`, 'the shelf'],
    ]
    for (const [path, what] of reads) {
      const answer = await fx.stranger.browser.json(path, 'GET')
      expectStatus(
        answer,
        404,
        `${what}'s own endpoint still refuses the stranger, which is the check that the gate rather than this feature is what decides`,
      )
    }
  })
})
