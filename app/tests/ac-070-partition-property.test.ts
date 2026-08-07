/*
AC-070 Property: for randomized datasets, All equals Tasks union Planned
exactly, the two are disjoint, every non-completed task appears in All, and
every completed task appears in Done.

This is the criterion 6.1 asks for by name, and 6.1's proof says exactly what
a property test can add to it. The proof is a syllogism over one column: the
three queries share a scope predicate textually, Q2 adds due_date IS NULL and
Q3 adds due_date IS NOT NULL, and a column is null or not null exclusively
and exhaustively. So the claim cannot fail on the arithmetic. It fails when
the three scopes stop being textually identical, which is what 6.1 says the
proof depends on, and which no amount of reasoning about one dataset can
notice. Hence generated datasets: the divergence an implementation
introduces, an extra join, a status filter copied into two of three queries,
a folder scope applied in one place and forgotten in another, shows up only
on a dataset that happens to contain the row it treats differently.

The generator is a seeded PRNG rather than Math.random, so a failure names a
dataset that can be reproduced. Each round builds its own folders, so a round
cannot inherit another's rows, and every round mixes: three statuses, dated
and undated, important and not, the viewer's default folder and shared
folders and one folder the viewer cannot see at all.

The coverage corollary is asserted with the claim, because 6.1 states it in
the same breath and it is the half that catches a row falling out of every
page rather than out of one: open rows appear in All and in their home, and
completed rows appear in Done. The inaccessible folder is the negative half,
and it is what stops "everything appears somewhere" from being satisfiable by
a page that shows everything.

Spec: 6.1 (the claim, the proof, and its stated dependency), 6 Q2, Q3, Q5,
Q6, 7.10.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast, createFolder, defaultFolderOf } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import { expectTaskInvariants } from './tasks-harness.js'
import {
  allRowsOf,
  allView,
  doneRows,
  idsOf,
  middayZone,
  planned,
  seedViewTask,
  sharedFolder,
  shiftDate,
  tasksRowsOf,
  tasksView,
  todayIn,
} from './views-harness.js'

let app: AuthTestApp
const cast = new Cast(['viewer', 'colleague', 'stranger'], 'p4')

const tz = middayZone()
const ROUNDS = 4
const ROWS_PER_ROUND = 45

/*
mulberry32: a small, well-known 32-bit generator. Deterministic by seed, so
a failing round is reproducible from the seed the message names, which is
the whole reason Math.random is not used here.
*/
function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }
}

interface Dataset {
  seed: number
  accessibleFolders: string[]
  hiddenFolder: string
  /** Every accessible row, by id, with the facts the claim turns on. */
  open: { id: string; dated: boolean }[]
  completed: string[]
  hidden: string[]
}

interface Stage {
  viewer: Actor
  colleague: Actor
  stranger: Actor
  rounds: Dataset[]
}
let staged: Stage | undefined

async function buildRound(
  seed: number,
  viewer: Actor,
  colleague: Actor,
  stranger: Actor,
): Promise<Dataset> {
  const random = mulberry32(seed)
  const pick = <T>(values: readonly T[]): T =>
    values[Math.floor(random() * values.length)] as T

  const inboxId = await defaultFolderOf(app.db, viewer.id)
  const shared = await sharedFolder(
    app.db,
    viewer,
    colleague,
    `p4 ac070 shared ${String(seed)}`,
  )
  const solo = await createFolder(viewer, `p4 ac070 solo ${String(seed)}`)
  const hiddenFolder = await createFolder(
    stranger,
    `p4 ac070 hidden ${String(seed)}`,
  )
  const accessibleFolders = [inboxId, shared, solo]
  const today = todayIn(tz)

  const open: { id: string; dated: boolean }[] = []
  const completed: string[] = []
  const hidden: string[] = []

  for (let index = 0; index < ROWS_PER_ROUND; index += 1) {
    const status = pick(['pending', 'pending', 'abandoned', 'completed'] as const)
    const dated = random() < 0.5
    const folderId = pick(accessibleFolders)
    // INV-5: a single-member folder forces the assignee, and the shared one
    // is the only folder here that admits null or the colleague.
    const assigneeId =
      folderId === shared ? pick([viewer.id, colleague.id, null]) : viewer.id
    const id = await seedViewTask(app.db, {
      folderId,
      createdBy: viewer.id,
      assigneeId,
      title: `p4 ac070 s${String(seed)} r${String(index)}`,
      status,
      important: random() < 0.3,
      dueDate: dated ? shiftDate(today, Math.floor(random() * 21) - 10) : null,
      dueTime: dated && random() < 0.4 ? '10:15' : null,
      completedAt:
        status === 'completed'
          ? new Date(Date.now() - Math.floor(random() * 200_000)).toISOString()
          : null,
    })
    if (status === 'completed') completed.push(id)
    else open.push({ id, dated })
  }

  // The negative half: rows of every shape, in a folder the viewer is not a
  // member of, so "every task appears somewhere" cannot be satisfied by a
  // page that simply shows everything.
  for (const status of ['pending', 'abandoned', 'completed'] as const) {
    hidden.push(
      await seedViewTask(app.db, {
        folderId: hiddenFolder,
        createdBy: stranger.id,
        assigneeId: stranger.id,
        title: `p4 ac070 hidden s${String(seed)} ${status}`,
        status,
        dueDate: random() < 0.5 ? today : null,
      }),
    )
  }

  return { seed, accessibleFolders, hiddenFolder, open, completed, hidden }
}

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const [viewer, colleague, stranger] = await cast.of(app)
    if (viewer === undefined || colleague === undefined || stranger === undefined) {
      throw new Error('cast must produce three actors')
    }
    const rounds: Dataset[] = []
    for (let round = 0; round < ROUNDS; round += 1) {
      rounds.push(
        await buildRound(1_000 + round * 7_919, viewer, colleague, stranger),
      )
    }
    staged = { viewer, colleague, stranger, rounds }
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

