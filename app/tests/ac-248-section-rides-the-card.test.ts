/*
AC-248: given a task placed under a section of its folder's page, then
`section_block_id` names that block on the folder read and carries the same
value on every other 7.10 body the task appears in and on its TaskDetail;
given a task under no section, then it is null on all of them.

RFC 0005 unit 12a is the contract, and this file exists because that unit made
one departure from the ruling behind it and said so out loud. Change control
item 19 approved `section_block_id` "on the folder read"; the unit puts it on
TaskCard, because GET /folders/:id/tasks answers { scheduled: [TaskCard],
unscheduled: [TaskCard], truncated }, so section on the folder read *is*
section on TaskCard, and a private element shape for one endpoint would put
two task shapes on the wire.

**That departure is what the second surface here asserts, and it is the whole
adversarial content of this file.** An implementation that reads the ruling
narrowly passes every folder-read case and fails on the view body: it would
answer the block on Q7 and null everywhere else, which is the per-endpoint
variant the contract exists to refuse and which no reader could tell apart
from a task genuinely under no section. So a placed task is read through
/views/tasks as well, and the value asserted there is the same block rather
than null. If that reading is ever ruled wrong, this is the case to dispute
rather than the one to work around.

The converse claim is the unit's own, that no other surface changes meaning: a
task placed under nothing reads null on every one of these bodies, which is
what makes the field additive rather than a new decision every page has to
make.

Placement moves, so the file follows it. The task is moved to a second section
through the 7.6 PATCH and then out of both, and all three surfaces are read
again after each move. A projection that answered from anywhere but the row,
or that read the column on one path and not another, disagrees somewhere in
that sequence.

AC-199 already pins what happens when the section itself is deleted, through
the same page write, and is not duplicated here.

Setup goes through the API wherever the API exists, this suite's standing
rule: the sections are written with PUT /folders/:id/page (7.16) and the tasks
with POST /tasks (7.6), so a broken write fails here on one attributable
sentence.

Spec: 7.0 as RFC 0005 unit 12a replaces its TaskCard line, 7.10 (Q7's and Q2's
bodies), 7.6, 7.16, 4.5, 4.17, 6 Q2, 6 Q7.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast, createFolder, expectStatus } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import { createTaskOk, patchTaskOk, readTask } from './tasks-harness.js'
import {
  folderOpen,
  requireCard,
  tasksRowsOf,
  tasksView,
  ZONE_BEHIND,
} from './views-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner'], 's18')

/** Nothing here reads a calendar day; the zone is supplied because every 7.10
 * body takes one, and is otherwise irrelevant to this criterion. */
const tz = ZONE_BEHIND

interface Stage {
  owner: Actor
  folderId: string
  venueId: string
  cateringId: string
  placedId: string
  looseId: string
}
let staged: Stage | undefined

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const [owner] = await cast.of(app)
    if (owner === undefined) throw new Error('cast must produce one actor')
    const folderId = await createFolder(owner, 's18 ac248 placement')

    const written = await owner.browser.json(`/folders/${folderId}/page`, 'PUT', {
      blocks: [
        { kind: 'section', position: 0, text: 'Venue' },
        { kind: 'section', position: 1, text: 'Catering' },
      ],
    })
    expectStatus(written, 200, 'the two sections write (spec 7.16)')
    const read = await owner.browser.json(`/folders/${folderId}/page`, 'GET')
    expectStatus(read, 200, 'and read back carrying their ids (spec 7.16)')
    const blocks =
      (read.json() as { blocks?: { id?: unknown; text?: unknown }[] }).blocks ?? []
    const idOf = (text: string): string => {
      const block = blocks.find((entry) => entry.text === text)
      expect(
        block,
        `the page must carry a section named ${text} (spec 7.16, 4.17)`,
      ).toBeDefined()
      return String((block as { id?: unknown }).id)
    }

    // Undated, so both rows land in Q7's unscheduled section and in Q2, which
    // is what lets one fixture answer two bodies.
    const placed = await createTaskOk(
      owner,
      {
        title: 's18 ac248 under a section',
        folder_id: folderId,
        section_block_id: idOf('Venue'),
      },
      'a task takes a section on the create (spec 7.6, 4.5)',
    )
    const loose = await createTaskOk(
      owner,
      { title: 's18 ac248 under nothing', folder_id: folderId },
      'and a second takes none (spec 7.6)',
    )
    staged = {
      owner,
      folderId,
      venueId: idOf('Venue'),
      cateringId: idOf('Catering'),
      placedId: placed.id,
      looseId: loose.id,
    }
  }
  return staged
}

