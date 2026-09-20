/*
AC-424: given a supported Dana URL naming a Task, Folder or Shelf the viewer
may read, when the reference is resolved, then the answer is the canonical
reference summary — kind, id, display label and canonical internal path — and
carries no other metadata.

**Three kinds in one file because they are one decision.** The issue's first
three required tests are the same sentence said about `/app/tasks/:id`,
`/app/folders/:id` and `/app/shelves/:id`; what would make one of them fail
while the others passed is a missing branch in the resolver, which is exactly
what a file asserting all three catches and three files would not catch any
better.

The fourth case is the one that is easy to leave out and is the reason the
parser lives in `src/shared/`: the `path` the server answers is fed back
through `parseDanaLink` and must come out as the target it described. Without
it the two halves of the grammar can drift — a server emitting `/app/task/:id`
and a client parsing `/app/tasks/:id` — and every case above would still pass.

Spec: 7.0 (the object and the status taxonomy), 4.18, 10.2. Issue #223.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { parseDanaLink, referencePath } from '../../src/shared/references.js'
import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast, expectStatus } from '../support/folders-harness.js'
import {
  NEEDLE,
  REFERENCE_CAST,
  REFERENCE_PREFIX,
  expectSummaryShape,
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

describe('AC-424 a supported Dana URL resolves to a reference summary', () => {
  test('AC-424: an accessible Task resolves to a Task summary', async () => {
    const fx = await stage()
    const answer = await resolveReference(fx.viewer, 'task', fx.contextTaskId)
    expectStatus(
      answer,
      200,
      'a member of the task\'s folder may resolve a link to it (issue #223)',
    )
    const summary = expectSummaryShape(answer.json(), 'the task summary')
    expect(summary.kind, 'the summary names its own kind').toBe('task')
    expect(summary.id, 'the summary names the row it resolved').toBe(
      fx.contextTaskId,
    )
    expect(
      summary.label,
      'a Task chip draws the task\'s own title, which is what a person sees in the composer',
    ).toBe(`r223 ${NEEDLE} task in context`)
    expect(
      summary.path,
      'the canonical internal path is the server\'s to state, never the client\'s to assemble',
    ).toBe(referencePath('task', fx.contextTaskId))
  })

  test('AC-424: an accessible Folder resolves to a Folder summary', async () => {
    const fx = await stage()
    const answer = await resolveReference(
      fx.viewer,
      'folder',
      fx.contextFolderId,
    )
    expectStatus(answer, 200, 'a member may resolve a link to their folder')
    const summary = expectSummaryShape(answer.json(), 'the folder summary')
    expect(summary.kind).toBe('folder')
    expect(summary.id).toBe(fx.contextFolderId)
    expect(summary.label, 'a Folder chip draws the folder\'s name').toBe(
      `r223 ${NEEDLE} context folder`,
    )
    expect(summary.path).toBe(referencePath('folder', fx.contextFolderId))
  })

  test('AC-424: an owned Shelf resolves to a Shelf summary', async () => {
    const fx = await stage()
    const answer = await resolveReference(fx.viewer, 'shelf', fx.shelfId)
    expectStatus(
      answer,
      200,
      'a shelf is private by construction (4.18), so its owner is the one person who resolves it',
    )
    const summary = expectSummaryShape(answer.json(), 'the shelf summary')
    expect(summary.kind).toBe('shelf')
    expect(summary.id).toBe(fx.shelfId)
    expect(summary.label).toBe(`r223 ${NEEDLE} shelf`)
    expect(summary.path).toBe(referencePath('shelf', fx.shelfId))
  })

  test('AC-424: every path the server answers parses back to its own target', async () => {
    const fx = await stage()
    const targets: readonly [string, string][] = [
      ['task', fx.contextTaskId],
      ['folder', fx.contextFolderId],
      ['shelf', fx.shelfId],
    ]
    for (const [kind, id] of targets) {
      const answer = await resolveReference(fx.viewer, kind, id)
      expectStatus(answer, 200, `${kind} resolves for its viewer`)
      const summary = expectSummaryShape(answer.json(), `${kind} summary`)
      expect(
        parseDanaLink(summary.path),
        `the ${kind} path the server emitted must be a Dana Link the shared parser accepts, or the two halves of the grammar have drifted (issue #223)`,
      ).toEqual({ kind, id })
    }
  })
})
