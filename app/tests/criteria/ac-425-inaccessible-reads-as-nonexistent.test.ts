/*
AC-425: given a Dana URL naming a real Task, Folder or Shelf the viewer has
no relationship to, when it is resolved, then the answer is
indistinguishable — status and body alike — from the answer for an id that
names nothing at all, and nothing of the target's name, title or any other
protected metadata appears.

**Indistinguishable is the assertion, and it is stronger than 404.** A 404
whose body carried the folder's name would have the right status on it and
would still be the leak. A 404 that differed from the nonexistent case by a
word, a code, or a length would let a caller enumerate ids and learn which
ones are real, which is the same leak arriving more slowly. So each refusal
below is compared against the refusal for a freshly minted uuid: same status,
same body, byte for byte.

The fixture's inaccessible rows carry the same needle its accessible ones do,
so a resolver that found nothing for a different reason — a typo in the query,
a fixture that was never written — would fail AC-424 rather than pass here.

Spec: 7.0 (404 and never 403), 10.2, 4.18. Issue #223.
*/
import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast, expectStatus } from '../support/folders-harness.js'
import {
  NEEDLE,
  REFERENCE_CAST,
  REFERENCE_PREFIX,
  resolveReference,
  stageReferences,
} from '../support/references-harness.js'
import type { ReferenceStage } from '../support/references-harness.js'

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

describe('AC-425 an inaccessible target is a nonexistent target', () => {
  test('AC-425: an inaccessible Folder does not leak its name', async () => {
    const fx = await stage()
    const answer = await resolveReference(
      fx.viewer,
      'folder',
      fx.strangerFolderId,
    )
    expectStatus(
      answer,
      404,
      'a folder the viewer is not a member of reads as nonexistent, never 403 (spec 7.0, 10.2)',
    )
    expect(
      answer.body,
      'the refusal must carry nothing of the folder it refused (issue #223)',
    ).not.toContain(NEEDLE)
  })

  test('AC-425: another person\'s Shelf leaks neither its name nor its existence', async () => {
    const fx = await stage()
    const answer = await resolveReference(
      fx.viewer,
      'shelf',
      fx.strangerShelfId,
    )
    expectStatus(
      answer,
      404,
      'a shelf is its owner\'s alone (4.18), so a second account is told nothing',
    )
    expect(answer.body).not.toContain(NEEDLE)

    const nothing = await resolveReference(fx.viewer, 'shelf', randomUUID())
    expect(
      answer.body,
      'a real shelf the viewer may not have and a shelf id that names nothing must answer the same body, or the endpoint tells a stranger which ids are real (spec 10.2)',
    ).toBe(nothing.body)
    expect(answer.status).toBe(nothing.status)
  })

  test('AC-425: a Task in a folder the viewer is not in is refused the same way', async () => {
    const fx = await stage()
    const answer = await resolveReference(
      fx.viewer,
      'task',
      fx.strangerTaskId,
    )
    const nothing = await resolveReference(fx.viewer, 'task', randomUUID())
    expectStatus(
      answer,
      404,
      'task access is the membership of its folder and nothing else (spec 10.2)',
    )
    expect(answer.body).not.toContain(NEEDLE)
    expect(answer.body).toBe(nothing.body)
  })

  test('AC-425: the refusal is symmetric, so neither account is the privileged one', async () => {
    const fx = await stage()
    const attempts: readonly [string, string][] = [
      ['folder', fx.contextFolderId],
      ['task', fx.contextTaskId],
      ['shelf', fx.shelfId],
    ]
    for (const [kind, id] of attempts) {
      const answer = await resolveReference(fx.stranger, kind, id)
      const nothing = await resolveReference(fx.stranger, kind, randomUUID())
      expectStatus(
        answer,
        404,
        `the stranger asking for the viewer's ${kind} is told exactly what the viewer is told about theirs`,
      )
      expect(answer.body).not.toContain(NEEDLE)
      expect(answer.body).toBe(nothing.body)
    }
  })
})
