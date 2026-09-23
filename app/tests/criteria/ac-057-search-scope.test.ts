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

Q8's wildcard escaping is AC-131's rule and is not asserted here.

Spec: 6 Q8 (input, predicate, sort, pagination), 4.12 (the trigram index),
10.2, 7.10.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast, createFolder } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import { expectTaskInvariants } from '../support/tasks-harness.js'
import {
  idsOf,
  middayZone,
  q8OrderOf,
  search,
  seedViewTask,
  titlesOf,
} from '../support/views-harness.js'
import type { SeedViewTaskOptions } from '../support/views-harness.js'

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
      // Q8 sorts updated_at descending inside each status_rank, so the four
      // pending rows come out newest first: 40, 50, 60, 80 minutes, which is
      // pendingNewer, notesOnly, mixedCase, pendingOlder. This array once
      // held the middle two the other way round, which no assertion could
      // catch while the route answered 404.
      expected: [
        pendingNewer,
        notesOnly,
        mixedCase,
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

  test('AC-057: the expected sequence is the one the fixture\'s own rows produce', async () => {
    const { expected } = await stage()
    expect(
      await q8OrderOf(app.db, expected),
      'the sequence every case above measures the response against is written by hand from seven rows\' statuses and minute offsets, so this asks the database to order the same rows by Q8\'s keys and compares. It touches no response, so it cannot make an implementation pass; it can only catch an expected array that disagrees with the rows it was written from',
    ).toEqual(expected)
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
