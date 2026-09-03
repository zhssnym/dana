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

**The sentence is also asserted against the client's copy of it (issue #97).**
`routes.ts` draws it under Desk in the sidebar and in the 9.7 pin list;
`provisioning.ts` writes it into the folder. Nothing joined the two until the
wording changed on issue #21 and only the client moved, which is the failure
#97 predicted: both criteria stayed green while a new account's Desk
contradicted the page it hangs in. The second case reads the client's file as
text, because neither side may import the other.

Spec: 4.3, 7.1, 7.4; issues #68 and #97.
*/
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { DESK_DEFAULT_DESCRIPTION } from '../src/server/auth/provisioning.js'

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
    ).toBe('A home for things you have not sorted yet.')

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

  test('the sentence provisioning writes is the sentence the client draws (issue #97)', () => {
    /*
    Read as text rather than imported. `routes.ts` reaches `lib/icons.tsx`,
    and this project (tsconfig.server.json) has no JSX and is not meant to
    have any; the eslint boundary forbids the import in the other direction.
    The shape read is the `navPages` entry keyed `desk` and its `question`.
    A regex that stops matching fails loudly, `undefined` being equal to no
    sentence, rather than passing on nothing.
    */
    const routes = readFileSync(
      fileURLToPath(new URL('../src/client/routes.ts', import.meta.url)),
      'utf8',
    )
    const desk = /key:\s*'desk'[\s\S]*?question:\s*(?:'([^']*)'|"([^"]*)")/.exec(routes)
    const clientSentence = desk?.[1] ?? desk?.[2]
    expect(
      clientSentence,
      'routes.ts still declares Desk with a question, in the shape this case reads',
    ).toBeDefined()
    expect(
      DESK_DEFAULT_DESCRIPTION,
      'issue #97: what provisioning writes into a new Desk is what the sidebar says under it. ' +
        'A rewording of routes.ts that leaves this constant behind gives every new account a ' +
        'folder that disagrees with the page it is, and nothing else fails',
    ).toBe(clientSentence)
  })
})
