/*
AC-561: a member may have no Responsibility at all, with nothing fabricated to
stand in for one; and a document that does exist round-trips through the shared
canonical schema exactly, marks and links included.

Issue #230 required proofs 1 and 24. Product authority: #209 R5, R10.

## The two halves are one criterion because they share a decision

The decision is that **the canonical payload of an absent document is the empty
document**. It makes "no document" and "an empty document" equal *for the
purpose of deciding whether anything changed*, while keeping them distinguishable
on the wire: `content` is null when nobody has written anything, and it is a
document with no blocks when somebody deliberately cleared one.

Without that decision, proof 1 and proof 9 pull in opposite directions -- a
client saving an empty document against a member who has none either fabricates
a row, which proof 1 forbids, or lands in a case the no-op rule does not cover.
With it, both fall out: the save writes nothing, and the read still says "there
is no document" rather than inventing an empty one.

The round-trip half is the other reason the payload has to be exact. A stored
document is the truth of what somebody wrote (R10's "sufficient for truthful
reconstruction"), so a dropped key or a re-ordered one is not a cosmetic
difference: it is a different document with a different content hash, and the
concurrency token would then disagree with the bytes the author sent.

Spec: 7.4, 10.2; #209 R5, R10.
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
  richDocument,
  standingOf,
} from '../support/responsibility-harness.js'
import { EMPTY_RESPONSIBILITY } from '../../src/shared/responsibility.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'member'], 'ac561')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

async function stage(
  name: string,
): Promise<{ owner: Actor; member: Actor; folderId: string }> {
  const [owner, member] = (await cast.of(app)) as [Actor, Actor]
  const folderId = await sharedFolder(app, owner, name, [[member, 'can_edit']])
  return { owner, member, folderId }
}

describe('AC-561 Responsibility is optional, and a real one round-trips', () => {
  test('AC-561 proof 1: a member with no Responsibility has no row, and reads null rather than an invented empty document', async () => {
    const { owner, member, folderId } = await stage('AC-561 optional')

    const standing = await standingOf(owner, folderId, member.id)
    expect(
      standing.content,
      '#230 proof 1: a member may have zero Responsibility, and nothing fabricates content for them',
    ).toBeNull()
    expect(
      standing.responsibility_id,
      'and there is no document row behind it either',
    ).toBeNull()
    expect(
      standing.revision_no,
      'a member who has written nothing is at revision zero',
    ).toBe(0)
    expect(
      standing.revision.length,
      'the concurrency token is never null: a first save is an ordinary optimistic write rather than a special case',
    ).toBeGreaterThan(0)

    expect(
      await documentRows(app.db, folderId),
      'no document row exists for anybody in a folder where nobody has written one',
    ).toEqual([])
    expect(
      await recordOf(app.db, folderId),
      'and the append-only record is empty, because nothing has happened to record',
    ).toEqual([])
  })

  test('AC-561 proof 1: saving the empty document against a member who has none writes nothing at all', async () => {
    const { owner, member, folderId } = await stage('AC-561 empty save')

    const before = await standingOf(owner, folderId, member.id)
    const answer = await commitOk(
      owner,
      folderId,
      member.id,
      EMPTY_RESPONSIBILITY,
    )
    expect(
      answer.committed,
      'the canonical payload of an absent document *is* the empty document, so this changed nothing',
    ).toBe(false)
    expect(
      answer.responsibility.content,
      'and the answer still says there is no document rather than inventing one',
    ).toBeNull()
    expect(
      answer.responsibility.revision,
      'the revision token is unmoved',
    ).toBe(before.revision)
    expect(
      await documentRows(app.db, folderId),
      'R10 "do not fabricate": an empty save creates no row',
    ).toEqual([])
    expect(
      await recordOf(app.db, folderId),
      'and no revision, which is the same rule proof 9 states for a replay',
    ).toEqual([])
  })

  test('AC-561: a member who deliberately clears their document keeps the row, the history and a distinguishable answer', async () => {
    const { owner, member, folderId } = await stage('AC-561 cleared')

    await commitOk(owner, folderId, member.id, paragraph('Runs the yard'))
    const cleared = await commitOk(
      owner,
      folderId,
      member.id,
      EMPTY_RESPONSIBILITY,
    )
    expect(
      cleared.committed,
      'clearing a document that had content is a change, not a no-op',
    ).toBe(true)
    expect(
      cleared.responsibility.content,
      'and the answer is a document with no blocks rather than null: somebody cleared this, which is not the same fact as nobody having written it',
    ).toEqual(EMPTY_RESPONSIBILITY)
    const revisions = await recordOf(app.db, folderId, member.id)
    expect(
      revisions.map((entry) => entry.revision_no),
      'both states are revisions; R10 never rewrites the one that was there',
    ).toEqual([1, 2])
  })

  test('AC-561 proof 24: headings, bullets, marks and both link shapes survive a commit and a read unchanged', async () => {
    const { owner, member, folderId } = await stage('AC-561 round trip')
    const document = richDocument()

    const answer = await commitOk(owner, folderId, member.id, document)
    expect(
      answer.responsibility.content,
      '#230 proof 24: the document the commit answers is the document that was sent',
    ).toEqual(document)

    const read = await standingOf(member, folderId, member.id)
    expect(
      read.content,
      'and a fresh read of the stored row reconstructs it exactly -- R10 requires a snapshot "sufficient for truthful reconstruction"',
    ).toEqual(document)

    const stored = await documentRows(app.db, folderId, member.id)
    expect(
      stored[0]?.content,
      'including the jsonb column itself, which is what a later revision is compared against',
    ).toEqual(document)
    expect(
      (await recordOf(app.db, folderId, member.id))[0]?.content,
      'and the revision snapshot beside it',
    ).toEqual(document)
  })

  test('AC-561 proof 24: the canonical schema refuses what the composer refuses, and nothing is silently dropped', async () => {
    const { owner, member, folderId } = await stage('AC-561 refusals')
    const base = (await standingOf(owner, folderId, member.id)).revision

    /* An unsafe href. `richContent` already refuses it for the page; reusing
       the primitive rather than declaring a second dialect is what makes that
       true here too, and is the reason this case exists at all -- to fail if
       somebody ever re-declares it. */
    const unsafe = await putResponsibility(
      owner,
      folderId,
      member.id,
      {
        version: 1,
        blocks: [
          {
            kind: 'paragraph',
            content: {
              version: 1,
              // eslint-disable-next-line no-script-url
              runs: [{ text: 'tap', href: 'javascript:alert(1)' }],
            },
          },
        ],
      } as never,
      base,
    )
    expectStatus(
      unsafe,
      422,
      'the shared safe composer refuses a javascript: link, and the Responsibility document is that composer rather than a second one',
    )

    // An unknown key inside a block. Refused rather than stripped, because a
    // stored document that does not round-trip is not a truthful snapshot.
    const unknown = await putResponsibility(
      owner,
      folderId,
      member.id,
      {
        version: 1,
        blocks: [
          {
            kind: 'paragraph',
            content: { version: 1, runs: [{ text: 'hi' }] },
            colour: 'red',
          },
        ],
      } as never,
      base,
    )
    expectStatus(
      unknown,
      422,
      'an unknown key inside a content block is refused: dropping it would store a document different from the one that was sent',
    )

    // A version nobody declared: R5's "future-safe document versioning" is a
    // reader that refuses what it does not know rather than guessing.
    const future = await putResponsibility(
      owner,
      folderId,
      member.id,
      { version: 2, blocks: [] } as never,
      base,
    )
    expectStatus(
      future,
      422,
      'a document version this build does not know is refused rather than guessed at (#209 R5)',
    )

    expect(
      await documentRows(app.db, folderId, member.id),
      'and none of the three refusals wrote anything',
    ).toEqual([])
  })
})
