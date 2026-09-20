/*
AC-566: a save whose content already is the current content writes no revision,
and "already is" means **canonical payload equality** rather than object
identity or byte equality of what arrived on the wire.

Issue #230 required proof 9. Product authority: #209 R10 "identical/replayed
content does not create duplicate semantic revisions".

## The rule stated, because it is the one most easily got wrong

Two payloads are the same when their **canonical forms** are equal. The
canonical form is what the shared schema's parse produces: keys in a fixed
order, absent optional keys genuinely absent, and the whole thing hashed with
the same `documentHash` the Folder page transaction uses for its own
`base_revision`.

Three things follow, and each is a case below, because each is a way a naive
implementation gets it wrong:

- **key order does not matter.** A client that serializes `{italic, text}`
  where another sends `{text, italic}` has sent the same document. An
  implementation comparing the raw request body would write a second revision.
- **an omitted optional and an explicit `undefined` are the same.** JSON cannot
  carry `undefined`, but a client library can drop the key or send nothing, and
  the parse normalizes both to absent.
- **a replay after the commit succeeded is still a no-op.** This is the case
  that matters operationally: the client sent a save, the answer was lost, it
  retries with the *old* `base_revision`. Comparing content first and the base
  second is what makes that a 200 rather than a 409, and it is why there is no
  mutation-id receipts table beside this endpoint.

The fourth case is the boundary: a *changed* document at the same
`base_revision` is not a replay and must commit.

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
  documentRows,
  paragraph,
  putResponsibility,
  recordOf,
  revisionsOf,
  richDocument,
  standingOf,
} from '../support/responsibility-harness.js'
import type { ResponsibilityDocument } from '../../src/shared/responsibility.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'subject'], 'ac566')

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
): Promise<{ owner: Actor; subject: Actor; folderId: string }> {
  const [owner, subject] = (await cast.of(app)) as [Actor, Actor]
  const folderId = await sharedFolder(app, owner, name, [
    [subject, 'can_view'],
  ])
  return { owner, subject, folderId }
}

describe('AC-566 an identical replay writes no second revision', () => {
  test('AC-566 proof 9: re-sending the same document against the current revision changes nothing', async () => {
    const { owner, subject, folderId } = await stage('AC-566 same')
    const document = paragraph('Opens the yard at six')

    const first = await commitOk(owner, folderId, subject.id, document)
    expect(first.committed).toBe(true)

    const again = await commitOk(owner, folderId, subject.id, document)
    expect(
      again.committed,
      'R10: identical content does not create a duplicate semantic revision',
    ).toBe(false)
    expect(
      again.responsibility.revision_no,
      'and the current revision has not advanced',
    ).toBe(1)
    expect(
      revisionsOf(await recordOf(app.db, folderId, subject.id)).length,
      'one revision after two saves of the same thing',
    ).toBe(1)
  })

  test('AC-566 proof 9: a replay carrying the stale base is still a no-op, not a conflict', async () => {
    const { owner, subject, folderId } = await stage('AC-566 replay')
    const document = paragraph('Runs the Tuesday delivery')

    const before = (await standingOf(owner, folderId, subject.id)).revision
    const committed = await putResponsibility(
      owner,
      folderId,
      subject.id,
      document,
      before,
    )
    expectStatus(committed, 200, 'the first send commits')

    /* The retry. The answer to the first send never reached the client, so it
       sends the whole thing again with the base it still believes -- which is
       now stale. Comparing the content before the base is what turns this into
       an idempotent 200, and is why this endpoint needs no retry identity. */
    const retry = await putResponsibility(
      owner,
      folderId,
      subject.id,
      document,
      before,
    )
    expectStatus(
      retry,
      200,
      'a replay of a commit that succeeded is idempotent rather than a conflict: the state the caller is asking for is the state that exists',
    )
    const body = retry.json() as { committed: boolean }
    expect(
      body.committed,
      'and it says plainly that it wrote nothing',
    ).toBe(false)
    expect(
      revisionsOf(await recordOf(app.db, folderId, subject.id)).length,
      'one revision from the two sends',
    ).toBe(1)
  })

  test('AC-566 proof 9: key order and omitted optionals are canonicalized, so neither makes a second revision', async () => {
    const { owner, subject, folderId } = await stage('AC-566 canonical')

    await commitOk(owner, folderId, subject.id, richDocument())
    const after = await standingOf(owner, folderId, subject.id)

    /* The same document with every object's keys in a different order, and
       with one run carrying an explicitly absent optional. A comparison over
       the request bytes, or over `JSON.stringify` of the unparsed body, would
       see a different document and write a second revision. */
    const reordered = {
      blocks: [
        {
          content: { runs: [{ text: 'Site safety' }], version: 1 },
          level: 2,
          kind: 'heading',
        },
        {
          content: {
            runs: [
              { text: 'Owns the ' },
              { bold: true, text: 'weekly' },
              { text: ' walk-round, see ' },
              { href: '/folders/checklist', text: 'the checklist' },
              { text: ' and ' },
              { href: 'https://example.test/standard', text: 'the standard' },
              { italic: true, text: '.' },
            ],
            version: 1,
          },
          kind: 'paragraph',
        },
        {
          depth: 0,
          content: { version: 1, runs: [{ text: 'Scaffold inspections' }] },
          kind: 'bullet',
        },
        {
          kind: 'bullet',
          content: { runs: [{ text: 'Tags renewed on Mondays' }], version: 1 },
          depth: 1,
        },
      ],
      version: 1,
    } as unknown as ResponsibilityDocument

    const response = await putResponsibility(
      owner,
      folderId,
      subject.id,
      reordered,
      after.revision,
    )
    expectStatus(response, 200, 'the reordered document is accepted')
    const body = response.json() as { committed: boolean }
    expect(
      body.committed,
      'and it is the same document: canonical payload equality is the rule, not object identity and not the bytes that arrived',
    ).toBe(false)
    expect(
      revisionsOf(await recordOf(app.db, folderId, subject.id)).length,
      'still one revision',
    ).toBe(1)
    expect(
      (await documentRows(app.db, folderId, subject.id))[0]?.content_hash,
      'and the stored content hash is unmoved, which is what a client sends back as its base',
    ).toBe(after.revision)
  })

  test('AC-566 proof 9: a genuinely different document at the same base does commit', async () => {
    const { owner, subject, folderId } = await stage('AC-566 boundary')
    await commitOk(owner, folderId, subject.id, paragraph('First'))
    const answer = await commitOk(
      owner,
      folderId,
      subject.id,
      paragraph('Second'),
    )
    expect(
      answer.committed,
      'the no-op rule must not swallow a real change: a criterion that only proved things do not happen would pass against an endpoint that never wrote anything',
    ).toBe(true)
    expect(
      revisionsOf(await recordOf(app.db, folderId, subject.id)).length,
    ).toBe(2)
  })
})
