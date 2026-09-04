/*
AC-391: the export is gated on a session and answers only the caller's own
data.

Given no session, when GET /api/v1/me/export is called, then 401 — which
AC-236's reading sweep also asserts structurally, and which is repeated here
behaviourally because that sweep enumerates the router while this criterion
is about the endpoint. Given two people with folders, tasks, comments and
files of their own, when each exports, then neither document carries a single
row of the other's: not the private folder, not the task in it, not the
comment, not the file.

**Measured rather than reasoned, and over the raw bytes.** The assertions
search the whole response text for the other person's ids, titles and
address, so a leak through a field nobody thought to name is still a failure.
This is the criterion that would notice a statement in `domain/export.ts`
losing the join that scopes it, which 10.2 says nothing structural can catch.

**And the two tempting rows are planted where a wrong scope would reach
them.** A folder somebody else owns is easy to keep out; the interesting rows
are the ones *inside a folder the viewer owns and can read*. So this fixture
puts another person's comment, and another person's file, in a folder the
viewer owns and the other person is a member of. Both must be absent, and for
different reasons that a single wrong `JOIN` would break separately:
`comments` is keyed by `author_id` and not by folder visibility, and `files`
is keyed by `owner_id` and not by whether the viewer may read the bytes. The
viewer can see both through 7.14 and 7.15 and neither is theirs to export.

Spec: 7.22, 10.2.
*/
import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { exportForViewer } from '../src/server/domain/export.js'
import {
  Cast,
  EXPORT_PATH,
  expectStatus,
  requestExport,
  seedFile,
  startAuthTestApp,
  twoWorkspaces,
  writeComment,
} from './export-harness.js'
import type {
  AuthTestApp,
  ExportDocument,
  TwoWorkspaces,
} from './export-harness.js'
import { addMemberOk, createFolder } from './folders-harness.js'

let app: AuthTestApp
let world: TwoWorkspaces
/** A folder the viewer owns, holding rows that are somebody else's. */
let sharedOwnedFolderId: string
let intruderFileId: string
const intruderComment = 'A comment the other person wrote in my own folder.'
const cast = new Cast(['owner', 'stranger'], 'ac391')

beforeAll(async () => {
  app = await startAuthTestApp()
  world = await twoWorkspaces(app, cast)

  sharedOwnedFolderId = await createFolder(world.viewer, 'My folder, their words')
  await addMemberOk(world.viewer, sharedOwnedFolderId, world.other.id)
  intruderFileId = await seedFile(
    app.db,
    world.other.id,
    sharedOwnedFolderId,
    'their-attachment.txt',
  )
  await writeComment(
    world.other,
    sharedOwnedFolderId,
    intruderComment,
    intruderFileId,
  )
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-391 the export needs a session and answers one person', () => {
  test('a caller with no session is refused 401 and told nothing else', async () => {
    const response = await app.browser().api(EXPORT_PATH)

    expectStatus(
      response,
      401,
      'GET /api/v1/me/export requires a session: every read does, and nothing structural adds it (spec 10.2)',
    )
    const body = response.json() as { error?: { code?: string } }
    expect(
      body.error?.code,
      'the 7.0 envelope, the same refusal every other read gives',
    ).toBe('unauthenticated')
  })

  test('the viewer\'s export carries no row of the other person\'s', async () => {
    const response = await requestExport(world.viewer)
    expectStatus(response, 200, 'the viewer exports their own data')
    const text = response.body

    for (const [what, needle] of [
      ['the private folder\'s id', world.privateFolderId],
      ['the private task\'s id', world.privateTask.id],
      ['the private task\'s title', world.privateTask.title],
      ['the other member\'s own task id', world.taskOfTheirs.id],
      ['the other member\'s own task title', world.taskOfTheirs.title],
      ['the other person\'s email address', world.other.email],
    ] as const) {
      expect(
        text.includes(needle),
        `${what} must not appear anywhere in the viewer's export; every statement in domain/export.ts is scoped to the caller inside its own FROM clause (spec 10.2)`,
      ).toBe(false)
    }
  })

  test('another person\'s comment and file inside the viewer\'s own folder are not the viewer\'s to export', async () => {
    const response = await requestExport(world.viewer)
    expectStatus(response, 200, 'the viewer exports their own data')
    const document = response.json() as ExportDocument

    // The folder itself is theirs and must be in the document, or the two
    // absences below are satisfied by the viewer simply not seeing it.
    expect(
      document.folders.some((folder) => folder.id === sharedOwnedFolderId),
      'the folder is the viewer\'s own and belongs in their export',
    ).toBe(true)

    expect(
      document.comments.some((comment) => comment.body === intruderComment),
      'a comment in the viewer\'s own folder written by somebody else is that person\'s: `comments` is keyed by author_id, never by which folders the caller can read (spec 7.22)',
    ).toBe(false)
    expect(
      document.files.some((file) => file.id === intruderFileId),
      'a file the viewer can read through 7.15 is not a file the viewer owns: `files` is keyed by owner_id, and readability is not ownership',
    ).toBe(false)
    expect(
      response.body.includes(intruderComment),
      'and it is nowhere else in the bytes either — not on a folder, not on a comment thread, not as a file name',
    ).toBe(false)

    // The positive control: the viewer's own comment and own file, in the
    // same document, so the two checks above cannot pass by emptiness.
    expect(
      document.comments.some(
        (comment) => comment.body === world.viewerCommentBody,
      ),
      'the viewer\'s own comment is there, or the assertions above prove nothing',
    ).toBe(true)
    expect(
      document.files.some((file) => file.id === world.viewerFileId),
      'the viewer\'s own file is there, for the same reason',
    ).toBe(true)
  })

  test('the domain read answers null for an id no live account holds', async () => {
    /*
    This is the branch `routes/export.ts` turns into a 401, and it cannot be
    driven over HTTP: `resolveSession` refuses any session whose user row has
    `deleted_at` set, in the same statement that rolls the expiry, so the
    handler is unreachable with a viewer id that has no live account. The
    branch is defence in depth, matching 7.1's `handleGetMe`, and it is
    asserted here at the only level where it is reachable at all.
    */
    expect(
      await exportForViewer(app.db, randomUUID()),
      'an id no live account holds exports nothing, rather than an empty document that would read as a person who has nothing',
    ).toBeNull()
  })

  test('the other person\'s export carries no row of the viewer\'s', async () => {
    const response = await requestExport(world.other)
    expectStatus(response, 200, 'the other person exports their own data')
    const text = response.body

    // The shared folder is theirs, so its id and the tasks in it are theirs
    // to hold. What must not be there is anything of the viewer's own
    // workspace, and the viewer's address.
    for (const [what, needle] of [
      ['the viewer\'s folder id', world.ownFolderId],
      ['the viewer\'s task id', world.ownTask.id],
      ['the viewer\'s task title', world.ownTask.title],
      ['the viewer\'s comment', world.viewerCommentBody],
      ['the viewer\'s file id', world.viewerFileId],
      ['the viewer\'s email address', world.viewer.email],
    ] as const) {
      expect(
        text.includes(needle),
        `${what} must not appear in the other person's export, membership of one folder being no claim on anything outside it (spec 10.2)`,
      ).toBe(false)
    }

    // And it does hold their own: an empty document would pass every
    // assertion above and prove nothing.
    expect(
      text.includes(world.privateTask.title),
      'their own private task is in their own export, or the checks above are satisfied by an empty file',
    ).toBe(true)
  })
})
