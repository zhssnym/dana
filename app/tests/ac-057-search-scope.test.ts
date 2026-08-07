/*
AC-057: given a query matching tasks in accessible and inaccessible folders
across all three statuses, then search returns only accessible rows grouped
pending, abandoned, completed.

"Grouped" is a word about rendering and Q8 answers a flat list, so what the
criterion asks for is Q8's order: status_rank with completed = 2, then
updated_at descending, then id descending. The fixture makes the two
comparators disagree, giving the completed rows the most recent updated_at
values of all, so an implementation sorting by recency alone leads with them
and an implementation sorting only by status leaves the rest in whatever
order the planner chose.

The scope clause is the one that matters most and it is asserted twice over.
The inaccessible rows are seeded with the same needle in the title, in a
folder owned by an account this viewer has no membership in, so a search that
forgot ACCESSIBLE(V) would find them; and the owner of that folder is asked
the same question, so the rows are shown to be findable by someone, which is
what stops the assertion from passing against a search that finds nothing at
all.

Q8's own reach is attacked beside the criterion: the pattern is '%' q '%', so
a match in the middle of a word counts and a prefix-only implementation
fails; ILIKE, so case is not a filter; and title OR notes, so a needle
present only in the notes is found.

The wildcard escaping ruled at the P4 change control on 2026-08-07 is
asserted here too, and the choice of where is this session's rather than the
Steward's, which routed it. It is asserted rather than left open because it
is now Q8's text and nothing else measures it; a backslash, percent or
underscore inside q is escaped before interpolation, so "50%" matches text
holding those three characters instead of everything holding "50". It is
asserted here rather than under a seventh appended number because it is a
property of Q8's predicate, which is what this file already measures, and
because the six numbers the Steward took each close a number stated in the
specification and asserted nowhere, which this is not: it is a rule about how
one predicate is built. Covering it as an adversarial case still gates P4,
since AC-057 must pass for the package to be done. If the Steward would
rather it carried a number, the three cases below move without changing.

The three cases are two-way rather than one-way. Each pairs a row that only
the escaped pattern finds with a row the leaking pattern reaches and the
escaped one does not, so a failure says which of the two an implementation
built rather than only that the count was wrong. All three were measured
against real Postgres before being asserted, both patterns against all six
titles: percent and underscore make the leaking pattern return two rows where
the escaped one returns the literal row alone, and the backslash swaps the
answer outright, the leaking pattern returning the row without the backslash
and missing the row the user typed.

Spec: 6 Q8 (input, predicate, sort, pagination, and the escaping ruled on
2026-08-07), 4.12 (the trigram index), 10.2, 7.10.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast, createFolder } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import { expectTaskInvariants } from './tasks-harness.js'
import {
  idsOf,
  middayZone,
  search,
  seedViewTask,
  titlesOf,
} from './views-harness.js'
import type { SeedViewTaskOptions } from './views-harness.js'

let app: AuthTestApp
const cast = new Cast(['viewer', 'stranger'], 'p4')

const tz = middayZone()
const MINUTE = 60_000

/** Deliberately mid-word in every title below, so a prefix match fails. */
const NEEDLE = 'quarterlyreport'