/** One task's `section_block_id` read off all three surfaces the widened card
 * reaches: the folder page, a view body that is not the folder page, and the
 * detail. */
async function sectionEverywhere(
  owner: Actor,
  folderId: string,
  taskId: string,
): Promise<{ folderRead: unknown; viewBody: unknown; detail: unknown }> {
  const open = await folderOpen(owner, folderId, tz)
  const folderCard = requireCard(
    [...open.scheduled, ...open.unscheduled],
    taskId,
    `the folder read must carry task ${taskId} (spec 6 Q7)`,
  )
  const viewCard = requireCard(
    tasksRowsOf(await tasksView(owner, tz)),
    taskId,
    'and Q2 must carry the same undated open task (spec 6 Q2)',
  )
  const detail = await readTask(owner, taskId)
  return {
    folderRead: folderCard.section_block_id,
    viewBody: viewCard.section_block_id,
    detail: detail.section_block_id,
  }
}

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-248 the section rides the card', () => {
  test('AC-248: a placed task names its section on the folder read', async () => {
    const { owner, folderId, placedId, venueId } = await stage()
    const open = await folderOpen(owner, folderId, tz)
    expect(
      requireCard(
        open.unscheduled,
        placedId,
        'the placed task is undated, so Q7 answers it in unscheduled (spec 6 Q7)',
      ).section_block_id,
      'the folder read names the block the task was placed under, which is what item 19 approved (spec 7.0 as unit 12a replaces it, 4.5)',
    ).toBe(venueId)
  })

  test('AC-248: and the same value on a body that is not the folder page', async () => {
    const { owner, folderId, placedId, venueId } = await stage()
    expect(
      await sectionEverywhere(owner, folderId, placedId),
      'unit 12a puts the field on TaskCard rather than on a private folder-read element, so one task has one section wherever it is read; answering the block on Q7 and null elsewhere is the two-task-shapes drift the unit refuses',
    ).toEqual({ folderRead: venueId, viewBody: venueId, detail: venueId })
  })

  test('AC-248: a task under no section reads null on all of them', async () => {
    const { owner, folderId, looseId } = await stage()
    expect(
      await sectionEverywhere(owner, folderId, looseId),
      "the unit's own claim that no other surface changes meaning: a task placed under nothing carries null, which is every task on every page that has no sections (spec 7.0 as unit 12a replaces it)",
    ).toEqual({ folderRead: null, viewBody: null, detail: null })
  })

  test('AC-248: moving the task moves the value on every surface', async () => {
    const { owner, folderId, placedId, cateringId } = await stage()
    await patchTaskOk(
      owner,
      placedId,
      { section_block_id: cateringId },
      'the 7.6 PATCH moves a task between sections of its own folder (spec 7.6, 4.5)',
    )
    expect(
      await sectionEverywhere(owner, folderId, placedId),
      'the second section, read the same three ways: a producer answering from anywhere but the row disagrees with itself here',
    ).toEqual({
      folderRead: cateringId,
      viewBody: cateringId,
      detail: cateringId,
    })

    await patchTaskOk(
      owner,
      placedId,
      { section_block_id: null },
      'and out of both sections, the loose block being null (spec 7.6, 4.5)',
    )
    expect(
      await sectionEverywhere(owner, folderId, placedId),
      'clearing the placement clears it everywhere, not only on the surface that wrote it',
    ).toEqual({ folderRead: null, viewBody: null, detail: null })
  })
})