/*
All four rounds are seeded before anything is read, so every request below
sees every round's rows at once. That is deliberate: the claim is about one
viewer's whole accessible dataset, and reading each round in isolation would
test four small datasets rather than one growing one. Each round's own rows
are then checked inside the whole, which is where a scope divergence between
two queries would show.
*/
describe('AC-070: Tasks and Planned partition All, and nothing falls out of every page', () => {
  test('AC-070: All is exactly the union of Tasks and Planned', async () => {
    const { viewer } = await stage()
    const all = await allView(viewer, tz)
    const tasks = await tasksView(viewer, tz)
    const list = await planned(viewer, tz)

    expect(
      idsOf(tasksRowsOf(all)).sort(),
      '6 Q5 renders All\'s second section exactly as Q2 groups it, so the two must answer the same rows',
    ).toEqual(idsOf(tasksRowsOf(tasks)).sort())
    expect(
      idsOf(all.planned).sort(),
      'and All\'s first section exactly as Q3 orders it',
    ).toEqual(idsOf(list.rows).sort())
    expect(
      idsOf(allRowsOf(all)).sort(),
      '6.1: Q5 = Q2 union Q3, which is the claim this criterion pins',
    ).toEqual([...idsOf(list.rows), ...idsOf(tasksRowsOf(tasks))].sort())
  })

  test('AC-070: Tasks and Planned are disjoint', async () => {
    const { viewer } = await stage()
    const tasks = idsOf(tasksRowsOf(await tasksView(viewer, tz)))
    const list = idsOf((await planned(viewer, tz)).rows)
    expect(
      list.filter((id) => tasks.includes(id)),
      '6.1: Q2 adds due_date IS NULL and Q3 adds due_date IS NOT NULL, and a column is null or not null exclusively, so the intersection is empty by construction. A row in both means the two scopes have stopped being the same scope, which is the dependency 6.1 states its proof rests on',
    ).toEqual([])
  })

  test('AC-070: every row lands in the half its own due_date names', async () => {
    const { viewer, rounds } = await stage()
    const tasks = idsOf(tasksRowsOf(await tasksView(viewer, tz)))
    const list = idsOf((await planned(viewer, tz)).rows)
    for (const round of rounds) {
      const datedMissing = round.open
        .filter((row) => row.dated && !list.includes(row.id))
        .map((row) => row.id)
      const undatedMissing = round.open
        .filter((row) => !row.dated && !tasks.includes(row.id))
        .map((row) => row.id)
      expect(
        { datedMissing, undatedMissing },
        `round seeded ${String(round.seed)}: every open row of the dataset is in exactly one of the two, chosen by its own due_date`,
      ).toEqual({ datedMissing: [], undatedMissing: [] })
    }
  })

  test('AC-070: every non-completed task appears in All', async () => {
    const { viewer, rounds } = await stage()
    const all = idsOf(allRowsOf(await allView(viewer, tz)))
    for (const round of rounds) {
      expect(
        round.open.map((row) => row.id).filter((id) => !all.includes(id)),
        `round seeded ${String(round.seed)}: 6.1's coverage corollary, open rows appear in Q5 whatever their status, date, folder or assignee`,
      ).toEqual([])
    }
  })

  test('AC-070: every completed task appears in Done', async () => {
    const { viewer, rounds } = await stage()
    const { rows } = await doneRows(viewer, tz)
    const done = idsOf(rows)
    for (const round of rounds) {
      expect(
        round.completed.filter((id) => !done.includes(id)),
        `round seeded ${String(round.seed)}: 6.1's corollary again, and this half is paged, so a row lost between two cursors fails here rather than nowhere`,
      ).toEqual([])
    }
  })

  test('AC-070: no completed row is in All, and no open row is in Done', async () => {
    const { viewer, rounds } = await stage()
    const all = idsOf(allRowsOf(await allView(viewer, tz)))
    const done = idsOf((await doneRows(viewer, tz)).rows)
    for (const round of rounds) {
      expect(
        round.completed.filter((id) => all.includes(id)),
        `round seeded ${String(round.seed)}: Q5 admits pending and abandoned only, so no status escapes into both pages`,
      ).toEqual([])
      expect(
        round.open.map((row) => row.id).filter((id) => done.includes(id)),
        `round seeded ${String(round.seed)}: and Q6 admits completed only, abandoned rows included in the exclusion`,
      ).toEqual([])
    }
  })

  test('AC-070: nothing inaccessible appears on any of the four pages', async () => {
    const { viewer, rounds } = await stage()
    const everywhere = [
      ...idsOf(allRowsOf(await allView(viewer, tz))),
      ...idsOf(tasksRowsOf(await tasksView(viewer, tz))),
      ...idsOf((await planned(viewer, tz)).rows),
      ...idsOf((await doneRows(viewer, tz)).rows),
    ]
    for (const round of rounds) {
      expect(
        round.hidden.filter((id) => everywhere.includes(id)),
        `round seeded ${String(round.seed)}: every one of these queries opens with folder_id IN ACCESSIBLE(V). Without this the coverage half above would be satisfiable by a page that shows every row in the database`,
      ).toEqual([])
    }
  })

  test('AC-070: the generated datasets satisfy section 3', async () => {
    const { viewer, colleague, rounds } = await stage()
    for (const round of rounds) {
      await expectTaskInvariants(
        app.db,
        [...round.open.map((row) => row.id), ...round.completed],
        round.accessibleFolders,
        [viewer.id, colleague.id],
      )
    }
  })
})
