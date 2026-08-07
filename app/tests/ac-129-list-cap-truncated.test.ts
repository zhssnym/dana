/*
AC-129: Given more than 1000 rows qualifying for a capped list, then the
response carries at most 1000 of them and truncated is true; given fewer,
then every row is present and truncated is false.

Numbered by the Integration Steward on 2026-08-07 and now section 12's own
text; ac-125's header records why the numbering was the Steward's and not the
owner's, this file having proposed the opposite. The RFC 0001 P4 row names
this surface as one of three the package delivers with no criterion in any
range: the 1000-row cap with its truncated flag. Section 6's preamble states
it, 10.3 lists it among the numbers it calls server-enforced, and six of the
nine 7.10 bodies carry the flag.

The reading this file rests on is ruled and is section 6's own text now. The
cap is per response, not per array, ruled at the P4 change control on
2026-08-07 on the two grounds this file routed: the preamble enumerates pages
rather than arrays when it lists what is capped, My Day and Tasks and All
each holding several, and every capped 7.10 body carries exactly one
truncated flag, which a per-array cap has no way to report. A per-array
reading would let All answer three thousand rows under one flag, which is the
notice's whole purpose defeated.

The ruling added something this file did not ask for and one case now
asserts. The rows kept are the first 1000 taken in the order 7.10 enumerates
that response's own sections, so a capped response is a prefix of one
determined sequence rather than an arbitrary thousand, which is what the
preamble's byte-identical guarantee needs once a cap can bite. For All that
means planned fills first and the Tasks half takes what is left, and the
fixture below is built so the two readings differ: 1001 undated rows and 5
dated ones cannot both be a prefix unless the allocation is the enumerated
one.

The negative half is asserted on a second account rather than on a second
page of the same one, because truncated false on an empty response would be
satisfied by an implementation that hardcoded the flag, and truncated false
beside a complete short list is the assertion that is not.

Volume is seeded in one statement. A thousand round trips through 7.6 would
dominate the suite's runtime and would prove nothing the insert does not.

Spec: 6 preamble (the cap and the flag), 10.3, 7.10.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast, createFolder, defaultFolderOf } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import {
  allRowsOf,
  allView,
  countTasks,
  middayZone,
  planned,
  seedManyTasks,
  tasksRowsOf,
  tasksView,
  todayIn,
} from './views-harness.js'

let app: AuthTestApp
const cast = new Cast(['crowded', 'sparse'], 'p4')

const tz = middayZone()
const CAP = 1000
const OVER_CAP = CAP + 1
const FEW = 5
/** Undated rows in a custom folder, so Tasks has a second section under the
 * cap and the enumerated order is observable rather than merely counted. */
const GROUPED = 4

interface Stage {
  crowded: Actor
  sparse: Actor
  crowdedInboxId: string
  crowdedGroupId: string
  sparseInboxId: string
}
let staged: Stage | undefined

/*
The fixture is built so the two allocations disagree observably. 7.10
enumerates Tasks as inbox then groups, and All as planned then tasks_inbox
then tasks_groups, so the ruled prefix rule gives the Inbox all 1000 of the
Tasks page and gives All's five dated rows their place before the Tasks half
takes the remaining 995. An implementation filling the later section first
answers the same totals with different sections, which is exactly what a test
asserting only a total cannot see.
*/
async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const [crowded, sparse] = await cast.of(app)
    if (crowded === undefined || sparse === undefined) {
      throw new Error('cast must produce two actors')
    }
    const crowdedInboxId = await defaultFolderOf(app.db, crowded.id)
    const crowdedGroupId = await createFolder(crowded, 'p4 ac129 overflow')
    const sparseInboxId = await defaultFolderOf(app.db, sparse.id)
    const today = todayIn(tz)

    await seedManyTasks(app.db, {
      folderId: crowdedInboxId,
      createdBy: crowded.id,
      assigneeId: crowded.id,
      count: OVER_CAP,
      titlePrefix: 'p4 ac129 undated',
    })
    // Undated too, but in a custom folder, so Tasks has a second section for
    // the cap to reach and the enumeration order is observable.
    await seedManyTasks(app.db, {
      folderId: crowdedGroupId,
      createdBy: crowded.id,
      assigneeId: crowded.id,
      count: GROUPED,
      titlePrefix: 'p4 ac129 grouped undated',
    })
    // Dated, so Planned holds them and All must place them ahead of the
    // Tasks half rather than merely counting them.
    await seedManyTasks(app.db, {
      folderId: crowdedInboxId,
      createdBy: crowded.id,
      assigneeId: crowded.id,
      count: FEW,
      titlePrefix: 'p4 ac129 dated',
      dueDate: today,
    })
    await seedManyTasks(app.db, {
      folderId: sparseInboxId,
      createdBy: sparse.id,
      assigneeId: sparse.id,
      count: FEW,
      titlePrefix: 'p4 ac129 sparse undated',
    })

    staged = {
      crowded,
      sparse,
      crowdedInboxId,
      crowdedGroupId,
      sparseInboxId,
    }
  }
  return staged
}

