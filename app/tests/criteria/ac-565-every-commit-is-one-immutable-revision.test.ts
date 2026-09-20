/*
AC-565: every committed changed document state produces exactly one immutable
revision, carrying the actor and the time; the current document and that
revision commit atomically; and the rows are append-only.

Issue #230 required proof 8. Product authority: #209 R10 "Saving / revisions".

## The four things R10 asks for, and how each is actually checked

**One revision per changed commit**, not zero and not two. Checked by counting
across a run of distinct saves rather than by inspecting one -- a double write
shows up as a count, never as a wrong field.

**Actor and effective time on every revision.** Checked by writing the same
document twice from two different people and reading both entries back: a
revision that recorded "the subject" rather than "whoever wrote it" would pass
a single-actor case.

**Atomicity.** Checked from the other side: a commit that the resolver refuses
must leave *neither* the document nor an entry behind. That is the only
observable half of atomicity available without faulting the database mid-write,
and it is the half that would break if the entry were written before the
decision or the document updated outside the transaction. The structural half
is that `writeRevision` takes an `Executor` and opens no transaction of its
own, the same shape `recordAccessTransition` takes for R9's identical rule.

**Append-only.** Checked by keeping every earlier entry's id, content and hash
across five further commits and asserting all three unchanged, which is proof
12's shape used here for proof 8's purpose: an implementation that updated the
latest entry in place would keep the count right and fail this.

Spec: 4, 7.4; #209 R10.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { sharedFolder } from '../support/folder-access-harness.js'
import { Cast, expectStatus } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import {
  commitOk,
  documentRows,
  paragraph,
  putResponsibility,
  recordOf,
  revisionsOf,
  standingOf,
} from '../support/responsibility-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'deputy', 'editor', 'subject'], 'ac565')

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
  editor: Actor
  subject: Actor
  folderId: string
}

async function stage(name: string): Promise<Stage> {
  const [owner, deputy, editor, subject] = (await cast.of(app)) as [
    Actor,
    Actor,
    Actor,
    Actor,
  ]
  const folderId = await sharedFolder(app, owner, name, [
    [deputy, 'full_control'],
    [editor, 'can_edit'],
    [subject, 'assigned_work'],
  ])
  return { owner, deputy, editor, subject, folderId }
}

describe('AC-565 every committed change is one immutable revision', () => {
  test('AC-565 proof 8: five changed saves make five revisions, numbered without a gap', async () => {
    const { owner, subject, folderId } = await stage('AC-565 count')

    for (let n = 1; n <= 5; n += 1) {
      const answer = await commitOk(
        owner,
        folderId,
        subject.id,
        paragraph(`Scope revision ${String(n)}`),
      )
      expect(
        answer.committed,
        `each distinct state is a change (${String(n)})`,
      ).toBe(true)
      expect(
        answer.responsibility.revision_no,
        'and the current document advances by exactly one',
      ).toBe(n)
    }

    const revisions = revisionsOf(await recordOf(app.db, folderId, subject.id))
    expect(
      revisions.map((entry) => entry.revision_no),
      'R10: every committed changed document state must have a durable revision identity -- one each, in order, with no gap and no duplicate',
    ).toEqual([1, 2, 3, 4, 5])
    expect(
      revisions[0]?.transition,
      'the first is a creation and the rest are updates, which is what History renders differently',
    ).toBe('responsibility_created')
    expect(
      revisions.slice(1).map((entry) => entry.transition),
    ).toEqual([
      'responsibility_updated',
      'responsibility_updated',
      'responsibility_updated',
      'responsibility_updated',
    ])

    const documents = await documentRows(app.db, folderId, subject.id)
    expect(
      documents.length,
      'and there is still exactly one current document behind the five revisions',
    ).toBe(1)
    expect(documents[0]?.current_revision_no).toBe(5)
  })

  test('AC-565 proof 8: each revision carries the person who committed it and the instant they did', async () => {
    const { owner, deputy, subject, folderId } = await stage('AC-565 actor')

    const before = Date.now() - 1000
    await commitOk(owner, folderId, subject.id, paragraph('Written by the owner'))
    await commitOk(
      deputy,
      folderId,
      subject.id,
      paragraph('Rewritten by the deputy'),
    )
    const after = Date.now() + 1000

    const revisions = revisionsOf(await recordOf(app.db, folderId, subject.id))
    expect(
      revisions.map((entry) => entry.actor_id),
      'R10: the revision records the actor. Two different people wrote these, and recording the *subject* would have passed a one-actor case',
    ).toEqual([owner.id, deputy.id])
    expect(
      revisions.every((entry) => entry.member_id === subject.id),
      'while the member the document is about is the subject on both',
    ).toBe(true)
    for (const revision of revisions) {
      const at = Date.parse(revision.effective_at)
      expect(
        Number.isFinite(at) && at >= before && at <= after,
        'and the effective timestamp is the moment it was committed',
      ).toBe(true)
    }

    const standing = await standingOf(owner, folderId, subject.id)
    expect(
      standing.updated_by?.id,
      'the current document names the last of them, which is what member details renders',
    ).toBe(deputy.id)
    expect(
      standing.current_revision_id,
      'and points at a real revision entry rather than at nothing',
    ).toBe(revisions[1]?.id)
  })

  test('AC-565 proof 8: a refused commit leaves neither a document nor an entry', async () => {
    const { editor, subject, folderId } = await stage('AC-565 atomic')
    const base = (await standingOf(editor, folderId, subject.id)).revision

    expectStatus(
      await putResponsibility(
        editor,
        folderId,
        subject.id,
        paragraph('Written by somebody who may not'),
        base,
      ),
      403,
      'Can edit may not write a Responsibility document (AC-562)',
    )
    expect(
      await documentRows(app.db, folderId, subject.id),
      'and the refusal wrote no document: the decision is inside the transaction, ahead of every write',
    ).toEqual([])
    expect(
      await recordOf(app.db, folderId, subject.id),
      'nor an entry, which is what would be left behind by a record written before the decision',
    ).toEqual([])
  })

  test('AC-565 proof 8: earlier revisions keep their id, their content and their hash across every later commit', async () => {
    const { owner, subject, folderId } = await stage('AC-565 append only')

    await commitOk(owner, folderId, subject.id, paragraph('The first scope'))
    const first = revisionsOf(await recordOf(app.db, folderId, subject.id))[0]
    expect(first, 'the first revision exists to be frozen').toBeDefined()
    const frozen = {
      id: first?.id,
      content: first?.content,
      hash: first?.content_hash,
      at: first?.effective_at,
      actor: first?.actor_id,
    }

    for (let n = 2; n <= 6; n += 1) {
      await commitOk(
        owner,
        folderId,
        subject.id,
        paragraph(`Scope ${String(n)}`),
      )
    }

    const now = revisionsOf(await recordOf(app.db, folderId, subject.id))
    expect(
      {
        id: now[0]?.id,
        content: now[0]?.content,
        hash: now[0]?.content_hash,
        at: now[0]?.effective_at,
        actor: now[0]?.actor_id,
      },
      'R10: "revision rows are append-only ... never rewrite the historical revision". Five commits later the first one is byte for byte what it was',
    ).toEqual(frozen)
    expect(
      now.length,
      'and nothing was collapsed or pruned on the way',
    ).toBe(6)
  })
})
