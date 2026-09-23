/*
AC-865: a task row's `blocked_by_count` and `blocks_count` count blockers that
are not completed (pending and abandoned alike) and dependents while the task
itself is not completed, and never count an edge whose other end the viewer
cannot read — on the folder page, on search, and on the task's own detail.

The leak this guards is the status of an unreadable blocker: the count is a
function of it, so an edge into somebody else's folder is seeded straight into
`task_dependencies` (the way an unshare leaves it) and must be absent from the
count, while the stored row is asserted to exist so the absence is the
redaction and not a missing fixture. The viewer is then made a member of the
far folder and the same edges are counted, which stops the assertion passing
against a count that ignores cross-folder edges altogether.

Spec: 7.0, 7.25, 10.2.
*/
import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast, createFolder, seedMembership } from '../support/folders-harness.js'
import { rows } from '../support/helpers.js'
import { readTask } from '../support/tasks-harness.js'
import {
  folderOpen,
  middayZone,
  search,
  seedViewTask,
} from '../support/views-harness.js'
import type { Card } from '../support/views-harness.js'

let app: AuthTestApp
const cast = new Cast(['viewer', 'stranger'], 'p4')
const tz = middayZone()
const NEEDLE = `acblk${randomUUID().slice(0, 8)}`

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

async function relate(dependent: string, blocker: string, by: string) {
  await app.db.execute(sql`
    INSERT INTO task_dependencies (dependent_task_id, blocking_task_id, created_by)
    VALUES (${dependent}::uuid, ${blocker}::uuid, ${by}::uuid)`)
}

function countsOf(cards: Card[], id: string) {
  const card = cards.find((c) => c.id === id)
  expect(card, `task ${id} must be on the list`).toBeDefined()
  return {
    blocked_by_count: card?.blocked_by_count,
    blocks_count: card?.blocks_count,
  }
}

describe('AC-865: row dependency counts', () => {
  test('AC-865: counts unresolved readable edges only, on lists and on the detail', async () => {
    const [viewer, stranger] = await cast.of(app)
    if (viewer === undefined || stranger === undefined) {
      throw new Error('cast must produce two actors')
    }
    const mine = await createFolder(viewer, 'p4 ac865 mine')
    const theirs = await createFolder(stranger, 'p4 ac865 theirs')
    const seed = (folderId: string, by: string, title: string,
      status: 'pending' | 'completed' | 'abandoned' = 'pending') =>
      seedViewTask(app.db, { folderId, createdBy: by, title, status })

    const target = await seed(mine, viewer.id, `${NEEDLE} target`)
    const pendingBlocker = await seed(mine, viewer.id, 'p4 ac865 pending')
    const abandonedBlocker = await seed(mine, viewer.id, 'p4 ac865 abandoned', 'abandoned')
    const doneBlocker = await seed(mine, viewer.id, 'p4 ac865 done', 'completed')
    const hiddenBlocker = await seed(theirs, stranger.id, 'p4 ac865 hidden blocker')
    const hiddenDependent = await seed(theirs, stranger.id, 'p4 ac865 hidden dependent')
    const doneTask = await seed(mine, viewer.id, `${NEEDLE} done blocker of target`, 'completed')

    await relate(target, pendingBlocker, viewer.id)
    await relate(target, abandonedBlocker, viewer.id)
    await relate(target, doneBlocker, viewer.id)
    await relate(target, hiddenBlocker, stranger.id)
    await relate(hiddenDependent, target, stranger.id)
    await relate(pendingBlocker, doneTask, viewer.id)

    const stored = await rows(
      app.db,
      sql`SELECT count(*)::int AS n FROM task_dependencies
          WHERE dependent_task_id = ${target}::uuid
             OR blocking_task_id = ${target}::uuid`,
    )
    expect(stored[0]?.n, 'all five edges touching the target are stored').toBe(5)

    const expected = { blocked_by_count: 2, blocks_count: 0 }

    const open = await folderOpen(viewer, mine, tz)
    const cards = [...open.scheduled, ...open.unscheduled]
    expect(
      countsOf(cards, target),
      'pending and abandoned blockers count, the completed one does not, and neither the unreadable blocker nor the unreadable dependent is counted',
    ).toEqual(expected)
    expect(countsOf(cards, pendingBlocker), 'a pending blocker blocks the target; its own blocker is completed').toEqual({
      blocked_by_count: 0,
      blocks_count: 1,
    })

    const found = await search(viewer, tz, NEEDLE)
    expect(countsOf(found.rows, target)).toEqual(expected)
    expect(
      countsOf(found.rows, doneTask),
      'a completed task blocks nobody',
    ).toEqual({ blocked_by_count: 0, blocks_count: 0 })

    const detail = (await readTask(viewer, target)) as unknown as Card
    expect({
      blocked_by_count: detail.blocked_by_count,
      blocks_count: detail.blocks_count,
    }).toEqual(expected)

    // The stranger reads the far ends and sees them counted from their side.
    const theirOpen = await folderOpen(stranger, theirs, tz)
    const theirCards = [...theirOpen.scheduled, ...theirOpen.unscheduled]
    expect(
      countsOf(theirCards, hiddenBlocker),
      'the stranger cannot read the target, so their blocker counts nothing either',
    ).toEqual({ blocked_by_count: 0, blocks_count: 0 })
    expect(countsOf(theirCards, hiddenDependent)).toEqual({
      blocked_by_count: 0,
      blocks_count: 0,
    })

    // Make the viewer a member of the stranger's folder, and both hidden
    // edges count.
    await seedMembership(app.db, theirs, viewer.id)
    const after = await folderOpen(viewer, mine, tz)
    expect(
      countsOf([...after.scheduled, ...after.unscheduled], target),
      'once the far ends are readable, the same edges are counted',
    ).toEqual({ blocked_by_count: 3, blocks_count: 1 })
  })
})
