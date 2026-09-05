/*
AC-314: a person's own description under one of Dana's place pages is stored,
read back, private to them, cleared by emptying it, refused past 500
characters, and refused to a caller with no session.

Issue #68, from #21, closed the gap the old People-only
`pages/page-heading.tsx` made visible beside the storage-owning
`components/page-head.tsx`: 9.4 names an "editable description" in terms, and
until 4.22 there was no column anywhere to put one, so place pages drew Dana's
fixed sentence instead. The client keeps that sentence; what this criterion
asserts is that the server can hold the person's replacement for it and give
it back. Issue #84 later removed that duplicate heading and left editable
wording with `PageHead`, while People uses its fixed `PageHeading` variation.

**The read is dense, and that is the load-bearing half of the shape.** Every
one of 4.22's eight places answers, carrying null where nothing was written,
so the client maps place to description without having to decide what a
missing entry meant. A sparse list would make "not written" and "not a place
this endpoint knows" the same answer, and the second is a 404 elsewhere on
this surface.

**Null and whitespace are one act.** The field is a textarea; a person who
selects their sentence and deletes it has cleared it whether the browser
sends null or two spaces. Both must restore Dana's own sentence, which on
this side of the wire means both must read back null.

**Private to the signed-in person**, which is the clause with teeth: two
people writing about Today must not see each other's words, for the same
reason 4.20's covers are per viewer.

**The unauthenticated read is asserted here because nothing else asserts
it.** AC-236 sweeps mutating routes only, so a GET that forgot its session
check would pass the entire suite while answering every caller alike.

Spec: 4.22, 7.21, 9.4; issues #68 and #21.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast, expectStatus } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import { TestBrowser } from './http-client.js'

let app: AuthTestApp
const cast = new Cast(['author', 'partner'], 'i68')

interface DescriptionEntry {
  place?: unknown
  description?: unknown
}

/* 4.22's set, transcribed here rather than imported: this file measures the
   contract and must not borrow its definition of correct from the module
   under test. */
const PLACES = [
  'today',
  'scheduled',
  'assignments',
  'important',
  'all',
  'done',
  'abandoned',
  'anytime',
]

async function descriptionsOf(actor: Actor): Promise<DescriptionEntry[]> {
  const response = await actor.browser.json('/place-descriptions', 'GET')
  expectStatus(
    response,
    200,
    'the caller reads their own place descriptions (spec 7.21)',
  )
  const body = response.json() as { descriptions?: DescriptionEntry[] }
  return body.descriptions ?? []
}

