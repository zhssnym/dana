/*
AC-377: given a description in the body of POST /folders, then the 201 Folder
object carries it and a fresh read gives back the same sentence; given a body
naming only a name, then the description is null, as it is for every folder
made before 7.4's paragraph of 2026-09-04; and given a description over 500
characters, then 422 naming the field, with no folder created.

This is issues #21 and #70. A new folder starts with a sentence rather than an
empty line, and the sentence is written by the create because the gesture that
makes a folder is one request: AC-279 reads every mutation the hold writes and
admits `POST /folders` plus the task moves and nothing else, so the batch's
first spelling of this feature, a `PATCH /folders/:id` sent the moment the POST
answered, was not a slower version of it but a different act.

**The class of defect this exists to catch is the one the backend README names
first.** `description` is a field on a request schema, and a request field the
route does not read is stripped, dropped, and answered 200, which looks exactly
like the feature working from every surface a person can see. Nothing else in
the suite would notice: the response schema already carried `description`
because the PATCH writes it, so the contract test parses a null happily and the
compiler has nothing to say. Only reading the value back catches it, which is
what the first case here does, and it is why the read is a second request
rather than the 201's own body alone.

**The absent and the explicit-null arms are separate on purpose.** They are the
same NULL in the row and different bodies on the wire, and a schema that made
the field non-nullable would pass the first and fail the second.

**The boundary is asserted on both sides of 500**, the number 4.3's
`folders_description_length_check` and 10.3 both carry: at 500 the create
succeeds, at 501 it is refused. A length rule written as `< 500` is the
ordinary way to be one character wrong and is invisible to any case that only
tries a short sentence and a very long one.

Spec: 7.4 (the create body, as of its 2026-09-04 paragraph), 4.3
(`description`, up to 500), 10.3 (the 422), 7.0 (the envelope).
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast, countRows, expectStatus } from './folders-harness.js'
import type { Actor } from './folders-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner'], 'ac377')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

interface FolderBody {
  id: string
  name: string
  description: string | null
}

/** The sentence the client's `defaultFolderDescription` writes, restated
 * rather than imported: this asserts the endpoint, and a shared constant
 * would let a change to the client's wording quietly change what is under
 * test here. */
const SENTENCE = 'Tasks, notes, and plans for AC-377 the wedding.'

async function created(
  actor: Actor,
  body: Record<string, unknown>,
  why: string,
): Promise<FolderBody> {
  const response = await actor.browser.json('/folders', 'POST', body)
  expectStatus(response, 201, why)
  return response.json() as FolderBody
}

async function readBack(actor: Actor, id: string): Promise<FolderBody> {
  const response = await actor.browser.api(`/folders/${id}`)
  expectStatus(response, 200, 'the folder reads back (spec 7.4)')
  return response.json() as FolderBody
}

describe('AC-377 a new folder starts with the sentence its create was given', () => {
  test('the description rides the create, and a fresh read gives it back', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const made = await created(
      owner,
      { name: 'ac377 described', description: SENTENCE },
      'POST /folders takes a description beside the name (spec 7.4, 2026-09-04)',
    )
    expect(
      made.description,
      'the 201 answers the Folder object the create produced, description included',
    ).toBe(SENTENCE)

    const read = await readBack(owner, made.id)
    expect(
      read.description,
      'and the row holds it: a request field the route does not read is stripped, ' +
        'dropped and answered 200, so the 201 alone proves nothing',
    ).toBe(SENTENCE)
  })

  test('a create naming only a name leaves the description null, and so does an explicit null', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const bare = await created(
      owner,
      { name: 'ac377 bare' },
      'the field is optional: the create that every caller sent before still works',
    )
    expect(
      bare.description,
      'absent is NULL, which is what every folder made before this carries',
    ).toBeNull()
    expect(
      (await readBack(owner, bare.id)).description,
      'and the read agrees with the create',
    ).toBeNull()

    const cleared = await created(
      owner,
      { name: 'ac377 explicit null', description: null },
      'the field is nullable as well as optional (7.4, 4.3)',
    )
    expect(
      cleared.description,
      'an explicit null is the same NULL, a different body on the wire',
    ).toBeNull()
  })

  test('500 characters is admitted; 501 is 422 naming the field, and no folder is made', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const atLimit = await created(
      owner,
      { name: 'ac377 at the limit', description: 'x'.repeat(500) },
      "500 characters is 4.3's limit and is admitted (10.3)",
    )
    expect(atLimit.description?.length, 'stored whole').toBe(500)

    const tooLong = await owner.browser.json('/folders', 'POST', {
      name: 'ac377 over the limit',
      description: 'x'.repeat(501),
    })
    expectStatus(tooLong, 422, 'one character over the limit is refused (10.3)')
    const envelope = tooLong.json() as { error: { code: string; message: string } }
    expect(envelope.error.code, 'the 7.0 code for a body the schema refuses').toBe(
      'validation_failed',
    )
    expect(
      envelope.error.message,
      '10.3: the 422 names the field that failed, so a caller can act on it',
    ).toContain('description')

    expect(
      await countRows(
        app.db,
        sql`SELECT count(*)::int AS n FROM folders
            WHERE owner_id = ${owner.id} AND name = ${'ac377 over the limit'}`,
      ),
      'a refused create writes no folder: the whole of it is one request',
    ).toBe(0)
  })
})