interface Stage {
  viewer: Actor
  stranger: Actor
  mineId: string
  theirsId: string
  expected: string[]
  hiddenPending: string
  hiddenCompleted: string
  notesOnly: string
  mixedCase: string
  noMatch: string
  /*
  Three pairs for the escaping ruled on 2026-08-07. In each pair the first
  row is found only when q's wildcards are literal and the second only when
  they leak into the pattern, so the two readings are told apart in both
  directions rather than by a count.
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
    const [viewer, stranger] = await cast.of(app)
    if (viewer === undefined || stranger === undefined) {
      throw new Error('cast must produce two actors')
    }
    const mineId = await createFolder(viewer, 'p4 ac057 mine')
    const theirsId = await createFolder(stranger, 'p4 ac057 theirs')

    const at = (minutesAgo: number) =>
      new Date(Date.now() - minutesAgo * MINUTE).toISOString()
    const mine = (
      options: Omit<SeedViewTaskOptions, 'folderId' | 'createdBy'>,
    ) =>
      seedViewTask(app.db, {
        ...options,
        folderId: mineId,
        createdBy: viewer.id,
        assigneeId: viewer.id,
      })

    // The completed rows carry the newest updated_at of the whole fixture,
    // so status_rank and recency point in opposite directions.
    const completedNewest = await mine({
      title: `draft ${NEEDLE} v3`,
      status: 'completed',
      updatedAt: at(1),
    })
    const completedOlder = await mine({
      title: `draft ${NEEDLE} v2`,
      status: 'completed',
      updatedAt: at(2),
    })
    const abandonedRow = await mine({
      title: `abandoned ${NEEDLE} plan`,
      status: 'abandoned',
      updatedAt: at(30),
    })
    const pendingNewer = await mine({
      title: `open ${NEEDLE} follow-up`,
      updatedAt: at(40),
    })
    const pendingOlder = await mine({
      title: `open ${NEEDLE} outline`,
      updatedAt: at(80),
    })
    const notesOnly = await mine({
      title: 'p4 ac057 nothing in the title',
      notes: `the ${NEEDLE} lives only in the notes`,
      updatedAt: at(50),
    })
    const mixedCase = await mine({
      title: `Open ${NEEDLE.toUpperCase()} shouted`,
      updatedAt: at(60),
    })
    const noMatch = await mine({
      title: 'p4 ac057 unrelated row',
      updatedAt: at(1),
    })

    /*
    Distinctive tokens, so no other row in the fixture can satisfy either
    reading by accident. Each pair is a query and the two rows the two
    readings pick out.

    q = "zpct50%". Escaped, the pattern is %zpct50\%% and matches the literal
    row alone; leaking, it is %zpct50%% and matches anything holding "zpct50",
    which is both.

    q = "zund_x". Escaped, %zund\_x% matches the literal row alone; leaking,
    the underscore matches any single character, which is both.

    q = "zbsl\y". This pair swaps rather than widening. Escaped, %zbsl\\y%
    matches the literal backslash and nothing else; leaking, Postgres reads
    the backslash as LIKE's own escape character, so \y means a plain "y" and
    the pattern matches "zbsly" and misses "zbsl\y" entirely. A wrong
    implementation here returns a row rather than too many, which is the one
    of the three that could not be mistaken for an over-broad match.
    */
    const literalPercent = await mine({
      title: 'p4 ac057 zpct50% marker',
      updatedAt: at(70),
    })
    const plainPercent = await mine({
      title: 'p4 ac057 zpct50 marker',
      updatedAt: at(70),
    })
    const literalUnderscore = await mine({
      title: 'p4 ac057 zund_x marker',
      updatedAt: at(70),
    })
    const otherUnderscore = await mine({
      title: 'p4 ac057 zundQx marker',
      updatedAt: at(70),
    })
    const literalBackslash = await mine({
      title: 'p4 ac057 zbsl\\y marker',
      updatedAt: at(70),
    })
    const plainBackslash = await mine({
      title: 'p4 ac057 zbsly marker',
      updatedAt: at(70),
    })

    // The stranger's folder: the same needle, no membership for the viewer.
    const hiddenPending = await seedViewTask(app.db, {
      folderId: theirsId,
      createdBy: stranger.id,
      assigneeId: stranger.id,
      title: `secret ${NEEDLE} pending`,
      updatedAt: at(3),
    })
    const hiddenCompleted = await seedViewTask(app.db, {
      folderId: theirsId,
      createdBy: stranger.id,
      assigneeId: stranger.id,
      title: `secret ${NEEDLE} completed`,
      status: 'completed',
      updatedAt: at(3),
    })