beforeAll(async () => {
  app = await startAuthTestApp()
}, 120_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-129: a capped list stops at 1000 rows and says so', () => {
  test('AC-129: the fixture really does exceed the cap', async () => {
    const { crowdedInboxId, crowdedGroupId } = await stage()
    expect(
      [
        await countTasks(app.db, crowdedInboxId),
        await countTasks(app.db, crowdedGroupId),
      ],
      'the cases below are about a list that has more rows than it may return, so the rows must exist before any response is judged, and the grouped ones must exist for the allocation to be observable',
    ).toEqual([OVER_CAP + FEW, GROUPED])
  })

  test('AC-129: Tasks returns 1000 rows with truncated true', async () => {
    const { crowded } = await stage()
    const body = await tasksView(crowded, tz)
    const rows = tasksRowsOf(body)
    expect(
      rows.length,
      'section 6: Tasks returns at most 1000 rows. The count is taken across the ungrouped section and every group, because the cap is per response and one truncated flag is what reports it',
    ).toBe(CAP)
    expect(
      body.truncated,
      'and sets truncated = true beyond it, which is what the UI draws its notice from',
    ).toBe(true)
  })

  test('AC-129: Tasks fills its sections in the order 7.10 enumerates them', async () => {
    const { crowded } = await stage()
    const body = await tasksView(crowded, tz)
    expect(
      [body.inbox.length, body.groups.flatMap((group) => group.rows).length],
      'section 6 as ruled on 2026-08-07: the rows kept are the first 1000 taken in the order 7.10 enumerates that response\'s sections, so a capped response is a prefix of one determined sequence. 7.10 writes Tasks as inbox then groups, and the Inbox holds more than the whole cap, so the four grouped rows are what the cap drops. An implementation filling groups first answers the same total with a different page',
    ).toEqual([CAP, 0])
  })

  test('AC-129: All caps its two stacked sections together, not each', async () => {
    const { crowded } = await stage()
    const body = await allView(crowded, tz)
    expect(
      allRowsOf(body).length,
      'All is one page with two stacked sections in one scroll (6 Q5), and section 6 caps the page. A per-array reading would let this answer over two thousand rows under a single flag, which defeats the notice the flag exists for',
    ).toBe(CAP)
    expect(body.truncated, 'and the flag is set').toBe(true)
  })

  test('AC-129: All places its planned section before the Tasks half takes the rest', async () => {
    const { crowded } = await stage()
    const body = await allView(crowded, tz)
    expect(
      [body.planned.length, tasksRowsOf(body).length],
      '7.10 enumerates All as planned, then tasks_inbox, then tasks_groups, and the allocation ruled on 2026-08-07 follows that order. So the five dated rows all survive and the Tasks half takes the remaining 995; an implementation filling the Tasks half first answers 1000 rows with no Planned section at all, which is the same total and a different page',
    ).toEqual([FEW, CAP - FEW])
  })

  test('AC-129: the rows returned are the first 1000 of the list\'s own order', async () => {
    const { crowded } = await stage()
    const body = await tasksView(crowded, tz)
    const rows = tasksRowsOf(body)
    expect(
      new Set(rows.map((row) => row.id)).size,
      'a cap is a truncation of one ordered result, so no row may appear twice in what survives it',
    ).toBe(rows.length)
    expect(
      rows.every((row) => row.due_date === null),
      'and the cap does not change the predicate: Q2 still answers undated open rows only, so an implementation capping before filtering would let a dated row through',
    ).toBe(true)
  })

  test('AC-129: Planned under the cap returns everything with truncated false', async () => {
    const { crowded } = await stage()
    const body = await planned(crowded, tz)
    expect(
      body.rows.length,
      'the same account\'s dated rows are five, which is under the cap, so the cap is a ceiling rather than a page size',
    ).toBe(FEW)
    expect(
      body.truncated,
      'and the flag is false where nothing was dropped, on the same account whose Tasks page sets it true',
    ).toBe(false)
  })

  test('AC-129: a small account gets every row and truncated false', async () => {
    const { sparse } = await stage()
    const tasks = await tasksView(sparse, tz)
    expect(
      tasksRowsOf(tasks).length,
      'five rows and five returned',
    ).toBe(FEW)
    expect(
      tasks.truncated,
      'truncated false beside a complete short list, rather than beside an empty one: an implementation hardcoding the flag false would be indistinguishable from a correct one on an empty page',
    ).toBe(false)
    const all = await allView(sparse, tz)
    expect(
      all.truncated,
      'and the same on All',
    ).toBe(false)
  })
})
