/*
AC-198: given a page holding 500 blocks, when one more is added, then 422.

The cap is 10.3's and it is server-enforced like every other number there.
The staging writes exactly 500 in one PUT, which is legal, so the refusal
is measured one past the line rather than somewhere over it.

Spec: 4.17, 7.16, 10.3 (RFC 0005).
*/
import { afterAll, beforeAll, describe, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast, createFolder, expectStatus } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner'])

function paragraphs(count: number): Array<Record<string, unknown>> {
  return Array.from({ length: count }, (_, index) => ({
    kind: 'paragraph',
    position: index,
    text: `s1 ac198 block ${String(index)}`,
  }))
}

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-198 the 500 block cap', () => {
  test('500 writes, 501 refuses', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const folderId = await createFolder(owner, 's1 ac198 cap')

    const atCap = await owner.browser.json(`/folders/${folderId}/page`, 'PUT', {
      blocks: paragraphs(500),
    })
    expectStatus(atCap, 200, '500 blocks are legal (spec 10.3)')

    const overCap = await owner.browser.json(`/folders/${folderId}/page`, 'PUT', {
      blocks: paragraphs(501),
    })
    expectStatus(overCap, 422, 'the 501st is refused with the field named (spec 10.3)')
  })
})
