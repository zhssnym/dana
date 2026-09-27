/*
Strangers see nothing in lists and search.

`ac-397` drives every route whose **path** carries an id, so a list or a search
-- a route with no path id, or one that takes its id from the query string --
has no stranger test there. Each of them scopes itself by a membership join
written inside its own SQL, and a join left out answers 200 with somebody
else's rows. This guard covers that half.

**How.** An owner and a member share a folder full of one of everything a list
shows: tasks (open, due today, completed, trashed), a discussion (live and
trashed), a comment, a tab (live and trashed), a folder label, a file, a
trashed folder, an assignment notification. A stranger who shares nothing
then calls every mounted `GET /api/v1` route that takes no path parameter,
plus the query-id forms listed in `QUERY_ID_READS`, and no response may carry
any of those ids.

**The control.** The member makes the same calls, and every id in `LISTABLE`
must turn up in at least one of the member's answers. Without it, a fixture
that never reached any list would make the stranger's half pass vacuously.

**Enumerated, both directions.** A parameterless GET that is neither driven nor
named in `NOT_LISTS` fails here, and so does a `NOT_LISTS` entry that is no
longer mounted, so a new list route cannot arrive without a stranger test.

Seen red: removing the membership join from `accessibleTasks` in
`src/server/views/cards.ts` fails the stranger half on the views and search.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import {
  makeComment,
  makeDiscussion,
  makeTab,
  makeFile,
  makeFolderLabel,
  makeInvite,
  makeNotification,
  makeSharedFolder,
  makeTask,
  memoryFileStore,
  trashDiscussion,
  trashTab,
  trashFolder,
  trashTask,
} from '../support/authorization-harness.js'
import { Cast } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import { middayZone, todayIn } from '../support/views-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'member', 'stranger'], 'lvis')

beforeAll(async () => {
  app = await startAuthTestApp({ fileStore: memoryFileStore() })
}, 120_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

/** In every title and name, so a search has something to find. */
const NEEDLE = 'lvisneedle'

/**
 * Parameterless GETs that are not lists of anybody's rows, and why. Each must
 * still be mounted; a stale entry fails the enumeration test.
 */
const NOT_LISTS: Record<string, string> = {
  '/auth/google': 'the sign-in redirect',
  '/auth/google/callback': 'the sign-in callback',
  '/covers/photos': 'proxies a public photo search, reads no rows',
  '/events': 'needs a folder or subject scope; driven through QUERY_ID_READS',
}

/** Query strings for the routes that refuse to answer without one. */
function queryFor(route: string, tz: string): string {
  const today = todayIn(tz)
  switch (route) {
    case '/search':
      return `?tz=${tz}&q=${NEEDLE}`
    case '/references/search':
      return `?q=${NEEDLE}`
    case '/views/planned/calendar':
      return `?tz=${tz}&start=${today}&end=${today}`
    default:
      return route.startsWith('/views/') ? `?tz=${tz}` : ''
  }
}

/** Reads whose folder or subject id rides in the query string, which ac-397
 * cannot see. The stranger passes the owner's ids straight in. */
function queryIdReads(fx: Fixtures, tz: string): string[] {
  return [
    `/events?folder=${fx.folderId}`,
    `/events?subject=task:${fx.taskId}`,
    `/events?subject=folder:${fx.folderId}`,
    `/labels?scope=folder&folder_id=${fx.folderId}`,
    `/references/search?q=${NEEDLE}&folder=${fx.folderId}`,
    `/search?tz=${tz}&q=${NEEDLE}`,
  ]
}

interface Fixtures {
  owner: Actor
  member: Actor
  stranger: Actor
  folderId: string
  trashedFolderId: string
  taskId: string
  dueTaskId: string
  doneTaskId: string
  trashedTaskId: string
  assignedTaskId: string
  commentId: string
  discussionId: string
  trashedDiscussionId: string
  tabId: string
  trashedTabId: string
  folderLabelId: string
  fileId: string
  inviteId: string
  notificationId: string
}

/** Every id the stranger must never see. */
const HIDDEN: ReadonlyArray<keyof Fixtures> = [
  'folderId',
  'trashedFolderId',
  'taskId',
  'dueTaskId',
  'doneTaskId',
  'trashedTaskId',
  'assignedTaskId',
  'commentId',
  'discussionId',
  'trashedDiscussionId',
  'tabId',
  'trashedTabId',
  'folderLabelId',
  'fileId',
  'inviteId',
  'notificationId',
]

/** The ids some list must show the member, which proves each fixture is
 * reachable through a list at all. Hidden-only: the invite (the owner's own
 * list, not the member's), and the file, whose list takes the folder as a
 * path id and is ac-397's. A tab (step 7) is a page, listed with the folders. */
const HIDDEN_ONLY: ReadonlyArray<keyof Fixtures> = ['inviteId', 'fileId']
const LISTABLE: ReadonlyArray<keyof Fixtures> = HIDDEN.filter(
  (key) => !HIDDEN_ONLY.includes(key),
)

let fixtures: Fixtures | undefined

