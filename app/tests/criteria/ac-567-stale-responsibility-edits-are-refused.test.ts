/*
AC-567: a stale edit cannot silently overwrite another person's revision, and
two concurrent commits do not both claim the same base.

Issue #230 required proof 10. Product authority: #209 R10 "stale concurrent
edits must resolve using the same optimistic-concurrency discipline as Dana's
current page-document model rather than silently overwriting another person's
revision".

## The discipline being reused, said once

The Folder page transaction refuses a body whose `base_revision` does not match
the document's current content hash, and answers `stale`. This surface sends
the same token, computed by the same `documentHash` over a canonical payload,
and refuses the same way with a 409. What differs is only that a Responsibility
commit carries the whole intended state rather than a list of operations, which
is why a *replay* is recognised by the state itself and needs no mutation id
(AC-566) -- and that difference is exactly what makes the ordering below
load-bearing.

**Content first, base second.** A commit whose content already is the current
content is a no-op whatever the base said; only then is a mismatched base a
conflict. Reverse the two and every retry after a successful save becomes a
409 the client cannot resolve without discarding a draft it already committed.

## The concurrent case, and what it can and cannot show

Two requests are fired without awaiting the first, both carrying the same base.
Exactly one must commit. That is a real race on the Postgres leg, where the two
requests are two connections; on PGlite, which is single-connection (11.15),
they serialize in the pool and the case then proves the *sequential* rule
instead. Both are worth having and neither is claimed to be the other: the
sequential assertion below holds on both legs and is what actually pins the
behaviour.

Spec: 7.4, 11.15; #209 R10.
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
  putResponsibility,
  recordOf,
  revisionsOf,
  standingOf,
} from '../support/responsibility-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'deputy', 'subject'], 'ac567')

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
  subject: Actor
  folderId: string
}

async function stage(name: string): Promise<Stage> {
  const [owner, deputy, subject] = (await cast.of(app)) as [
    Actor,
    Actor,
    Actor,
  ]
  const folderId = await sharedFolder(app, owner, name, [
    [deputy, 'full_control'],
    [subject, 'can_view'],
  ])
  return { owner, deputy, subject, folderId }
}

describe('AC-567 a stale Responsibility edit is refused rather than applied', () => {
  test('AC-567 proof 10: the second administrator, editing from what they last saw, is refused and overwrites nothing', async () => {
    const { owner, deputy, subject, folderId } = await stage('AC-567 stale')
    await commitOk(owner, folderId, subject.id, paragraph('The original scope'))

    // Both open the document and read the same revision.
    const asOwner = await standingOf(owner, folderId, subject.id)
    const asDeputy = await standingOf(deputy, folderId, subject.id)
    expect(
      asDeputy.revision,
      'both administrators are looking at the same version',
    ).toBe(asOwner.revision)

    // The owner saves first.
    expectStatus(
      await putResponsibility(
        owner,
        folderId,
        subject.id,
        paragraph("The owner's rewrite"),
        asOwner.revision,
      ),
      200,
      'the first save commits',
    )

    // The deputy saves what they were typing, from the version they read.
    const late = await putResponsibility(
      deputy,
      folderId,
      subject.id,
      paragraph("The deputy's rewrite, from the older version"),
      asDeputy.revision,
    )
    expectStatus(
      late,
      409,
      "R10: a stale edit must not silently overwrite another person's revision",
    )

    const now = await standingOf(owner, folderId, subject.id)
    expect(
      now.content,
      "and the document still holds the first writer's text",
    ).toEqual(paragraph("The owner's rewrite"))
    expect(
      now.revision_no,
      'at the revision the first save produced and no further',
    ).toBe(2)
    expect(
      revisionsOf(await recordOf(app.db, folderId, subject.id)).length,
      'the refused save wrote no revision of its own',
    ).toBe(2)
  })

  test('AC-567 proof 10: the refused writer can reconcile and then commit, so the rule is a refusal rather than a lock', async () => {
    const { owner, deputy, subject, folderId } = await stage('AC-567 recover')
    await commitOk(owner, folderId, subject.id, paragraph('Base'))
    const stale = (await standingOf(deputy, folderId, subject.id)).revision
    await commitOk(owner, folderId, subject.id, paragraph('Owner moved it'))

    expectStatus(
      await putResponsibility(
        deputy,
        folderId,
        subject.id,
        paragraph('Deputy, from the stale base'),
        stale,
      ),
      409,
      'refused while the deputy is behind',
    )
    const fresh = (await standingOf(deputy, folderId, subject.id)).revision
    expectStatus(
      await putResponsibility(
        deputy,
        folderId,
        subject.id,
        paragraph('Deputy, having read the current version'),
        fresh,
      ),
      200,
      'and admitted once they have reconciled -- the discipline is optimistic concurrency, not a lock somebody has to release',
    )
  })

  test('AC-567 proof 10: two commits fired together, one commits and one is refused', async () => {
    const { owner, deputy, subject, folderId } = await stage('AC-567 race')
    await commitOk(owner, folderId, subject.id, paragraph('Shared base'))
    const base = (await standingOf(owner, folderId, subject.id)).revision

    const [a, b] = await Promise.all([
      putResponsibility(
        owner,
        folderId,
        subject.id,
        paragraph('Racer A'),
        base,
      ),
      putResponsibility(
        deputy,
        folderId,
        subject.id,
        paragraph('Racer B'),
        base,
      ),
    ])

    const statuses = [a.status, b.status].sort()
    expect(
      statuses,
      'R10 and R9 section 16 read across: two racing commits from one base serialize behind the folder row lock, and the loser is told rather than applied. On the single-connection leg they queue instead, which is the same answer by a different road (11.15)',
    ).toEqual([200, 409])

    const revisions = revisionsOf(await recordOf(app.db, folderId, subject.id))
    expect(
      revisions.map((entry) => entry.revision_no),
      'and exactly one revision came out of the pair',
    ).toEqual([1, 2])
  })

  test('AC-567 proof 10: a base nobody ever issued is refused, not treated as a first write', async () => {
    const { owner, subject, folderId } = await stage('AC-567 nonsense base')
    await commitOk(owner, folderId, subject.id, paragraph('Existing'))
    expectStatus(
      await putResponsibility(
        owner,
        folderId,
        subject.id,
        paragraph('Written against a token from nowhere'),
        'ac567-not-a-revision-this-document-ever-had',
      ),
      409,
      'the base is compared against the authoritative current hash, so an unrecognised token is stale rather than absent',
    )
  })
})
