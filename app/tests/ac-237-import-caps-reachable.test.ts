/*
AC-237: given a workflow file at 10.3's block ceiling, then it imports, the
3 MB body row being sized above the largest legal file so every cap in the
limits table is reachable; a file over 1000 tasks answers 422 naming the
field, and a body over 3 MB answers the parser's 400.

This pins the resolution of F-5 and F-6 together, as they were ruled (RFC
0005 change control item 18). Before the fix, express.json ran on its
undocumented 100 kB default: a legal file of 500 blocks at 4000 characters
is about 2 MB, so the body parser refused it as 400 before 10.3's own cap
could speak, which made the limits table read as enforced where it was
unreachable; and the task array had no cap at all, bounded only by that
same parser accident. AC-201's over-caps case is 51 empty folders, a few
hundred bytes, which is why it never saw either.

Spec: 10.3 (the import row and the JSON body row), 7.16.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast, expectStatus } from './folders-harness.js'
import type { Actor } from './folders-harness.js'

let app: AuthTestApp
const cast = new Cast(['importer'], 's14')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-237 the import caps are reachable and the body ceiling is honest', () => {
  test('a file at the 500-block ceiling imports', async () => {
    const [importer] = (await cast.of(app)) as [Actor]
    const blocks = Array.from({ length: 500 }, (_, i) => ({
      kind: 'paragraph',
      text: `${String(i)} ${'x'.repeat(3990)}`,
    }))
    const imported = await importer.browser.json('/workflows/import', 'POST', {
      dana: 'workflow',
      version: 1,
      folders: [{ name: 's14 ac237 ceiling', blocks }],
    })
    expectStatus(
      imported,
      201,
      'the largest legal workflow file must reach the schema and import: a cap in the limits table that no request can reach reads as enforced and is not (10.3)',
    )
  })

  test('1001 tasks across folders answer 422 naming the field', async () => {
    const [importer] = (await cast.of(app)) as [Actor]
    const tasksOf = (n: number): Array<{ title: string }> =>
      Array.from({ length: n }, (_, i) => ({ title: `t${String(i)}` }))
    const refused = await importer.browser.json('/workflows/import', 'POST', {
      dana: 'workflow',
      version: 1,
      folders: [
        { name: 's14 ac237 tasks a', tasks: tasksOf(501) },
        { name: 's14 ac237 tasks b', tasks: tasksOf(500) },
      ],
    })
    expectStatus(refused, 422, 'the 1000-task cap is 10.3\'s import row, server-enforced')
    expect(
      refused.body.includes('tasks'),
      `the 422 names the field, as 10.3 requires of every limit but the quota; body: ${refused.body.slice(0, 200)}`,
    ).toBe(true)
  })

  test('a body over 3 MB answers the parser\'s 400', async () => {
    const [importer] = (await cast.of(app)) as [Actor]
    // Structurally a workflow file, but 3.3 MB on the wire: the parser's
    // refusal precedes every field, which the 10.3 closing sentence now
    // records as the body ceiling's honest answer.
    const refused = await importer.browser.json('/workflows/import', 'POST', {
      dana: 'workflow',
      version: 1,
      folders: [{ name: 's14 ac237 oversize', blocks: [] }],
      padding: 'y'.repeat(3 * 1024 * 1024 + 200 * 1024),
    })
    expectStatus(
      refused,
      400,
      'a body past the 3 MB row is refused by the parser as 400 before any field is read (10.3)',
    )
  })
})
