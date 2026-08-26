/*
AC-249: given a task read by a member who did not create it, then its
TaskCard `created_by` is the creator's { id, display_name, avatar_url } stub,
the same object `assignee` carries for that same person, and the same value on
the folder read, on a 7.10 view body and on the TaskDetail alike.

RFC 0005 unit 12a is the contract, and its second reading is what this file
attacks. `created_by` is the person stub rather than the bare id 7.0 gave
TaskDetail, "for the reason 7.4's note gives about the members element: a
heading that names a person needs exactly what a card's person label needs".
So the assertion is not that a person shape came back; it is that the shape
`created_by` answers and the shape `assignee` answers for one person are the
same object, key for key and value for value. An implementation that built a
second person projection for this field would pass a key check and drift on
the day one of the two learned about a fallback the other did not.

**Three traps, one fixture, and each is an implementation that passes a
single-actor test.**

The viewer is not the creator on the row this file cares about most, because a
projection that answered the requesting user would be right on every task a
person made for themselves, which is nearly every task in this suite's other
fixtures. The folder therefore holds two members and two tasks, one authored
by each, and both are read by one of them.

The field is per row and not per folder: the two rows sit in one folder and
answer two different people, so an implementation reading the folder's owner
is red here and green anywhere a folder has one author.

And it is never null for a live account. 4.5 makes the column NOT NULL, and
unit 12a admits null through exactly one door, 8.10's scrub, which is AC-250's
and is not repeated here.

The stub's own key-exactness is the harness's, judged on every card of every
body this suite reads, so this file asserts values rather than restating a key
list a third time.

Setup goes through the API wherever the API exists: both tasks are created
with POST /tasks by the member who is to author them, because who created a
row is precisely what this criterion is about and a seeded created_by would
assert the projection against a value the fixture chose rather than against
the one the contract wrote.

Spec: 7.0 as RFC 0005 unit 12a replaces its TaskCard line, 7.4 (the members
element's person shape), 7.10, 7.6, 4.5, 4.1.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import { userRowById } from './sharing-harness.js'
import { createTaskOk, readTask } from './tasks-harness.js'
import {
  folderOpen,
  requireCard,
  sharedFolder,
  tasksRowsOf,
  tasksView,
  ZONE_BEHIND,
} from './views-harness.js'

let app: AuthTestApp
const cast = new Cast(['author', 'reader'], 's18')

/** No calendar day is read here; every 7.10 body takes a zone and this is it. */
const tz = ZONE_BEHIND

interface Stage {
  author: Actor
  reader: Actor
  folderId: string
  byAuthorId: string
  byReaderId: string
}
let staged: Stage | undefined

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const [author, reader] = await cast.of(app)
    if (author === undefined || reader === undefined) {
      throw new Error('cast must produce two actors')
    }
    // Two members, so a task may be assigned to someone other than the
    // caller without INV-5's single-member forcing deciding it for us.
    const folderId = await sharedFolder(app.db, author, reader, 's18 ac249 authorship')

    // Authored and held by the same person, which is what lets the two stubs
    // be compared to each other rather than to a fixture's idea of a name.
    const byAuthor = await createTaskOk(
      author,
      {
        title: 's18 ac249 written by the author',
        folder_id: folderId,
        assignee_id: author.id,
      },
      'the author creates and holds a task (spec 7.6)',
    )
    // Authored by the other member and assigned to the author, so a
    // projection that confused the two fields is red on this row rather than
    // silently agreeing with itself.
    const byReader = await createTaskOk(
      reader,
      {
        title: 's18 ac249 written by the reader',
        folder_id: folderId,
        assignee_id: author.id,
      },
      'and the second member creates one, assigned away (spec 7.6)',
    )
    staged = {
      author,
      reader,
      folderId,
      byAuthorId: byAuthor.id,
      byReaderId: byReader.id,
    }
  }
  return staged
}

/** One task's `created_by` off all three surfaces the widened card reaches. */
async function creatorEverywhere(
  viewer: Actor,
  folderId: string,
  taskId: string,
): Promise<{ folderRead: unknown; viewBody: unknown; detail: unknown }> {
  const open = await folderOpen(viewer, folderId, tz)
  const folderCard = requireCard(
    [...open.scheduled, ...open.unscheduled],
    taskId,
    `the folder read must carry task ${taskId} (spec 6 Q7)`,
  )
  const viewCard = requireCard(
    tasksRowsOf(await tasksView(viewer, tz)),
    taskId,
    'and Q2 must carry the same undated open task (spec 6 Q2)',
  )
  const detail = await readTask(viewer, taskId)
  return {
    folderRead: folderCard.created_by,
    viewBody: viewCard.created_by,
    detail: detail.created_by,
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

describe('AC-249 the card names its creator', () => {
  test('AC-249: the stub is the one assignee carries for the same person', async () => {
    const { author, folderId, byAuthorId } = await stage()
    const open = await folderOpen(author, folderId, tz)
    const card = requireCard(
      open.unscheduled,
      byAuthorId,
      'the row is undated and open, so Q7 answers it in unscheduled (spec 6 Q7)',
    )
    expect(
      card.created_by,
      'unit 12a makes created_by the object assignee already carries, so one person read twice on one card is one shape rather than two projections that can drift (spec 7.0 as unit 12a replaces it, 7.4)',
    ).toEqual(card.assignee)
    expect(
      card.created_by?.id,
      'and it is the person who made the row (spec 4.5)',
    ).toBe(author.id)
  })

  test('AC-249: a viewer who did not create the row still reads its creator', async () => {
    const { author, reader, folderId, byReaderId } = await stage()
    const seen = await creatorEverywhere(author, folderId, byReaderId)
    // The expected values come from 4.1's row rather than from a literal, so
    // this asserts the projection and not the fixture's idea of a name.
    const row = await userRowById(app.db, reader.id)
    expect(
      seen.folderRead,
      'the reader authored this row and the author is looking at it: a projection answering the requesting user is right on every self-made task and wrong here (spec 4.5)',
    ).toEqual({
      id: reader.id,
      display_name: row?.display_name ?? null,
      avatar_url: row?.avatar_url ?? null,
    })
    expect(
      seen,
      'and the three producers of a card agree, the folder read, a view body and the detail alike (spec 7.10, 7.6)',
    ).toEqual({
      folderRead: seen.folderRead,
      viewBody: seen.folderRead,
      detail: seen.folderRead,
    })
  })

  test('AC-249: two rows in one folder name two different creators', async () => {
    const { author, reader, folderId, byAuthorId, byReaderId } = await stage()
    const rows = tasksRowsOf(await tasksView(author, tz)).filter(
      (row) => row.folder.id === folderId,
    )
    expect(
      [
        requireCard(rows, byAuthorId, 'the author\'s row is on Q2').created_by?.id,
        requireCard(rows, byReaderId, 'and the reader\'s row beside it').created_by?.id,
      ],
      'the field is the row\'s, never the folder\'s: an implementation reading the folder owner is green wherever one person made everything and red here (spec 4.5)',
    ).toEqual([author.id, reader.id])
  })

  test('AC-249: a live creator is never null', async () => {
    const { author, folderId, byAuthorId, byReaderId } = await stage()
    for (const taskId of [byAuthorId, byReaderId]) {
      const seen = await creatorEverywhere(author, folderId, taskId)
      expect(
        [seen.folderRead, seen.viewBody, seen.detail].every(
          (value) => value !== null,
        ),
        `task ${taskId}: 4.5 makes created_by NOT NULL and unit 12a admits null through one door only, 8.10's scrub, which AC-250 walks through`,
      ).toBe(true)
    }
  })
})
