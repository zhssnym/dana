/*
AC-390: the shape of the export document.

Given a person who owns a folder holding a task with a step, a page
paragraph, a description and a comment carrying a file, who has a shelf and a
saved view, and who is a member of somebody else's folder holding three tasks
— one they wrote, one assigned to them, one neither — when they GET
/api/v1/me/export, then the document is the whole of 7.22: `format`,
`version`, `exported_at`, `account`, `settings`, `folders` with their tasks,
steps, blocks and members as display names, `tasks_elsewhere` holding exactly
the two that are their own work, `comments`, `shelves`, `views`, `files` with
their 7.15 URLs, an empty `truncated`, and no `notifications` or `events` key
at all.

**The absence half is what makes this a criterion rather than a smoke test.**
The other member's own task must not be in `tasks_elsewhere`, and no email
address but the viewer's may appear anywhere in the bytes — asserted over the
raw response text rather than over a named field, because the point is that
no field anywhere in the document may carry one.

**One request serves the whole file, and that is deliberate rather than
thrift.** 7.22's limiter is five per hour per person and, unlike the four
limits in `security/rate-limit.ts` that precede it, it is *not* raised under
test, so that AC-392 can measure the mounted route rather than the limiter in
isolation. Six `exportOf` calls in one file would therefore have made the
sixth case fail as a 429 and read as a defect in the export. The memo below
is the whole answer; every case reads the same document, which is what these
cases are about anyway.

Spec: 7.22, 10.3, 10.9.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import {
  Cast,
  createShelf,
  createView,
  expectStatus,
  folderIn,
  requestExport,
  startAuthTestApp,
  twoWorkspaces,
} from './export-harness.js'
import type {
  AuthTestApp,
  ExportDocument,
  TwoWorkspaces,
} from './export-harness.js'
import type { RawResponse } from './http-client.js'

let app: AuthTestApp
let world: TwoWorkspaces
let answer: RawResponse | undefined
const cast = new Cast(['exporter', 'colleague'], 'ac390')

/** The one export this file makes, taken on first use so that a failure
 * reports under the case that asked for it rather than as a dead hook. */
async function exported(): Promise<RawResponse> {
  answer ??= await requestExport(world.viewer)
  return answer
}

async function document(): Promise<ExportDocument> {
  const response = await exported()
  expectStatus(
    response,
    200,
    'GET /api/v1/me/export must answer the caller their own data (spec 7.22)',
  )
  return response.json() as ExportDocument
}

