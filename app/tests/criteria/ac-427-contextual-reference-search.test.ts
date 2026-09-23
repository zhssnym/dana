/*
AC-427: given a person typing into a picker, when the current Folder is
supplied as context, then that Folder's Tasks lead the results without
excluding the rest; the answer is capped rather than a dump of everything the
viewer can reach; and nothing the viewer cannot access appears under either
call.

**The `folder` parameter is proved by contrast, not by presence.** A request
field the server declares and never reads is accepted, dropped and answered
200 — the class hard stop 3 exists for, and the one that has already cost this
project four packages. So the fixture's two matching tasks are seeded with
different `updated_at` values: without a context the more recently touched one
leads, and with the context the older one does. Only a server that read the
parameter can produce both answers.

**"Never a flat dump" is asserted with rows, not with a reading of the code.**
Twenty-five further matching tasks are seeded before the last case, so a
resolver that answered everything accessible would answer at least
twenty-eight rows; `REFERENCE_SEARCH_LIMIT` is 20 and the cap is over every
kind together rather than per kind, which is what stops four kinds of ten from
being a hundred-row list wearing a limit.

Spec: 10.2, 10.3, 7.10's `q`. Issue #223.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { REFERENCE_SEARCH_LIMIT } from '../../src/shared/references.js'
import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast, expectStatus } from '../support/folders-harness.js'
import {
  NEEDLE,
  REFERENCE_CAST,
  REFERENCE_PREFIX,
  idsOf,
  searchReferences,
  stageReferences,
  summariesOf,
} from '../support/references-harness.js'
import type { ReferenceStage } from '../support/references-harness.js'
import { seedViewTask } from '../support/views-harness.js'

let app: AuthTestApp
const cast = new Cast([...REFERENCE_CAST], REFERENCE_PREFIX)

let staged: ReferenceStage | undefined
async function stage(): Promise<ReferenceStage> {
  staged ??= await stageReferences(app, cast)
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

describe('AC-427 the picker search is scoped, prioritised and capped', () => {
  test('AC-427: the context Folder leads without excluding the rest', async () => {
    const fx = await stage()

    const broad = await searchReferences(fx.viewer, NEEDLE)
    expectStatus(broad, 200, 'a typed search answers the viewer\'s matches')
    const broadIds = idsOf(summariesOf(broad, 'the broad search'))
    expect(
      broadIds.indexOf(fx.otherTaskId) < broadIds.indexOf(fx.contextTaskId),
      'with no context the task list is most-recently-touched first, which is what the next assertion is measured against',
    ).toBe(true)

    const scoped = await searchReferences(fx.viewer, NEEDLE, fx.contextFolderId)
    expectStatus(scoped, 200, 'the context folder is one the viewer is a member of')
    const scopedIds = idsOf(summariesOf(scoped, 'the scoped search'))
    expect(
      scopedIds[0],
      'the Task in the supplied Folder leads, which is the whole of what "contextual" buys the picker (issue #223)',
    ).toBe(fx.contextTaskId)
    expect(
      scopedIds,
      'and the rest is still there: context is a priority, not a filter, or a person could never reference a Task outside the Folder they are writing in',
    ).toContain(fx.otherTaskId)
  })

  test('AC-427: every supported kind the viewer can reach is offered', async () => {
    const fx = await stage()
    const answer = await searchReferences(fx.viewer, NEEDLE)
    const kinds = new Set(
      summariesOf(answer, 'the broad search').map((row) => row.kind),
    )
    expect(
      [...kinds].sort(),
      'the picker offers every currently supported reference kind that matches: #223\'s Task/Folder/Shelf plus #211\'s Purpose facet',
    ).toEqual(['facet', 'folder', 'shelf', 'task'])
  })

  test('AC-427: nothing the viewer cannot access appears, under either call', async () => {
    const fx = await stage()
    const calls = [
      await searchReferences(fx.viewer, NEEDLE),
      await searchReferences(fx.viewer, NEEDLE, fx.contextFolderId),
    ]
    for (const answer of calls) {
      const ids = idsOf(summariesOf(answer, 'a viewer search'))
      for (const hidden of [
        fx.strangerTaskId,
        fx.strangerFolderId,
        fx.strangerPurposeId,
        fx.strangerShelfId,
      ]) {
        expect(
          ids,
          'the stranger\'s rows match the same needle, so their absence is the scope rather than the fixture (spec 10.2)',
        ).not.toContain(hidden)
      }
      expect(
        answer.body,
        'and nothing of them reaches the wire under any other key either',
      ).not.toContain('private')
    }
  })

  test('AC-427: the stranger sees their own rows and none of the viewer\'s', async () => {
    const fx = await stage()
    const answer = await searchReferences(fx.stranger, NEEDLE)
    const ids = idsOf(summariesOf(answer, 'the stranger\'s search'))
    expect(
      ids,
      'the stranger\'s own task is findable, which is what stops the case above from passing against a search that finds nothing at all',
    ).toContain(fx.strangerTaskId)
    expect(ids, 'the stranger can find their own renamed Purpose').toContain(
      fx.strangerPurposeId,
    )
    for (const hidden of [
      fx.contextTaskId,
      fx.otherTaskId,
      fx.contextPurposeId,
      fx.shelfId,
    ]) {
      expect(ids).not.toContain(hidden)
    }
  })

  test('AC-427: the answer is capped rather than a dump of every accessible Task', async () => {
    const fx = await stage()
    for (let index = 0; index < 25; index += 1) {
      await seedViewTask(app.db, {
        folderId: fx.contextFolderId,
        createdBy: fx.viewer.id,
        assigneeId: fx.viewer.id,
        title: `r223 ${NEEDLE} bulk ${String(index)}`,
      })
    }
    const answer = await searchReferences(fx.viewer, NEEDLE, fx.contextFolderId)
    const results = summariesOf(answer, 'the search over a crowded folder')
    expect(
      results.length,
      `28 rows now match and a picker list is ${String(REFERENCE_SEARCH_LIMIT)}: a search that answered all of them would be the flat dump the issue refuses`,
    ).toBeLessThanOrEqual(REFERENCE_SEARCH_LIMIT)
    expect(
      results.length,
      'and it is not empty either, which is the other way a cap can be wrong',
    ).toBeGreaterThan(0)
  })
})