function descriptionFor(entries: DescriptionEntry[], place: string): unknown {
  return entries.find((entry) => entry.place === place)?.description
}

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-314 a place page carries the person’s own description', () => {
  test('every place answers, a written sentence reads back, clearing restores the default, and it is nobody else’s', async () => {
    const [author, partner] = (await cast.of(app)) as [Actor, Actor]

    const fresh = await descriptionsOf(author)
    expect(
      fresh.map((entry) => entry.place),
      'the read names every one of 4.22’s places, so null can mean “Dana’s own sentence” rather than “no such page”',
    ).toEqual(PLACES)
    expect(
      fresh.map((entry) => entry.description),
      'a fresh account has written nothing anywhere',
    ).toEqual(PLACES.map(() => null))

    const written = await author.browser.json(
      '/place-descriptions/today',
      'PUT',
      { description: 'My main focus for today' },
    )
    expectStatus(written, 200, 'a description is written (spec 7.21)')
    expect(written.json(), 'the write answers the entry it stored').toEqual({
      place: 'today',
      description: 'My main focus for today',
    })
    expect(
      descriptionFor(await descriptionsOf(author), 'today'),
      'and the next read carries it',
    ).toBe('My main focus for today')
    expect(
      descriptionFor(await descriptionsOf(author), 'scheduled'),
      'a place nobody wrote about still answers, with null',
    ).toBeNull()

    expectStatus(
      await author.browser.json('/place-descriptions/today', 'PUT', {
        description: '  Everything I am carrying today  ',
      }),
      200,
      'a second write replaces the first',
    )
    expect(
      descriptionFor(await descriptionsOf(author), 'today'),
      'the last write stands, trimmed of the whitespace a textarea leaves behind',
    ).toBe('Everything I am carrying today')

    // Private to the signed-in person, which is the clause the table exists
    // for.
    expectStatus(
      await partner.browser.json('/place-descriptions/today', 'PUT', {
        description: 'What I owe other people today',
      }),
      200,
      'the partner writes their own on the same place',
    )
    expect(
      descriptionFor(await descriptionsOf(partner), 'today'),
      'the partner reads their own',
    ).toBe('What I owe other people today')
    expect(
      descriptionFor(await descriptionsOf(author), 'today'),
      'and the author’s is untouched by it',
    ).toBe('Everything I am carrying today')

    // Clearing, both ways a client can spell it.
    expectStatus(
      await author.browser.json('/place-descriptions/today', 'PUT', {
        description: null,
      }),
      200,
      'null clears it (spec 7.21)',
    )
    expect(
      descriptionFor(await descriptionsOf(author), 'today'),
      'a cleared description reads null, so the client draws Dana’s own sentence again',
    ).toBeNull()

    expectStatus(
      await partner.browser.json('/place-descriptions/today', 'PUT', {
        description: '   ',
      }),
      200,
      'and so does a field emptied to whitespace',
    )
    expect(
      descriptionFor(await descriptionsOf(partner), 'today'),
      'whitespace is an empty field, not a description made of spaces',
    ).toBeNull()

    expectStatus(
      await author.browser.json('/place-descriptions/today', 'PUT', {
        description: null,
      }),
      200,
      'clearing what is already clear changes nothing and is not an error',
    )
  })

  test('the limit, the unknown place, the missing field, and the caller with no session', async () => {
    const [author] = (await cast.of(app)) as [Actor, Actor]
    const atTheLimit = 'x'.repeat(500)

    expectStatus(
      await author.browser.json('/place-descriptions/all', 'PUT', {
        description: atTheLimit,
      }),
      200,
      '500 characters is folders’ and shelves’ limit and it is admitted here',
    )
    expectStatus(
      await author.browser.json('/place-descriptions/all', 'PUT', {
        description: `${atTheLimit}x`,
      }),
      422,
      'one past the limit is refused by the schema rather than by the database',
    )
    expect(
      descriptionFor(await descriptionsOf(author), 'all'),
      'and the refused write left the stored one exactly as it was',
    ).toBe(atTheLimit)

    expectStatus(
      await author.browser.json('/place-descriptions/all', 'PUT', {}),
      422,
      'a body naming no description is refused: an ignored field would be accepted and dropped with a 200',
    )
    expectStatus(
      await author.browser.json('/place-descriptions/desk', 'PUT', {
        description: 'Desk is a folder',
      }),
      404,
      'Desk is a folder and carries 4.3’s own description column; it is not one of 4.22’s places',
    )
    expectStatus(
      await author.browser.json('/place-descriptions/nowhere', 'PUT', {
        description: 'a place that does not exist',
      }),
      404,
      'an unknown place says nothing further, a place page being furniture rather than a resource that might exist elsewhere',
    )

    const stranger = new TestBrowser(app.origin)
    expectStatus(
      await stranger.json('/place-descriptions', 'GET'),
      401,
      'the read needs a session: AC-236 sweeps mutating routes only, so nothing else asserts this',
    )
    expectStatus(
      await stranger.json('/place-descriptions/today', 'PUT', {
        description: 'not mine to write',
      }),
      401,
      'and so does the write',
    )

    expectStatus(
      await author.browser.json('/place-descriptions/all', 'PUT', {
        description: null,
      }),
      200,
      'and the file leaves nothing of its own behind',
    )
  })
})