async function fixturesOf(tz: string): Promise<Fixtures> {
  if (fixtures !== undefined) return fixtures
  const [owner, member, stranger] = (await cast.of(app)) as [Actor, Actor, Actor]

  const folderId = await makeSharedFolder(app, owner, member, `${NEEDLE} shared`)
  const taskId = await makeTask(owner, folderId, `${NEEDLE} open task`)
  const dueTaskId = await makeTask(owner, folderId, `${NEEDLE} due task`)
  const due = await owner.browser.json(`/tasks/${dueTaskId}`, 'PATCH', {
    due_date: todayIn(tz),
  })
  expect(due.status, 'the owner dates a task for today').toBe(200)
  const doneTaskId = await makeTask(owner, folderId, `${NEEDLE} done task`)
  const done = await owner.browser.json(
    `/tasks/${doneTaskId}/complete?tz=${tz}`,
    'POST',
  )
  expect(done.status, 'the owner completes a task').toBe(200)
  const trashedTaskId = await makeTask(owner, folderId, `${NEEDLE} doomed task`)
  await trashTask(owner, trashedTaskId)

  // The owner assigns a task to the member, which leaves the member a
  // notification (8.11): the harness's owner/member roles are swapped here.
  const notificationId = await makeNotification(
    member,
    owner,
    folderId,
    `${NEEDLE} assigned task`,
  )
  const assigned = await member.browser.api('/notifications')
  const assignedTaskId = String(
    (
      assigned.json() as {
        notifications: Array<{ id: string; event: { subject_id: string } }>
      }
    ).notifications.find((row) => row.id === notificationId)?.event.subject_id,
  )

  const commentId = await makeComment(owner, folderId, `${NEEDLE} comment`)
  const discussionId = await makeDiscussion(owner, folderId, `${NEEDLE} discussion`)
  const trashedDiscussionId = await makeDiscussion(
    owner,
    folderId,
    `${NEEDLE} doomed discussion`,
  )
  await trashDiscussion(owner, trashedDiscussionId)
  const tabId = await makeTab(owner, folderId, `${NEEDLE} tab`)
  const trashedTabId = await makeTab(owner, folderId, `${NEEDLE} doomed tab`)
  await trashTab(owner, trashedTabId)
  const folderLabelId = await makeFolderLabel(owner, folderId, `${NEEDLE} label`)
  const fileId = await makeFile(owner, folderId, `${NEEDLE}.png`)
  const inviteId = await makeInvite(
    owner,
    folderId,
    `lvis-invitee-${String(Date.now())}@lvis.test`,
  )
  const trashedFolderId = await makeSharedFolder(
    app,
    owner,
    member,
    `${NEEDLE} doomed folder`,
  )
  await trashFolder(owner, trashedFolderId)

  fixtures = {
    owner,
    member,
    stranger,
    folderId,
    trashedFolderId,
    taskId,
    dueTaskId,
    doneTaskId,
    trashedTaskId,
    assignedTaskId,
    commentId,
    discussionId,
    trashedDiscussionId,
    tabId,
    trashedTabId,
    folderLabelId,
    fileId,
    inviteId,
    notificationId,
  }
  return fixtures
}

/* ------------------------------------------------------------------ *
 * The mounted parameterless GETs
 * ------------------------------------------------------------------ */

interface LayerShape {
  match?: (path: string) => boolean
  route?: { path: string | readonly string[]; methods: Record<string, boolean> }
  handle?: { stack?: LayerShape[] }
}

function parameterlessGets(application: unknown): string[] {
  const stack = (application as { router?: { stack?: LayerShape[] } }).router
    ?.stack
  expect(Array.isArray(stack), 'the application exposes router.stack').toBe(true)
  const found = new Set<string>()
  for (const layer of stack as LayerShape[]) {
    const sub = layer.handle?.stack
    if (!Array.isArray(sub) || layer.match?.('/api/v1') !== true) continue
    for (const nested of sub) {
      const route = nested.route
      if (route?.methods.get !== true) continue
      const paths = typeof route.path === 'string' ? [route.path] : route.path
      for (const path of paths) if (!path.includes(':')) found.add(path)
    }
  }
  return [...found].sort()
}

function driven(application: unknown): string[] {
  return parameterlessGets(application).filter((route) => !(route in NOT_LISTS))
}

async function answers(
  actor: Actor,
  paths: readonly string[],
): Promise<Map<string, { status: number; body: string }>> {
  const out = new Map<string, { status: number; body: string }>()
  for (const path of paths) {
    const response = await actor.browser.api(path)
    out.set(path, { status: response.status, body: response.body })
  }
  return out
}

describe('lists and search show a stranger none of another person\'s rows', () => {
  const tz = middayZone()

  test('every parameterless GET is driven or named as not a list', () => {
    const mounted = parameterlessGets(app.application)
    const stale = Object.keys(NOT_LISTS).filter((route) => !mounted.includes(route))
    expect(stale, 'NOT_LISTS names routes that are no longer mounted').toEqual([])
    expect(driven(app.application).length, 'the walk found list routes').toBeGreaterThan(0)
  })

  test('the stranger sees none of the ids; the member sees every listable one', async () => {
    const fx = await fixturesOf(tz)
    const paths = [
      ...driven(app.application).map((route) => `${route}${queryFor(route, tz)}`),
      ...queryIdReads(fx, tz),
    ]

    const memberSaw = await answers(fx.member, paths)
    const failed = [...memberSaw].filter(([, answer]) => answer.status >= 500)
    expect(failed, 'no list route errors for the member').toEqual([])
    const memberText = [...memberSaw.values()].map((answer) => answer.body).join('\n')
    const unseen = LISTABLE.filter((key) => !memberText.includes(String(fx[key])))
    expect(
      unseen,
      'every fixture must reach some list for the member, or the stranger half proves nothing',
    ).toEqual([])

    const strangerSaw = await answers(fx.stranger, paths)
    const leaks: string[] = []
    for (const [path, answer] of strangerSaw) {
      expect(answer.status, `${path} must not error for the stranger`).toBeLessThan(500)
      for (const key of HIDDEN) {
        if (answer.body.includes(String(fx[key]))) leaks.push(`${path} shows ${key}`)
      }
    }
    expect(leaks, 'a list or search showed a stranger another person\'s row').toEqual([])
  }, 120_000)
})