    staged = {
      viewer,
      stranger,
      mineId,
      theirsId,
      expected: [
        pendingNewer,
        mixedCase,
        notesOnly,
        pendingOlder,
        abandonedRow,
        completedNewest,
        completedOlder,
      ],
      hiddenPending,
      hiddenCompleted,
      notesOnly,
      mixedCase,
      noMatch,
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

describe('AC-057: search is scoped to accessible folders and ordered by status', () => {
  test('AC-057: the whole sequence is status_rank, updated_at descending, id descending', async () => {
    const { viewer, expected } = await stage()
    const body = await search(viewer, tz, NEEDLE)
    expect(
      idsOf(body.rows),
      '6 Q8 sorts by status_rank with completed = 2, so the three statuses come out as pending, abandoned, completed, and only then by updated_at descending. The completed rows here carry the newest updated_at in the fixture, so an implementation sorting by recency alone leads with them',
    ).toEqual(expected)
  })

  test('AC-057: the three statuses arrive in the order the criterion names', async () => {
    const { viewer } = await stage()
    const body = await search(viewer, tz, NEEDLE)
    const ranks = body.rows.map((row) =>
      ['pending', 'abandoned', 'completed'].indexOf(row.status),
    )
    expect(
      ranks,
      'every status is one of the three of 4.5, and each was found',
    ).not.toContain(-1)
    expect(
      [...ranks].sort((a, b) => a - b),
      'and the ranks never decrease down the list, which is what grouping means for a flat array',
    ).toEqual(ranks)
  })

  test('AC-057: no row from an inaccessible folder appears', async () => {
    const { viewer, hiddenPending, hiddenCompleted } = await stage()
    const body = await search(viewer, tz, NEEDLE)
    const found = idsOf(body.rows)
    expect(
      found,
      'Q8\'s predicate opens with folder_id IN ACCESSIBLE(V), and 10.2 makes that the chokepoint every read passes; a search that reached the trigram index before the scope would find these two',
    ).not.toContain(hiddenPending)
    expect(
      found,
      'and the completed one, which an implementation scoping only its open statuses would still leak',
    ).not.toContain(hiddenCompleted)
    expect(
      titlesOf(body.rows).filter((title) => title.startsWith('secret ')),
      'stated on the titles too, because an id assertion says nothing about what a wrong response would have shown',
    ).toEqual([])
  })

  test('AC-057: the same rows are findable by the account that owns them', async () => {
    const { stranger, hiddenPending, hiddenCompleted } = await stage()
    const body = await search(stranger, tz, NEEDLE)
    expect(
      idsOf(body.rows),
      'without this the exclusion above would pass against a search that finds nothing for anyone',
    ).toEqual([hiddenPending, hiddenCompleted])
  })

  test('AC-057 adversarial: the match is a substring, not a prefix', async () => {
    const { viewer, expected } = await stage()
    const body = await search(viewer, tz, NEEDLE.slice(4, 12))
    expect(
      idsOf(body.rows),
      `6 Q8 builds the pattern as '%' q '%', so a fragment from the middle of the needle matches every row the whole needle did; a prefix-anchored LIKE finds none of them`,
    ).toEqual(expected)
  })

  test('AC-057 adversarial: the match ignores case, in both directions', async () => {
    const { viewer, expected, mixedCase } = await stage()
    const shouted = await search(viewer, tz, NEEDLE.toUpperCase())
    expect(
      idsOf(shouted.rows),
      '6 Q8 uses ILIKE, so an uppercase query finds lowercase titles',
    ).toEqual(expected)
    const quiet = await search(viewer, tz, NEEDLE.toLowerCase())
    expect(
      idsOf(quiet.rows),
      'and a lowercase query finds the uppercase title, which is the direction an implementation lowercasing only one side gets wrong',
    ).toContain(mixedCase)
  })

  test('AC-057 adversarial: a needle only in the notes is found', async () => {
    const { viewer, notesOnly } = await stage()
    const body = await search(viewer, tz, 'lives only in the notes')
    expect(
      idsOf(body.rows),
      '6 Q8 matches title ILIKE pattern OR notes ILIKE pattern; dropping the second arm loses every task whose text is in the body',
    ).toEqual([notesOnly])
  })

  test('AC-057 adversarial: a non-matching row is not swept in', async () => {
    const { viewer, noMatch } = await stage()
    const body = await search(viewer, tz, NEEDLE)
    expect(
      idsOf(body.rows),
      'this row has the newest updated_at of anything in the folder, so a search returning the folder in recency order would put it first',
    ).not.toContain(noMatch)
  })

  test('AC-057 adversarial: a percent in the query is literal', async () => {
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

  test('AC-057 adversarial: an underscore in the query is literal', async () => {
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

  test('AC-057 adversarial: a backslash in the query is literal', async () => {
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

  test('AC-057: the fixture satisfies section 3', async () => {
    const { viewer, stranger, mineId, theirsId, expected, hiddenPending } =
      await stage()
    await expectTaskInvariants(
      app.db,
      [...expected, hiddenPending],
      [mineId, theirsId],
      [viewer.id, stranger.id],
    )
  })
})
