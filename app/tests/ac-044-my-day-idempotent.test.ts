/*
AC-044: given POST my-day twice then DELETE my-day twice, then one entry
existed with its original added_on, and every call returned 200 (INV-12).

The exact four-call sequence is run in order, in one test, because that is
what the criterion says and because each call's status is part of it: 7.8
gives POST 200 rather than 201 (it is an insert-or-nothing, not a creation),
and DELETE 200 rather than 204, idempotent even when there is nothing to
remove.

"Its original added_on" is the clause an implementation can pass by
accident. A repeat pull on the same day writes the same date, so an upsert
that overwrites added_on looks correct for as long as the test runs inside
one day. The second fixture removes the coincidence: the stored date is
pushed into the past, the way a real entry pulled last week reads, and only
then is the pull repeated. An implementation that overwrites now writes
today over last week and fails; one that leaves the row alone passes.
That is what 7.8's "keeping the original added_on" protects, and 8.2 reads
added_on as the qualify date that decides Carried against Today.

Attacked beside the criterion: the pull is per viewer, so a second member's
entry is untouched by the first member's calls (INV-12 is keyed on the
pair); the TaskCard's pulled flag must follow the entry; and a pull on a
task the caller cannot see must answer 404 rather than creating a row.

Spec: 7.8 (both endpoints and their statuses), INV-12, 8.2 (added_on is the
pull's qualify date), 10.2.
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import {
  Cast,
  addMemberOk,
  connect,
  createFolder,
  expectStatus,
} from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import {
  createTaskOk,
  dropFromMyDay,
  dropFromMyDayOk,
  expectTaskInvariants,
  myDayAddedOn,
  myDayRows,
  pullIntoMyDay,
  pullIntoMyDayOk,
  readTask,
  todayInUtc,
  yesterdayInUtc,
} from './tasks-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'second', 'stranger'], 'p3')

interface Stage {
  owner: Actor
  second: Actor
  stranger: Actor
  folderId: string
  strangerTaskId: string
  strangerFolderId: string
}
let staged: Stage | undefined
const taskIds: string[] = []

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const [owner, second, stranger] = await cast.of(app)
    if (owner === undefined || second === undefined || stranger === undefined) {
      throw new Error('cast must produce three actors')
    }
    await connect(app.db, owner.id, second.id)
    const folderId = await createFolder(owner, 'p3 ac044 shared')
    await addMemberOk(owner, folderId, second.id)
    const strangerFolderId = await createFolder(stranger, 'p3 ac044 elsewhere')
    const strangerTask = await createTaskOk(
      stranger,
      { title: 'p3 ac044 out of reach', folder_id: strangerFolderId },
      'the unreachable task must be creatable by its own member (spec 7.6)',
    )
    staged = {
      owner,
      second,
      stranger,
      folderId,
      strangerFolderId,
      strangerTaskId: strangerTask.id,
    }
  }
  return staged
}

async function pullable(label: string): Promise<string> {
  const { owner, folderId } = await stage()
  const created = await createTaskOk(
    owner,
    { title: `p3 ac044 ${label}`, folder_id: folderId },
    'the task to pull must be creatable (spec 7.6)',
  )
  taskIds.push(created.id)
  return created.id
}

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-044: pulling and dropping My Day are idempotent', () => {
  test('AC-044: the four calls all answer 200 and leave one entry, then none', async () => {
    const { owner } = await stage()
    const taskId = await pullable('sequence')

    const firstPull = await pullIntoMyDay(owner, taskId, 'UTC')
    expectStatus(
      firstPull,
      200,
      'POST my-day inserts the entry and answers 200; it is an insert-or-nothing, not a creation (spec 7.8)',
    )
    const addedOn = await myDayAddedOn(app.db, taskId, owner.id)
    expect(addedOn, 'the entry exists after the first pull').toBeDefined()

    const secondPull = await pullIntoMyDay(owner, taskId, 'UTC')
    expectStatus(
      secondPull,
      200,
      'a repeat pull is a 200 no-op (spec 7.8, INV-12)',
    )
    expect(
      (await myDayRows(app.db, taskId)).length,
      'INV-12 admits at most one entry per (task, user), and the repeat made no second one',
    ).toBe(1)
    expect(
      await myDayAddedOn(app.db, taskId, owner.id),
      'and the repeat kept the original added_on (spec 7.8)',
    ).toBe(addedOn)

    const firstDrop = await dropFromMyDay(owner, taskId)
    expectStatus(firstDrop, 200, 'DELETE my-day removes the entry and answers 200 (spec 7.8)')
    expect(
      await myDayRows(app.db, taskId),
      'the entry is gone',
    ).toEqual([])

    const secondDrop = await dropFromMyDay(owner, taskId)
    expectStatus(
      secondDrop,
      200,
      'DELETE my-day answers 200 even when the entry is absent (spec 7.8, idempotent)',
    )
    expect(
      await myDayRows(app.db, taskId),
      'and still nothing exists',
    ).toEqual([])
  })

  test('AC-044: added_on is the pulling day in the adder\'s zone', async () => {
    const { owner } = await stage()
    const taskId = await pullable('added on')
    await pullIntoMyDay(owner, taskId, 'UTC')
    const addedOn = await myDayAddedOn(app.db, taskId, owner.id)
    // These actors sign in without the 7.1 tz parameter, so 7.1 provisions
    // UTC and today(V) is today in UTC. Yesterday is admitted because a pull
    // straddling midnight would otherwise fail on the clock rather than on
    // the behavior; INV-12's bound is that added_on is not after today.
    expect(
      [todayInUtc(), yesterdayInUtc()],
      `added_on must be today(V), and INV-12 forbids a date after it; the row says ${String(addedOn)}`,
    ).toContain(addedOn)
  })

  test('AC-044 adversarial: a repeat pull does not overwrite an older added_on', async () => {
    const { owner } = await stage()
    const taskId = await pullable('stale entry')
    await pullIntoMyDay(owner, taskId, 'UTC')
    // A row as it would read after a pull made last week. Written directly
    // because no endpoint can reach into the past, and the criterion's word
    // is original.
    await app.db.execute(sql`
      UPDATE my_day_entries SET added_on = ${'2026-07-01'}::date
       WHERE task_id = ${taskId}::uuid AND user_id = ${owner.id}::uuid
    `)
    const response = await pullIntoMyDay(owner, taskId, 'UTC')
    expectStatus(response, 200, 'the repeat pull is a 200 no-op (spec 7.8)')
    expect(
      await myDayAddedOn(app.db, taskId, owner.id),
      '7.8 keeps the original added_on, which 8.2 reads as the qualify date deciding Carried against Today; an upsert would move it to today',
    ).toBe('2026-07-01')
  })

  test('AC-044 adversarial: the pull is one viewer\'s, not the task\'s', async () => {
    const { owner, second } = await stage()
    const taskId = await pullable('per viewer')
    expectStatus(await pullIntoMyDay(owner, taskId, 'UTC'), 200, 'the owner pulls')
    expectStatus(
      await pullIntoMyDay(second, taskId, 'UTC'),
      200,
      'the other member pulls the same task (spec 7.8, any member of an accessible folder)',
    )
    expect(
      (await myDayRows(app.db, taskId)).length,
      'INV-12 is keyed on (task, user), so two members hold two entries',
    ).toBe(2)

    expectStatus(await dropFromMyDay(owner, taskId), 200, 'the owner drops')
    expect(
      await myDayAddedOn(app.db, taskId, second.id),
      'and the other member\'s entry is untouched: DELETE removes V\'s entry (spec 7.8)',
    ).toBeDefined()
    expect(
      await myDayAddedOn(app.db, taskId, owner.id),
      'while the caller\'s is gone',
    ).toBeUndefined()
  })

  test('AC-044 adversarial: the pulled flag follows the entry', async () => {
    const { owner, second } = await stage()
    const taskId = await pullable('pulled flag')
    expect(
      (await readTask(owner, taskId)).pulled,
      'nothing is pulled yet (spec 7.0: pulled means the viewer has a My Day entry)',
    ).toBe(false)
    await pullIntoMyDay(owner, taskId, 'UTC')
    expect(
      (await readTask(owner, taskId)).pulled,
      'the viewer who pulled reads pulled true',
    ).toBe(true)
    expect(
      (await readTask(second, taskId)).pulled,
      'and the member who did not reads false: the flag is the viewer\'s, not the task\'s',
    ).toBe(false)
    await dropFromMyDay(owner, taskId)
    expect(
      (await readTask(owner, taskId)).pulled,
      'dropping it takes the flag with it',
    ).toBe(false)
  })

  /*
  The response bodies frozen 7.8 now states. They were silent while this
  file was written, so it asserted the four statuses the criterion names
  and nothing about what came back; the P3 shape review settled them and
  the owner entered them, which makes them contract this surface must
  satisfy and which no criterion pinned. The sequence test above stays on
  the raw transports deliberately: it is the criterion's own four calls in
  the criterion's own order, and a fresh GET wedged between them would make
  it a transcription of something else.

  The sharp part is that both calls answer the task rather than the entry,
  and that the flag they moved is already true in the body that answers,
  not merely in the next GET. An implementation that writes the row and
  serializes a task it read beforehand passes every assertion in this file
  except this one.
  */
  test('AC-044 contract: both 7.8 calls answer the affected TaskDetail', async () => {
    const { owner, second } = await stage()
    const taskId = await pullable('bodies')

    const pulled = await pullIntoMyDayOk(
      owner,
      taskId,
      'UTC',
      'the pull that creates the entry (spec 7.8)',
    )
    expect(
      pulled.pulled,
      'the body that answers the pull already reports it: pulled is a field of the task, which is why the task is the answer (spec 7.0, 7.8)',
    ).toBe(true)

    const repeat = await pullIntoMyDayOk(
      owner,
      taskId,
      'UTC',
      'the repeat pull, a 200 no-op (spec 7.8, INV-12)',
    )
    expect(
      repeat.pulled,
      'a no-op answers the same task, not a different one',
    ).toBe(true)

    const dropped = await dropFromMyDayOk(
      owner,
      taskId,
      'the drop that removes the entry (spec 7.8)',
    )
    expect(
      dropped.pulled,
      'and the drop reports the flag it just cleared',
    ).toBe(false)

    const absent = await dropFromMyDayOk(
      second,
      taskId,
      'a drop with no entry to remove, which 7.8 answers 200 anyway',
    )
    expect(
      absent.pulled,
      'the idempotent case answers the task too, with the flag it did not have',
    ).toBe(false)
  })

  test('AC-044 adversarial: pulling an inaccessible task answers 404 and writes nothing', async () => {
    const { owner, strangerTaskId } = await stage()
    const response = await pullIntoMyDay(owner, strangerTaskId, 'UTC')
    expectStatus(
      response,
      404,
      '7.8 answers 404 if the task is not accessible, the leak rule of 10.2',
    )
    expect(
      await myDayRows(app.db, strangerTaskId),
      'and no entry was written for a task the caller cannot see',
    ).toEqual([])
  })

  test('AC-044: invariants hold afterwards', async () => {
    const { owner, second, stranger, folderId, strangerFolderId, strangerTaskId } =
      await stage()
    await expectTaskInvariants(
      app.db,
      [...taskIds, strangerTaskId],
      [folderId, strangerFolderId],
      [owner.id, second.id, stranger.id],
    )
  })
})
