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

Spec: 7.22, 10.2.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import {
  Cast,
  EXPORT_PATH,
  expectStatus,
  requestExport,
  startAuthTestApp,
  twoWorkspaces,
} from './export-harness.js'
import type { AuthTestApp, TwoWorkspaces } from './export-harness.js'

let app: AuthTestApp
let world: TwoWorkspaces
const cast = new Cast(['owner', 'stranger'], 'ac391')

beforeAll(async () => {
  app = await startAuthTestApp()
  world = await twoWorkspaces(app, cast)
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
