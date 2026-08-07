/*
AC-131: given a search query containing a percent, an underscore, or a
backslash, then those characters match themselves and the row carrying the
literal character is returned while the row that only satisfies the wildcard
reading is not.

The rule is 6 Q8's, ruled at the P4 change control on 2026-08-07: a
backslash, percent or underscore inside q is escaped before it is
interpolated, so "50%" matches text holding those three characters rather
than everything holding "50". Without it the pattern syntax leaks into the
search box, where nothing tells a user it is there.

These three cases were written inside AC-057 and moved here unchanged when
the Steward numbered the rule, which is why the file is new and the
assertions are not. The judgment they were written under held that escaping
is a property of Q8's predicate, which AC-057 already measures, unlike the
six numbers appended beside it, each of which closes a number the
specification states and asserts nowhere. That was right when it was made and
is superseded rather than contradicted: escaping was a silence when those six
were authored and became a rule the specification states once the change
control ruled it, which is the standard the six were admitted under. Section
12 is the definition of done, and a reader of it should be able to see this
behavior is required without opening a test file to find it.

The three cases are two-way rather than one-way. Each pairs a row that only
the escaped pattern finds with a row the leaking pattern reaches and the
escaped one does not, so a failure says which of the two readings an
implementation built rather than only that the count was wrong. All three
were measured against real Postgres before being asserted, both patterns
against all six titles.

The backslash is the case worth keeping apart from the other two, because it
fails in the opposite direction. Percent and underscore make a leaking
pattern return an extra row. An unescaped backslash is read as LIKE's own
escape character, so the pattern finds the row without the backslash and
misses the row the user typed: a leak that loses the right answer instead of
adding wrong ones, and the harder of the two to notice in use.

Distinctive tokens throughout, so no other row in this fixture or any other
can satisfy either reading by accident.

Spec: 6 Q8 (the predicate and the escaping ruled on 2026-08-07), 4.12 (the
trigram index, which sees trigrams either way), 7.10.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast, createFolder } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import { expectTaskInvariants } from './tasks-harness.js'
import { idsOf, middayZone, search, seedViewTask } from './views-harness.js'

let app: AuthTestApp
const cast = new Cast(['viewer'], 'p4')

const tz = middayZone()

interface Stage {
  viewer: Actor
  folderId: string
  /*
  Three pairs. In each, the first row is found only when q's wildcards are
  literal and the second only when they leak into the pattern, so the two
  readings are told apart in both directions rather than by a count.

  q = "zpct50%". Escaped, the pattern is %zpct50\%% and matches the literal
  row alone; leaking, it is %zpct50%% and matches anything holding "zpct50",
  which is both.

  q = "zund_x". Escaped, %zund\_x% matches the literal row alone; leaking,
  the underscore matches any single character, which is both.

  q = "zbsl\y". This pair swaps rather than widening. Escaped, %zbsl\\y%
  matches the literal backslash and nothing else; leaking, Postgres reads the
  backslash as LIKE's own escape character, so \y means a plain "y" and the
  pattern matches "zbsly" and misses "zbsl\y" entirely.
  */
  literalPercent: string
  plainPercent: string
  literalUnderscore: string
  otherUnderscore: string
  literalBackslash: string
  plainBackslash: string
}
let staged: Stage | undefined

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const [viewer] = await cast.of(app)
    if (viewer === undefined) throw new Error('cast must produce one actor')
    const folderId = await createFolder(viewer, 'p4 ac131 haystack')
    const mine = (title: string) =>
      seedViewTask(app.db, {
        folderId,
        createdBy: viewer.id,
        assigneeId: viewer.id,
        title,
      })

    const literalPercent = await mine('p4 ac131 zpct50% marker')
    const plainPercent = await mine('p4 ac131 zpct50 marker')
    const literalUnderscore = await mine('p4 ac131 zund_x marker')
    const otherUnderscore = await mine('p4 ac131 zundQx marker')
    const literalBackslash = await mine('p4 ac131 zbsl\\y marker')
    const plainBackslash = await mine('p4 ac131 zbsly marker')

    staged = {
      viewer,
      folderId,
      literalPercent,
      plainPercent,
      literalUnderscore,
      otherUnderscore,
      literalBackslash,
      plainBackslash,
    }
  }
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

describe('AC-131: a wildcard the user typed matches itself', () => {
  test('AC-131: a percent in the query is literal', async () => {
    const { viewer, literalPercent, plainPercent } = await stage()
    const body = await search(viewer, tz, 'zpct50%')
    expect(
      idsOf(body.rows),
      '6 Q8 as ruled on 2026-08-07: a percent inside q is escaped before it is interpolated, so this matches text holding "zpct50%" rather than everything holding "zpct50". Unescaped the pattern is %zpct50%% and the plain row comes back too, which is a user searching for a discount and being handed the catalogue',
    ).toEqual([literalPercent])
    expect(
      idsOf(body.rows),
      'and the row that only the leaking pattern reaches is named, so a failure says which reading was built',
    ).not.toContain(plainPercent)
  })

  test('AC-131: an underscore in the query is literal', async () => {
    const { viewer, literalUnderscore, otherUnderscore } = await stage()
    const body = await search(viewer, tz, 'zund_x')
    expect(
      idsOf(body.rows),
      '6 Q8 as ruled on 2026-08-07: an underscore inside q is escaped too, so "a_b" matches that literal underscore rather than any character between a and b. Unescaped this also returns the row spelling the same token with a Q in the middle',
    ).toEqual([literalUnderscore])
    expect(
      idsOf(body.rows),
      'the any-character row is the one the leak would add',
    ).not.toContain(otherUnderscore)
  })

  test('AC-131: a backslash in the query is literal', async () => {
    const { viewer, literalBackslash, plainBackslash } = await stage()
    const body = await search(viewer, tz, 'zbsl\\y')
    expect(
      idsOf(body.rows),
      '6 Q8 as ruled on 2026-08-07 escapes the backslash as well, and this is the case that fails in the other direction: unescaped, Postgres reads the backslash as LIKE\'s own escape character, so the pattern means a plain "zbsly", finds the row without the backslash, and misses the one the user typed. A leak that loses the right row rather than adding wrong ones is the harder of the two to notice in use',
    ).toEqual([literalBackslash])
    expect(
      idsOf(body.rows),
      'the row an unescaped backslash would have found instead',
    ).not.toContain(plainBackslash)
  })

  test('AC-131: the fixture satisfies section 3', async () => {
    const { viewer, folderId, literalPercent, plainPercent } = await stage()
    await expectTaskInvariants(
      app.db,
      [literalPercent, plainPercent],
      [folderId],
      [viewer.id],
    )
  })
})
