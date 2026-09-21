/*
AC-568: an authorized current member can read and reconstruct any prior
revision, and restoring old content writes a **new** revision rather than
touching the old one.

Issue #230 required proofs 11 and 12. Product authority: #209 R10 "Prior
versions".

## The two proofs are the same sentence read forwards and backwards

R10: "A later revision may restore old content by writing it again as a new
current revision. Never rewrite/delete the historical revision." Proof 11 is
that the old content is *there* to restore; proof 12 is that restoring it
leaves the old entry alone. A history that could be rewritten would satisfy
proof 11 on the day it was read and be worthless afterwards.

## Reconstruction, and what "reconstruct" is taken to mean

Each revision carries a whole content snapshot rather than a diff, so
reconstruction is reading the entry. The criterion therefore checks the strong
thing available: the content of revision *n* read out of history is
byte-identical to what the current document held immediately after revision *n*
was committed, for every *n* in a run of four. An implementation storing only
the latest snapshot and back-filling the rest would pass a one-revision case
and fail this.

## The restore case, and why the revision numbers matter

Restoring revision 1's text produces revision 4, not revision 1 again and not a
mutation of revision 1. The record then holds two entries with identical content
and different numbers, actors and times, which is the honest description of what
happened: somebody put the old words back, and both events are true.

Spec: 7.4; #209 R10.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { sharedFolder } from '../support/folder-access-harness.js'
import { Cast, expectStatus } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import {
  commitOk,
  paragraph,
  readResponsibilityHistory,
  recordOf,
  revisionsOf,
} from '../support/responsibility-harness.js'
import type { ResponsibilityHistoryEntry } from '../../src/shared/responsibility.js'
import type { ResponsibilityDocument } from '../../src/shared/responsibility.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'deputy', 'reader', 'subject'], 'ac568')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

interface Stage {
  owner: Actor
  deputy: Actor
  reader: Actor
  subject: Actor
  folderId: string
}

async function stage(name: string): Promise<Stage> {
  const [owner, deputy, reader, subject] = (await cast.of(app)) as [
    Actor,
    Actor,
    Actor,
    Actor,
  ]
  const folderId = await sharedFolder(app, owner, name, [
    [deputy, 'full_control'],
    [reader, 'can_view'],
    [subject, 'assigned_work'],
  ])
  return { owner, deputy, reader, subject, folderId }
}

const SCOPES: ResponsibilityDocument[] = [
  paragraph('Opens the yard'),
  paragraph('Opens the yard and signs off the gate log'),
  paragraph('Signs off the gate log only'),
]

describe('AC-568 prior revisions are readable and never rewritten', () => {
  test('AC-568 proof 11: every prior revision reconstructs exactly what the document held at the time', async () => {
    const { owner, reader, subject, folderId } = await stage('AC-568 read')

    const snapshots: ResponsibilityDocument[] = []
    for (const scope of SCOPES) {
      const answer = await commitOk(owner, folderId, subject.id, scope)
      snapshots.push(answer.responsibility.content as ResponsibilityDocument)
    }

    const response = await readResponsibilityHistory(
      reader,
      folderId,
      subject.id,
    )
    expectStatus(
      response,
      200,
      'R10 "Prior versions": an authorized current member inspects prior revisions under ordinary Folder visibility -- Can view is a current member',
    )
    const body = response.json() as {
      entries: ResponsibilityHistoryEntry[]
      truncated: boolean
    }
    const revisions = body.entries.filter(
      (entry) => entry.revision_no !== null,
    )
    /* **Newest first**, ruled on #230 —
       https://github.com/zhssnym/dana/issues/230#issuecomment-5754627068,
       Ruling 3, 2026-09-21 — after the adversarial review found the opposite
       order serving the oldest page of a capped record and saying nothing.
       This assertion is the order's pin at the route; AC-573 drives 10.3's
       cap and the flag, including the boundary at exactly the cap. */
    expect(
      revisions.map((entry) => entry.revision_no),
      'three commits, three revisions, newest first',
    ).toEqual([3, 2, 1])
    expect(
      body.truncated,
      'and nothing was cut, so the reader is told it has the record whole (10.3)',
    ).toBe(false)
    for (const [index, revision] of revisions.entries()) {
      const expected = snapshots[snapshots.length - 1 - index]
      expect(
        revision.content,
        `#230 proof 11: revision ${String(revisions.length - index)} reconstructs the document exactly as it stood when it was committed`,
      ).toEqual(expected)
    }
    expect(
      revisions.every((entry) => entry.actor.id === owner.id),
      'and each names who committed it',
    ).toBe(true)
  })

  test('AC-568 proof 12: restoring old content writes a new revision and leaves the old one untouched', async () => {
    const { owner, deputy, subject, folderId } = await stage('AC-568 restore')

    for (const scope of SCOPES) {
      await commitOk(owner, folderId, subject.id, scope)
    }
    const before = revisionsOf(await recordOf(app.db, folderId, subject.id))
    const firstEntry = before[0]
    expect(firstEntry, 'the revision being restored from').toBeDefined()

    // Somebody else puts the original text back.
    const restored = await commitOk(deputy, folderId, subject.id, SCOPES[0]!)
    expect(
      restored.committed,
      'R10: "a later revision may restore old content by writing it again as a new current revision"',
    ).toBe(true)
    expect(
      restored.responsibility.revision_no,
      'as revision 4, not as revision 1 a second time',
    ).toBe(4)

    const after = revisionsOf(await recordOf(app.db, folderId, subject.id))
    expect(
      after.map((entry) => entry.revision_no),
      'four entries now, the first three exactly as they were',
    ).toEqual([1, 2, 3, 4])
    expect(
      {
        id: after[0]?.id,
        content: after[0]?.content,
        hash: after[0]?.content_hash,
        actor: after[0]?.actor_id,
        at: after[0]?.effective_at,
      },
      'R10: "Never rewrite/delete the historical revision". Restoring its content did not touch it',
      ).toEqual({
      id: firstEntry?.id,
      content: firstEntry?.content,
      hash: firstEntry?.content_hash,
      actor: firstEntry?.actor_id,
      at: firstEntry?.effective_at,
    })
    expect(
      after[3]?.content_hash,
      'and the new entry carries the same content as the one it restored, which is the honest record of what happened',
    ).toBe(firstEntry?.content_hash)
    expect(
      after[3]?.actor_id,
      'committed by whoever did the restoring, not by whoever wrote it originally',
    ).toBe(deputy.id)
  })

  test('AC-568 proof 12: no endpoint on this surface deletes or edits a revision', async () => {
    const { owner, subject, folderId } = await stage('AC-568 no delete')
    await commitOk(owner, folderId, subject.id, SCOPES[0]!)
    const entry = revisionsOf(await recordOf(app.db, folderId, subject.id))[0]

    /*
    #230: "Do not add an ordinary endpoint to delete an old Responsibility
    revision individually." An absence is hard to assert, so this drives the
    two shapes somebody would reach for -- a DELETE on the history collection
    and a DELETE addressed at one entry -- and requires that neither is
    mounted. 404 from the SPA fallback or from an unmatched route is the
    answer; what must not happen is a 200 and a missing row.
    */
    const collection = await owner.browser.json(
      `/folders/${folderId}/members/${subject.id}/responsibility/history`,
      'DELETE',
    )
    const single = await owner.browser.json(
      `/folders/${folderId}/members/${subject.id}/responsibility/history/${String(entry?.id)}`,
      'DELETE',
    )
    expect(
      [collection.status, single.status].every((status) => status === 404),
      'neither shape is mounted, so an old revision has no ordinary way to be deleted',
    ).toBe(true)
    expect(
      revisionsOf(await recordOf(app.db, folderId, subject.id)).length,
      'and the revision is still there',
    ).toBe(1)
  })
})
