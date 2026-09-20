/*
AC-441: given a set of tasks already related, when a dependency is asked for
that would make a task wait on itself directly or through any number of
others, then it is refused before anything is written and the graph is exactly
as it was.

Three lengths, one rule. A self-edge is length one, A→B→A is length two, and
the last case is length four, which is there to prove that the check walks
rather than looks: an implementation that compared the proposed pair against
the existing rows one hop deep passes the first two cases and fails only this
one.

**"Before writes" is asserted as a state and not as a status code.** A 422 is
what the caller sees, and a 422 with the row written would look identical from
outside; each case therefore reads the graph afterwards and requires it
unchanged. That is also what makes this criterion a test of the domain rather
than of the route.

**The refusal is 422 naming `blocking_task_id`, not 409.** The body is
well-formed and the ids are real; what refuses it is the state of the rows,
which is the case 10.3 gives a 422 naming the field the caller can change.

Spec: 10.3, 4.5. Issue #224.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast, createFolder, expectStatus } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import { createTaskOk } from '../support/tasks-harness.js'
import {
  createDependencyOk,
  postDependency,
  storedEdges,
} from '../support/task-dependencies-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner'], 'ac441')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

/** A chain of freshly made tasks, returned in order. */
async function chain(
  owner: Actor,
  folderId: string,
  titles: readonly string[],
): Promise<string[]> {
  const made: string[] = []
  for (const title of titles) {
    const task = await createTaskOk(
      owner,
      { title, folder_id: folderId },
      'a task in the chain must stage (spec 7.6)',
    )
    made.push(task.id)
  }
  return made
}

function expectCycleRefusal(
  response: Awaited<ReturnType<typeof postDependency>>,
  why: string,
): void {
  expectStatus(response, 422, why)
  const body = response.json() as { error?: { message?: unknown } }
  expect(
    String(body.error?.message ?? ''),
    'the 422 names the field the caller can change (10.3)',
  ).toContain('blocking_task_id')
}

describe('AC-441 a cycle of any length is refused before the write', () => {
  test('a task cannot wait on itself', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const folderId = await createFolder(owner, 'ac441 the self')
    const [only] = await chain(owner, folderId, ['ac441 the only task'])

    const refused = await postDependency(owner, String(only), String(only))
    expectCycleRefusal(
      refused,
      'a self-dependency is refused; task_dependencies_no_self_edge_check is the floor and this is the 422 that keeps it from being a 500',
    )
    expect(
      await storedEdges(app.db, [String(only)]),
      'and nothing was written',
    ).toEqual([])
  })

  test('a two-node cycle is refused', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const folderId = await createFolder(owner, 'ac441 the pair')
    const [a, b] = await chain(owner, folderId, ['ac441 A', 'ac441 B'])

    await createDependencyOk(
      owner,
      String(a),
      String(b),
      'A comes to wait on B (issue #224)',
    )
    const refused = await postDependency(owner, String(b), String(a))
    expectCycleRefusal(
      refused,
      'B cannot then wait on A: the pair would wait on each other and neither could ever be unblocked',
    )
    expect(
      await storedEdges(app.db, [String(a), String(b)]),
      'the graph is exactly the one edge it was',
    ).toEqual([{ dependent: String(a), blocking: String(b) }])
  })

  test('a longer cycle is refused, which is what proves the check walks', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const folderId = await createFolder(owner, 'ac441 the ring')
    const [a, b, c, d] = await chain(owner, folderId, [
      'ac441 one',
      'ac441 two',
      'ac441 three',
      'ac441 four',
    ])

    // A waits on B waits on C waits on D. Nothing yet waits on A.
    await createDependencyOk(owner, String(a), String(b), 'A waits on B')
    await createDependencyOk(owner, String(b), String(c), 'B waits on C')
    await createDependencyOk(owner, String(c), String(d), 'C waits on D')

    const refused = await postDependency(owner, String(d), String(a))
    expectCycleRefusal(
      refused,
      'D cannot wait on A: A already reaches D in three hops, and a check that only looked one hop deep would have admitted this',
    )
    expect(
      (await storedEdges(app.db, [String(a), String(b), String(c), String(d)]))
        .length,
      'the three edges that were there are the three that are there',
    ).toBe(3)

    // And the same graph still admits an edge that closes nothing: the refusal
    // above is about the cycle rather than about the pair being related.
    const extra = await createTaskOk(
      owner,
      { title: 'ac441 five', folder_id: folderId },
      'a fifth task must stage (spec 7.6)',
    )
    await createDependencyOk(
      owner,
      String(d),
      extra.id,
      'D may still take a blocker that nothing reaches back from',
    )
  })
})
