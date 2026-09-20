/*
AC-426: given a malformed or unsupported internal URL, when it is offered to
the reference surface, then it is refused through the ordinary taxonomy — a
kind or an id the grammar does not admit reads as nonexistent, a malformed
query is 422 naming the field — and nothing about the refusal distinguishes an
unsupported link from a link to something that is not there.

**Two halves, and only one of them is here.** Whether a string is a Dana Link
is `src/shared/references.ts`'s question and is asserted beside it in
`references.test.ts`, with no database and no HTTP: that is where the
protocol-relative URL, the foreign origin, the fourth path segment and the
kinds outside the closed set are refused. This file asserts the other half —
that the endpoint agrees with the parser, and that disagreeing costs a 404
rather than a 500 or, worse, a hint.

**Why an unsupported kind is 404 and not 422.** A 422 would be a correct
description of a malformed request and the wrong answer for this surface:
`/references/comment/<id>` and `/references/task/<id>` must be told apart by
nobody, since a caller who learns that `comment` is not yet referenceable has
learned nothing dangerous, but a caller who can tell the *shape* of a refusal
from its *subject* has the beginning of an oracle. One answer, one body.

The `q` case is the opposite and is why both statuses appear here: the query
string is the caller's own text, it says nothing about anybody's rows, and
10.3 has it answer 422 naming the field like every other malformed query in
the API.

Spec: 7.0, 10.2, 10.3. Issue #223.
*/
import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast, expectStatus } from '../support/folders-harness.js'
import {
  REFERENCE_CAST,
  REFERENCE_PREFIX,
  resolveReference,
  searchReferences,
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

function codeOf(body: unknown): unknown {
  return (body as { error?: { code?: unknown } }).error?.code
}

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-426 an unsupported link is refused safely', () => {
  test('AC-426: a kind outside the closed set answers exactly what a missing row answers', async () => {
    const fx = await stage()
    const baseline = await resolveReference(fx.viewer, 'task', randomUUID())
    expectStatus(baseline, 404, 'a task id naming nothing is a plain 404')

    // Every one of these is a kind Dana has objects of, or nearly does, and
    // none of them has the stable identity and route the issue makes the
    // condition of being referenceable in M1.
    for (const kind of ['comment', 'page', 'step', 'view', 'user', 'tasks']) {
      const answer = await resolveReference(fx.viewer, kind, fx.contextTaskId)
      expectStatus(
        answer,
        404,
        `/references/${kind}/:id names no supported target and must read as nonexistent (issue #223)`,
      )
      expect(
        answer.body,
        `the refusal of ${kind} must be indistinguishable from the refusal of a missing task`,
      ).toBe(baseline.body)
    }
  })

  test('AC-426: an id that is not a uuid is refused without reaching a query', async () => {
    const fx = await stage()
    const baseline = await resolveReference(fx.viewer, 'task', randomUUID())
    for (const id of [
      'not-a-uuid',
      '12345',
      `${fx.contextTaskId}x`,
      'null',
      '%20',
    ]) {
      const answer = await resolveReference(fx.viewer, 'task', id)
      expectStatus(
        answer,
        404,
        `an id the grammar does not admit names nothing: ${id}`,
      )
      expect(answer.body).toBe(baseline.body)
    }
  })

  test('AC-426: a malformed query is 422 naming the field, not 404', async () => {
    const fx = await stage()
    const short = await searchReferences(fx.viewer, 'a')
    expectStatus(
      short,
      422,
      'q is 7.10\'s own rule, trimmed and 2 to 100 characters, and a bad one is the caller\'s own mistake (spec 10.3)',
    )
    expect(codeOf(short.json())).toBe('validation_failed')
    expect(
      short.body,
      'the 422 names the field, as every other malformed query in this API does',
    ).toContain('q')

    const missing = await searchReferences(fx.viewer, '')
    expectStatus(missing, 422, 'an absent q is the same refusal')

    const badFolder = await fx.viewer.browser.json(
      '/references/search?q=danalink&folder=not-a-uuid',
      'GET',
    )
    expectStatus(
      badFolder,
      422,
      'a folder parameter that is not an id is malformed rather than missing: it names no row, so refusing it tells nobody anything',
    )
    expect(codeOf(badFolder.json())).toBe('validation_failed')
  })

  test('AC-426: a folder the viewer cannot see is 404, not 422 and not an empty list', async () => {
    const fx = await stage()
    const foreign = await searchReferences(
      fx.viewer,
      'danalinkneedle',
      fx.strangerFolderId,
    )
    const nothing = await searchReferences(
      fx.viewer,
      'danalinkneedle',
      randomUUID(),
    )
    expectStatus(
      foreign,
      404,
      'the context folder is resolved before anything is read, exactly as GET /events does with the same parameter (spec 10.2)',
    )
    expect(
      foreign.body,
      'a real folder the viewer may not have and a folder id naming nothing answer alike, or the picker becomes the oracle the resolver refuses to be',
    ).toBe(nothing.body)
  })
})
