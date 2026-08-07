/*
AC-051: given undated tasks in the Inbox and in a custom folder, then Tasks
renders Inbox rows ungrouped on top and the rest under folder headings.

"Ungrouped on top" is a shape, not an order, and 7.10 gives it a key of its
own: the default folder's rows are `inbox` and every other folder is a
`groups` element. So the criterion is asserted against the two keys rather
than against a position in one list, which is what an implementation would
have to get wrong for the page to render the heading the criterion forbids.

Q2 says which default folder this is, and it is worth saying why the answer
is never plural: the only accessible default folder is V's own, because
defaults are never shared (INV-3). A second member's Inbox is not merely
absent from the groups, it is outside ACCESSIBLE(V) entirely.

Two orders are attacked rather than observed. Groups are ordered by
lower(folder name), so the fixture names its folders Zeta and alpha: a
case-sensitive sort puts Zeta first, and only a fixture whose names disagree
about case can tell the two apart. And rows inside a group are ordered by
status_rank before created_at descending, so the fixture's abandoned row is
the newest one in its folder; an implementation sorting by recency alone
would lead with it.

Spec: 6 Q2 (predicate, grouping, sort), INV-3, 7.10.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast, createFolder, defaultFolderOf } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import { expectTaskInvariants } from './tasks-harness.js'
import {
  idsOf,
  middayZone,
  requireGroup,
  seedViewTask,
  tasksView,
  todayIn,
} from './views-harness.js'

let app: AuthTestApp
const cast = new Cast(['viewer', 'outsider'], 'p4')

const tz = middayZone()

interface Stage {
  viewer: Actor
  inboxId: string
  zetaId: string
  alphaId: string
  emptyId: string
  inboxOlder: string
  inboxNewer: string
  zetaPending: string
  zetaAbandoned: string
  alphaRow: string
  datedInAlpha: string
  completedInAlpha: string
  outsiderInboxId: string
  outsiderRow: string
}
let staged: Stage | undefined

const MINUTE = 60_000

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const [viewer, outsider] = await cast.of(app)
    if (viewer === undefined || outsider === undefined) {
      throw new Error('cast must produce two actors')
    }
    const inboxId = await defaultFolderOf(app.db, viewer.id)
    // Named so a case-sensitive sort disagrees with lower(name): 'Z' < 'a'
    // in byte order, 'alpha' < 'zeta' in the order Q2 asks for.
    const zetaId = await createFolder(viewer, 'Zeta')
    const alphaId = await createFolder(viewer, 'alpha')
    const emptyId = await createFolder(viewer, 'beta with no undated rows')

    const at = (minutesAgo: number) =>
      new Date(Date.now() - minutesAgo * MINUTE).toISOString()
    const seed = (options: Parameters<typeof seedViewTask>[1]) =>
      seedViewTask(app.db, { ...options, assigneeId: viewer.id })

    const inboxOlder = await seed({
      folderId: inboxId,
      createdBy: viewer.id,
      title: 'p4 ac051 inbox older',
      createdAt: at(20),
    })
    const inboxNewer = await seed({
      folderId: inboxId,
      createdBy: viewer.id,
      title: 'p4 ac051 inbox newer',
      createdAt: at(10),
    })
    const zetaPending = await seed({
      folderId: zetaId,
      createdBy: viewer.id,
      title: 'p4 ac051 zeta pending, older',
      createdAt: at(20),
    })
    // Newer than the pending row, so created_at descending alone would lead
    // with it; status_rank puts pending = 0 ahead of abandoned = 1 first.
    const zetaAbandoned = await seed({
      folderId: zetaId,
      createdBy: viewer.id,
      title: 'p4 ac051 zeta abandoned, newer',
      status: 'abandoned',
      createdAt: at(5),
    })
    const alphaRow = await seed({
      folderId: alphaId,
      createdBy: viewer.id,
      title: 'p4 ac051 alpha row',
      createdAt: at(15),
    })
    // Q2's predicate is due_date IS NULL and an open status; these two are
    // in an accessible folder and belong to other pages entirely.
    const datedInAlpha = await seed({
      folderId: alphaId,
      createdBy: viewer.id,
      title: 'p4 ac051 alpha dated',
      dueDate: todayIn(tz),
    })
    const completedInAlpha = await seed({
      folderId: alphaId,
      createdBy: viewer.id,
      title: 'p4 ac051 alpha completed',
      status: 'completed',
    })
    // The empty folder holds one row that Q2 excludes, so its absence from
    // the groups is about the predicate rather than about the folder.
    await seed({
      folderId: emptyId,
      createdBy: viewer.id,
      title: 'p4 ac051 beta completed only',
      status: 'completed',
    })

    // A second account with an undated row of its own, which this page must
    // never reach: the scope predicate is folder_id IN ACCESSIBLE(V).
    const outsiderInboxId = await defaultFolderOf(app.db, outsider.id)
    const outsiderRow = await seedViewTask(app.db, {
      folderId: outsiderInboxId,
      createdBy: outsider.id,
      assigneeId: outsider.id,
      title: 'p4 ac051 outsider undated',
    })

    staged = {
      viewer,
      inboxId,
      zetaId,
      alphaId,
      emptyId,
      inboxOlder,
      inboxNewer,
      zetaPending,
      zetaAbandoned,
      alphaRow,
      datedInAlpha,
      completedInAlpha,
      outsiderInboxId,
      outsiderRow,
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

describe('AC-051: Tasks puts the Inbox on top, ungrouped, and groups the rest', () => {
  test('AC-051: the Inbox rows are the ungrouped key, newest first', async () => {
    const { viewer, inboxOlder, inboxNewer } = await stage()
    const body = await tasksView(viewer, tz)
    expect(
      idsOf(body.inbox),
      'Q2 renders V\'s default folder first, ungrouped and with no heading, and 7.10 gives it its own key; inside it the order is status_rank, created_at descending, id descending',
    ).toEqual([inboxNewer, inboxOlder])
  })

  test('AC-051: the default folder is never also a group', async () => {
    const { viewer, inboxId } = await stage()
    const body = await tasksView(viewer, tz)
    expect(
      body.groups.map((group) => group.folder.id),
      'a heading over the Inbox is the one rendering this criterion forbids, and duplicating its rows into a group would draw it',
    ).not.toContain(inboxId)
  })

  test('AC-051: groups are ordered by lower(folder name), not by byte order', async () => {
    const { viewer, alphaId, zetaId } = await stage()
    const body = await tasksView(viewer, tz)
    expect(
      body.groups.map((group) => group.folder.id),
      'Q2 orders groups by lower(folder name) ascending then folder id, so "alpha" precedes "Zeta"; a case-sensitive sort would answer these two in the opposite order, which is the whole reason the fixture names them so',
    ).toEqual([alphaId, zetaId])
    expect(
      body.groups.map((group) => group.folder.name),
      'and the heading carries the folder\'s own name, uppercase intact',
    ).toEqual(['alpha', 'Zeta'])
  })

  test('AC-051: a folder with no undated open rows produces no group', async () => {
    const { viewer, emptyId } = await stage()
    const body = await tasksView(viewer, tz)
    expect(
      body.groups.map((group) => group.folder.id),
      'Q2 groups one folder per remaining folder having at least one row: an empty heading is not a rendering this page has',
    ).not.toContain(emptyId)
  })

  test('AC-051 adversarial: status_rank beats recency inside a group', async () => {
    const { viewer, zetaId, zetaPending, zetaAbandoned } = await stage()
    const body = await tasksView(viewer, tz)
    const zeta = requireGroup(
      body.groups,
      zetaId,
      'the Zeta group must exist to be ordered',
    )
    expect(
      idsOf(zeta.rows),
      'Q2 sorts by status_rank first, pending = 0 before abandoned = 1, and only then by created_at descending. The abandoned row here is the newer of the two, so an implementation sorting by recency alone leads with it',
    ).toEqual([zetaPending, zetaAbandoned])
  })

  test('AC-051 adversarial: dated and completed rows are not on this page', async () => {
    const { viewer, datedInAlpha, completedInAlpha } = await stage()
    const body = await tasksView(viewer, tz)
    const everything = [
      ...idsOf(body.inbox),
      ...body.groups.flatMap((group) => idsOf(group.rows)),
    ]
    expect(
      everything,
      'Q2 adds due_date IS NULL to the shared scope; a dated row is Planned\'s and 6.1 proves the two never overlap',
    ).not.toContain(datedInAlpha)
    expect(
      everything,
      'and Q2 admits pending and abandoned only, so a completed row belongs to Done',
    ).not.toContain(completedInAlpha)
  })

  test('AC-051 adversarial: another account\'s Inbox is out of scope entirely', async () => {
    const { viewer, outsiderInboxId, outsiderRow } = await stage()
    const body = await tasksView(viewer, tz)
    expect(
      body.groups.map((group) => group.folder.id),
      'a default folder is never shared (INV-3), so the only accessible default folder is V\'s own and no other account\'s Inbox can appear as a group',
    ).not.toContain(outsiderInboxId)
    expect(
      [...idsOf(body.inbox), ...body.groups.flatMap((group) => idsOf(group.rows))],
      'nor can its rows arrive folded into V\'s own ungrouped section, which is the shape that would hide the leak',
    ).not.toContain(outsiderRow)
  })

  test('AC-051: truncated is false well under the 1000-row cap', async () => {
    const { viewer } = await stage()
    const body = await tasksView(viewer, tz)
    expect(
      body.truncated,
      'section 6 caps this list at 1000 rows and sets the flag beyond it; the fixture holds five',
    ).toBe(false)
  })

  test('AC-051: the fixture satisfies section 3', async () => {
    const { viewer, inboxId, zetaId, alphaId, emptyId, inboxOlder, zetaPending, alphaRow } =
      await stage()
    await expectTaskInvariants(
      app.db,
      [inboxOlder, zetaPending, alphaRow],
      [inboxId, zetaId, alphaId, emptyId],
      [viewer.id],
    )
  })
})