beforeAll(async () => {
  app = await startAuthTestApp()
  world = await twoWorkspaces(app, cast)
  await createShelf(world.viewer, 'Reading')
  await createView(world.viewer, 'Everything pending')
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-390 the export is the whole 7.22 document', () => {
  test('it names itself and carries 7.22\'s top-level keys and no others', async () => {
    const exportDocument = await document()

    expect(exportDocument.format).toBe('dana-export')
    expect(exportDocument.version).toBe(1)
    expect(
      Number.isNaN(Date.parse(exportDocument.exported_at)),
      'exported_at is an ISO instant (spec 7.22)',
    ).toBe(false)

    expect(
      Object.keys(exportDocument).sort(),
      'the document is exactly 7.22\'s keys: notifications and events are excluded by name, so neither may appear',
    ).toEqual(
      [
        'account',
        'comments',
        'exported_at',
        'files',
        'folders',
        'format',
        'settings',
        'shelves',
        'tasks_elsewhere',
        'truncated',
        'version',
        'views',
      ].sort(),
    )
    expect(
      exportDocument.truncated,
      'nothing in this fixture approaches 10.3\'s 1000-row cap, so no collection is named',
    ).toEqual([])
  })

  test('account and settings are the person\'s own', async () => {
    const exportDocument = await document()

    expect(exportDocument.account.id).toBe(world.viewer.id)
    expect(exportDocument.account.email).toBe(world.viewer.email)
    expect(typeof exportDocument.account.timezone).toBe('string')
    expect(
      Number.isNaN(Date.parse(exportDocument.account.created_at)),
      'the account carries the day it was made (4.1)',
    ).toBe(false)

    /* 4.10's v2 bundle and its three v1 booleans, plus the two per-person
       page tables 7.19 and 7.21 own.

       **This list is 4.10's set and moves whenever 4.10 does**, which is what
       7.22's own row says the `settings` key is: "everything 4.10 holds for
       them". `calendar_zoom` joined it on 2026-09-04 (issue #142), and it
       arrives here for free because the document spreads `readBundle`'s
       answer rather than naming keys — so the endpoint needed no change and
       only this enumeration did. It was found at the wave-1 integration
       merge, the two branches having been open at once, and it is the reason
       to expect this line to move again: a criterion that enumerates a
       spec-derived set is red the day somebody extends the set, which is the
       criterion working. */
    expect(Object.keys(exportDocument.settings).sort()).toEqual(
      [
        'arrangements',
        'calendar_zoom',
        'clock',
        'pinned_views',
        'place_covers',
        'place_descriptions',
        'row_density',
        'show_all',
        'show_done',
        'show_important',
        'sidebar_order',
        'task_open',
        'theme',
      ].sort(),
    )
    expect(
      exportDocument.settings.place_descriptions.length,
      '7.21\'s read is dense: every place appears, carrying null where nothing was written',
    ).toBeGreaterThan(0)
  })

  test('an owned folder carries its tasks, steps, page and members', async () => {
    const exportDocument = await document()
    const folder = folderIn(exportDocument, world.ownFolderId)

    expect(folder.name).toBe('Viewer folder')
    expect(folder.description).toBe('What this folder is for.')
    expect(folder.trashed).toBe(false)
    expect(
      folder.members,
      'members are display names and nothing else (spec 7.22)',
    ).toEqual([expect.any(String)])

    const task = folder.tasks.find((entry) => entry.id === world.ownTask.id)
    expect(task, 'the folder carries its own tasks').toBeDefined()
    expect(task?.title).toBe('Viewer own task')
    expect(task?.notes).toBe('a note of my own')
    expect(task?.important).toBe(true)
    expect(task?.trashed).toBe(false)
    expect(
      task?.steps.map((step) => step.title),
      'a task carries its steps (4.6)',
    ).toEqual(['first step'])

    expect(
      folder.blocks.map((block) => block.text),
      'a folder carries its page (4.17)',
    ).toEqual(['A paragraph on my own page.'])

    expect(
      exportDocument.folders.some((entry) => entry.is_default),
      'the default folder every account is provisioned with is owned too',
    ).toBe(true)
  })

  test('tasks_elsewhere holds their own work and nothing else', async () => {
    const exportDocument = await document()
    const ids = exportDocument.tasks_elsewhere.map((task) => task.id)

    expect(
      ids,
      'a task the viewer wrote in somebody else\'s folder, and one assigned to them, are both their own work',
    ).toEqual(
      expect.arrayContaining([
        world.taskViewerWrote.id,
        world.taskAssignedToViewer.id,
      ]),
    )
    expect(
      ids,
      'the other member\'s own task is the owner\'s and belongs in the owner\'s export, not this one',
    ).not.toContain(world.taskOfTheirs.id)

    const wrote = exportDocument.tasks_elsewhere.find(
      (task) => task.id === world.taskViewerWrote.id,
    )
    expect(wrote?.folder.id).toBe(world.sharedFolderId)
    expect(wrote?.folder.name).toBe('Shared folder')
    expect(
      wrote?.steps.map((step) => step.title),
      'a task elsewhere carries its steps too (spec 7.22)',
    ).toEqual(['elsewhere step'])
  })

  test('comments, files, shelves and views are the person\'s own', async () => {
    const exportDocument = await document()

    const comment = exportDocument.comments.find(
      (entry) => entry.body === world.viewerCommentBody,
    )
    expect(comment, 'every comment the person authored (4.15)').toBeDefined()
    expect(comment?.folder_id).toBe(world.ownFolderId)
    expect(
      comment?.files.map((file) => file.id),
      'a comment carries the metadata of the files attached to it',
    ).toEqual([world.viewerFileId])

    const file = exportDocument.files.find(
      (entry) => entry.id === world.viewerFileId,
    )
    expect(file, 'every file the person owns (4.16)').toBeDefined()
    expect(file?.name).toBe('viewer-attachment.txt')
    expect(file?.bytes).toBe(12)
    expect(
      file?.url,
      '7.15\'s authenticated serving path, which is how the bytes are fetched: version 1 carries no bytes of its own',
    ).toBe(`/api/v1/files/${world.viewerFileId}`)

    expect(exportDocument.shelves.map((shelf) => shelf.name)).toContain(
      'Reading',
    )
    expect(exportDocument.views.map((view) => view.name)).toContain(
      'Everything pending',
    )
  })

  test('no email address but the caller\'s appears in the bytes', async () => {
    const response = await exported()

    expect(
      response.body.includes(world.other.email),
      'the other member appears as a display name and never as an address: an export is a file that leaves Dana (spec 7.22)',
    ).toBe(false)
    expect(
      response.body.includes(world.viewer.email),
      'the caller\'s own address is theirs, and 7.1 already shows it to them',
    ).toBe(true)
  })
})
