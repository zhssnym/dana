/*
AC-315: given a brand-new account, its Desk folder carries Dana's own
sentence in the description column 4.3 already has, and the person can
rewrite or empty it through 7.4 like any other folder's.

Issue #68's second half. Desk is the one place page that is a folder, which
is why it sits outside 4.20's and 4.22's set: everything else on 9.1's list
gets its words from 7.21, and Desk gets them from the column it has had
since v1. Provisioning is the only moment Dana writes them, so the assertion
is on a fresh account rather than on a migration.

**The sentence is asserted through the API rather than off the column**,
because what the frontend reads is the Folder object; a description stored
somewhere GET /folders does not answer would be a default nobody could see.

**And it is a default rather than a fixture.** The second half of the case
empties it and reads it back empty: Dana wrote the first sentence and the
person owns every one after it, which is the whole difference between this
and a caption the product prints.

Spec: 4.3, 7.1, 7.4; issue #68.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast, expectStatus, listFolders } from './folders-harness.js'
import type { Actor, FolderListEntry } from './folders-harness.js'

let app: AuthTestApp
const cast = new Cast(['newcomer'], 'i68')

async function deskOf(actor: Actor): Promise<FolderListEntry> {
  const desk = (await listFolders(actor)).find(
    (folder) => folder.is_default === true,
  )
  expect(
    desk,
    'a provisioned account has exactly one default folder (INV-2, spec 7.1)',
  ).toBeDefined()
  return desk as FolderListEntry
}

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-315 a new account’s Desk carries a description', () => {
  test('provisioning writes Dana’s sentence, and the person owns every one after it', async () => {
    const [newcomer] = (await cast.of(app)) as [Actor]

    const desk = await deskOf(newcomer)
    expect(desk.name, 'the catch-all is Desk (AC-211)').toBe('Desk')
    expect(
      desk.description,
      'issue #68: a new account’s Desk arrives with a useful default description, ' +
        'and it is Dana’s own sentence for that page rather than a second one invented here',
    ).toBe('Nothing decided about it yet')

    const rewritten = await newcomer.browser.json(
      `/folders/${desk.id}`,
      'PATCH',
      { description: 'Everything I have not filed yet' },
    )
    expectStatus(rewritten, 200, 'any member rewrites a folder’s description (spec 7.4)')
    expect(
      (await deskOf(newcomer)).description,
      'the person’s words replace Dana’s',
    ).toBe('Everything I have not filed yet')

    expectStatus(
      await newcomer.browser.json(`/folders/${desk.id}`, 'PATCH', {
        description: null,
      }),
      200,
      'and they can empty it',
    )
    expect(
      (await deskOf(newcomer)).description,
      'a default is not restored behind the person’s back: they cleared it and it stays clear',
    ).toBeNull()
  })
})
