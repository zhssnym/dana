/*
AC-128 (proposed): given a search query that is shorter than 2 or longer than
100 characters after trimming, then 422 naming the field; given 2 and given
100, then 200.

The number is proposed, not assigned; numbering section 12 is the human
owner's, and the criterion text above is the transcription an amendment would
take. 6 Q8 opens with the rule, "Input: q, trimmed, 2 to 100 characters, else
422", and 10.3 carries the same numbers in the table it calls server-enforced
and returned as 422 with the field named. Nothing in section 12 asserts
either bound.

The lower bound is not decoration. Q8's pattern is '%' q '%' over a trigram
index, so a one-character query is a scan of every accessible task in the
account with a pattern the index cannot help, which is the reason the floor
exists and the reason an implementation that quietly answered it would look
correct until the row counts grew.

Trimming is asserted in both directions, because it is one operation with two
observable consequences and an implementation can do half of it: a query of
spaces around one character is short and must be refused, while a query of
spaces around a real needle must match the needle rather than the spaces.

Both bounds are asserted beside the value that is one step inside them, in
the same case, because before the routes land every path answers 404 and a
refusal asserted alone would pass today against an endpoint that was never
mounted.

Spec: 6 Q8, 10.3, 7.0 (the 422 envelope with the field named).
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast, createFolder, expectStatus } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import { getView, idsOf, middayZone, search, seedViewTask } from './views-harness.js'

let app: AuthTestApp
const cast = new Cast(['viewer'], 'p4')

const tz = middayZone()
const MIN = 2
const MAX = 100

/** Long enough to sit on the upper bound, and a single run of one letter so
 * that a prefix of it is still a matching substring. */
const LONG_NEEDLE = 'x'.repeat(MAX)

interface Stage {
  viewer: Actor
  folderId: string
  shortMatch: string
  longMatch: string
}
let staged: Stage | undefined

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const [viewer] = await cast.of(app)
    if (viewer === undefined) throw new Error('cast must produce one actor')
    const folderId = await createFolder(viewer, 'p4 ac128 haystack')
    const shortMatch = await seedViewTask(app.db, {
      folderId,
      createdBy: viewer.id,
      assigneeId: viewer.id,
      title: 'p4 ac128 zq marks the shortest needle',
    })
    const longMatch = await seedViewTask(app.db, {
      folderId,
      createdBy: viewer.id,
      assigneeId: viewer.id,
      // 300 is the 10.3 title ceiling, so a 100-character needle fits.
      title: `p4 ac128 long ${LONG_NEEDLE}`,
    })
    staged = { viewer, folderId, shortMatch, longMatch }
  }
  return staged
}

function searchRaw(actor: Actor, q: string) {
  return getView(actor, '/search', { tz, q })
}

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-128: the search query is 2 to 100 characters after trimming', () => {
  test('AC-128: two characters are accepted and one is refused', async () => {
    const { viewer, shortMatch } = await stage()
    const accepted = await search(viewer, tz, 'zq')
    expect(
      idsOf(accepted.rows),
      `6 Q8 admits a query of ${String(MIN)} characters, and it must find what it matches rather than merely answering 200`,
    ).toContain(shortMatch)

    const refused = await searchRaw(viewer, 'z')
    expectStatus(
      refused,
      422,
      '6 Q8: q is 2 to 100 characters, else 422. One character over a trigram index is a scan of every accessible task with a pattern the index cannot help, which is what the floor exists for',
    )
  })

  test('AC-128: one hundred characters are accepted and one hundred and one are refused', async () => {
    const { viewer, longMatch } = await stage()
    const accepted = await search(viewer, tz, LONG_NEEDLE)
    expect(
      idsOf(accepted.rows),
      `6 Q8 admits a query of ${String(MAX)} characters, the fixture carrying a title that contains one`,
    ).toContain(longMatch)

    const refused = await searchRaw(viewer, `${LONG_NEEDLE}x`)
    expectStatus(
      refused,
      422,
      '10.3 caps the search query at 100 characters and calls every number in that table server-enforced',
    )
  })

  test('AC-128: an empty query is refused', async () => {
    const { viewer } = await stage()
    expectStatus(
      await searchRaw(viewer, ''),
      422,
      'the empty query is below the floor like any other short one; it is asserted separately because an implementation checking for a missing parameter and an implementation checking a length are different code, and only one of them catches this',
    )
  })

  test('AC-128: the length is measured after trimming', async () => {
    const { viewer } = await stage()
    expectStatus(
      await searchRaw(viewer, '   z   '),
      422,
      '6 Q8 trims before measuring, so seven characters of which one is not whitespace is a query of one',
    )
  })

  test('AC-128: and the trimmed value is what gets matched', async () => {
    const { viewer, shortMatch } = await stage()
    const body = await search(viewer, tz, '  zq  ')
    expect(
      idsOf(body.rows),
      'trimming is one operation with two consequences, and an implementation can do half of it: a query padded with spaces must match the needle rather than searching for the spaces, which the pattern would otherwise carry into the ILIKE',
    ).toContain(shortMatch)
  })

  test('AC-128: the refusal carries the 7.0 envelope naming the field', async () => {
    const { viewer } = await stage()
    const refused = await searchRaw(viewer, 'z')
    expectStatus(refused, 422, 'the one-character query is refused')
    const envelope = refused.json() as {
      error?: { code?: unknown; message?: unknown }
    }
    expect(
      typeof envelope.error?.code === 'string' &&
        (envelope.error.code as string).length > 0,
      '7.0 gives every 4xx the envelope { error: { code, message } } with both non-empty (AC-117)',
    ).toBe(true)
    expect(
      JSON.stringify(refused.json()).toLowerCase(),
      '10.3 returns its limits as 422 with the field named, and this endpoint\'s field is q',
    ).toMatch(/\bq\b|query/)
  })
})
