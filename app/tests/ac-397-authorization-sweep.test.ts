/*
AC-397: structural: every route on the mounted application whose path carries
a resource id is driven as a signed-in person with no relationship to the
thing that id names, and answers 404 — or 403 where 5.4 grants visibility and
withholds the act — enumerated over the router rather than sampled, with the
membership variants the 5.4 matrix distinguishes asserted beside the
stranger's.

## Why this file exists

`ac-236` made **authentication** structural, on every method since issue #33.
Authorization was left resting entirely on people remembering: spec 10.2 was
corrected on 2026-08-31 to say so plainly, and issue #74 counted what it rests
on — **twenty hand-written `accessOf(...)` calls across nine files, and
forgetting one fails nothing**. A GET that takes a session and then reads
whatever id it is handed passed the entire suite before this file.

The mitigation that does exist is genuinely good and is why this was a gap
rather than a live vulnerability: the membership check is written inside the
`FROM` clause, so a query that forgets it returns nothing rather than someone
else's rows. That stops being enough the moment a query does the check in its
caller, which is issue #35.

## What makes the table worth having

**Nothing about the table below is clever, and that is not the point.** It is
hand-written, it will always be hand-written, and a row can be wrong. The one
property that makes it a guard rather than a list is that it is **enumerated
over the mounted router in both directions**: a route the walker finds and the
table does not name fails here, and a table entry naming a route that is not
mounted fails here too. So a new id-bearing route cannot join this
application without someone deciding, in the same change, what a stranger
gets when they ask for somebody else's row. That is the same bargain
`PUBLIC_READS` strikes in `ac-236` after issue #33, and it is the whole
reason either allowlist is worth the words.

What neither guard can do is stop someone adding a route and its row in one
change without thinking. That is a reviewer's job, and the `rule` string on
every row is what the reviewer reads.

## The walker is this file's own, deliberately

`ac-236` walks the router the same way and the two are not shared. If one
walker served both, a fault in it would shrink both enumerations at once and
both pinned counts would be corrected to match, in one commit, with nothing
left to disagree. Two walkers, two counts, and a discrepancy between them is
a thing a person can see. Both are one level deep for the same reason and
with the same consequence, which `ac-236`'s header sets out at length: a
router mounted inside a router contributes nothing to either enumeration and
says nothing about it, and the counts are what would notice.

## The three kinds of row

- **`stranger`**, on all but four routes: user B, signed in, with no
  membership, no authorship and no connection to anything user A made. 404 is
  the answer 10.2 requires, because a 403 tells a prober that the row exists.
- **`member`**, on the eleven routes where 5.4, 7.15 or the code's own DES-225
  split grants a member visibility and withholds the act: 403, and the refusal
  may say why, precisely because the person can already see the thing. One of
  the eleven, `DELETE /api/v1/files/:id`, is the defect this sweep found; it is
  fixed, and its row carries the story.
- **`viewerScoped`**, on four routes, which are this file's `PUBLIC_READS`:
  the id in the path names no row of ours that could belong to somebody else,
  so every signed-in caller gets the same answer and the row records why. An
  entry here is a claim that needs reading, not a hole being papered over.

## What the two controls prove, and what they do not

Every row here expects a refusal, and `index.ts` mounts a catch-all at `/api`
answering the same `404 not_found` a gated route does, so a row that reaches
nothing looks exactly like a row that reached a working gate. Two tests stand
between this file and that, and **neither is the other, which is why they are
two**:

- **The template match** takes every row's concrete path and checks it against
  the route pattern its key names, segment by segment. Combined with the
  enumeration, that proves **the request reached that route's handler**. It
  proves nothing about the id: a `:param` slot accepts any non-empty segment,
  so a row handing a route a uuid belonging to nobody passes it.
- **The visibility control** drives the fixtures' own maker at each of them and
  requires 200. That proves **the rows exist and are the kind of thing the
  route is about**. It is a `Record` over `ResourceId`, so an id cannot join
  the fixtures without a probe. It says nothing about which row the table
  hands to which route.

Between them: the request reached the route, and the id names a real row of
the right kind. **What is still uncovered** is a row handing route A the id of
a real fixture meant for route B — both controls pass, and the answer would be
an honest 404 about the wrong thing. Nothing structural catches that; it is
read in review, off the `rule` string, which is one more reason every row owes
one.

Spec: 5.4, 7.0, 7.13, 7.15, 10.2. Issue #74.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import {
  STUB_PHOTO_ID,
  makeComment,
  makeFile,
  makeInvite,
  makeNotification,
  makePlaceCover,
  makeSavedView,
  makeSharedFolder,
  makeShelf,
  makeStep,
  makeTask,
  memoryFileStore,
  startUpstreamStub,
  trashFolder,
  trashTask,
  writePage,
} from './authorization-harness.js'
import type { UpstreamStub } from './authorization-harness.js'
import { Cast } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import type { RawResponse } from './http-client.js'

let app: AuthTestApp
let upstream: UpstreamStub
const cast = new Cast(['owner', 'member', 'stranger'], 'ac397')

beforeAll(async () => {
  upstream = await startUpstreamStub()
  process.env.OPENVERSE_BASE = upstream.base
  app = await startAuthTestApp({ fileStore: memoryFileStore() })
}, 120_000)

afterAll(async () => {
  delete process.env.OPENVERSE_BASE
  if ((upstream as UpstreamStub | undefined) !== undefined) {
    await upstream.close()
  }
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

/* ------------------------------------------------------------------ *
 * Walking the mounted router
 * ------------------------------------------------------------------ */

/* The shapes below restate what the walk reads from Express rather than
 * importing Express's own types: this suite measures the mounted artifact
 * and cannot borrow its definition of correct (the auth-harness rule). */
interface RouteShape {
  path: string | readonly string[]
  methods: Record<string, boolean>
}
interface LayerShape {
  match?: (path: string) => boolean
  route?: RouteShape
  handle?: { stack?: LayerShape[] }
}

const METHODS = ['get', 'post', 'patch', 'put', 'delete'] as const

/**
 * Mount points this application uses. A router layer is attributed to the
 * first one its own regexp accepts.
 *
 * **`/api` was here and had to come out (review of 2026-09-04).** A layer's
 * `match` is a prefix test, so a router mounted at bare `/api` accepts
 * `/api/v1` too and would have been attributed to the first candidate in the
 * list. Its routes would then have been keyed `/api/v1/whatever`, tabulated
 * under that name, and driven at a path no route matches — straight into the
 * `/api` catch-all, which answers the same 404 the table expects. The bad
 * outcome is not a red run, it is a green one over routes nobody swept. So
 * this list holds only mounts that are unambiguous, `ROUTE_BASE` below fixes
 * the one prefix rows are written against, a router matching none of them is
 * reported by name rather than silently keyed at the root, and the
 * no-mount-is-a-prefix-of-another rule the attribution rests on is asserted in
 * the enumeration test rather than left to whoever edits this line.
 *
 * **`/api/csp-report` was added by that guard rather than by foresight**, on
 * 2026-09-04 at the wave-1 integration merge: issue #99's router is mounted at
 * its own path, the walk had no name for it, and the run went red naming a
 * route path of `/`. That is the whole of what the guard is for, and it is
 * worth recording that its first firing was a true one. The route carries no
 * parameter, so it enumerates and is then filtered out; what would have
 * happened without the guard is that it, and anything later mounted beside it,
 * would have been keyed under whichever mount matched first.
 */
const MOUNTS = ['/api/v1', '/api/health', '/api/csp-report']

/** The prefix `drive` sends every row through, via `TestBrowser.api`. Rows
 * are written relative to it and the enumeration test asserts every table key
 * carries it, so `matchesTemplate` naming it below is a checked assumption
 * rather than a buried one. */
const ROUTE_BASE = '/api/v1'

/** The one of 4.20's eight pages the viewer-scoped rows write on. Named once
 * because three things have to agree about it: the cover the owner sets in the
 * fixtures, the rows the stranger drives, and the assertion at the end that
 * the owner's row survived them. */
const PLACE = 'today'

/** A path segment that is a parameter. Every one of them on this surface
 * names a row or a place; `addressable` in `ac-236` uses the same shape. */
const PARAMETER = /:[A-Za-z_]+/

function mountedRoutes(application: unknown): string[] {
  const stack = (application as { router?: { stack?: LayerShape[] } }).router
    ?.stack
  expect(
    Array.isArray(stack),
    'the mounted application no longer exposes router.stack: the sweep must be rewritten against the new shape, never skipped',
  ).toBe(true)

  const found: string[] = []
  const collect = (route: RouteShape, mount: string): void => {
    const paths = typeof route.path === 'string' ? [route.path] : route.path
    for (const method of METHODS) {
      if (route.methods[method] !== true) continue
      for (const path of paths) {
        found.push(`${method.toUpperCase()} ${mount}${path}`)
      }
    }
  }

  const unattributed: string[] = []
  for (const layer of stack as LayerShape[]) {
    if (layer.route !== undefined) {
      collect(layer.route, '')
      continue
    }
    const sub = layer.handle?.stack
    if (!Array.isArray(sub)) continue
    const mount = MOUNTS.find((candidate) => layer.match?.(candidate) === true)
    if (mount === undefined) {
      // A router carrying routes and mounted somewhere this file does not
      // know about. Keying it at the root would put its routes in the
      // enumeration under names no row can match and no request can reach,
      // which is the failure MOUNTS' comment above describes.
      for (const nested of sub) {
        if (nested.route !== undefined) unattributed.push(String(nested.route.path))
      }
      continue
    }
    for (const nested of sub) {
      if (nested.route !== undefined) collect(nested.route, mount)
    }
  }
  expect(
    unattributed,
    `routes on a router mounted outside ${MOUNTS.join(' and ')}. The walk cannot name them, so it cannot sweep them: add the mount to MOUNTS, and check that no mount in that list is a prefix of another`,
  ).toEqual([])
  return [...new Set(found)]
}

function idBearingRoutes(application: unknown): string[] {
  return mountedRoutes(application).filter((route) => PARAMETER.test(route))
}

/* ------------------------------------------------------------------ *
 * The fixtures every row addresses
 * ------------------------------------------------------------------ */

/**
 * Every id the table addresses, as a union rather than as loose fields.
 *
 * **The union is what makes the visibility control complete instead of
 * diligent** (review of 2026-09-04). That control was a hand-written list of
 * probes, and a hand-written list is exactly the thing this file exists to
 * refuse: an id added here and forgotten there would be swept while nothing
 * proved it was a real row, and every 404 about it would be honest about the
 * wrong thing. The probes below are a `Record` over this union, so the
 * compiler refuses a new id that nobody proves visible.
 */
type ResourceId =
  | 'folderId'
  | 'trashedFolderId'
  | 'taskId'
  | 'trashedTaskId'
  | 'stepId'
  | 'shelfId'
  | 'viewId'
  | 'commentId'
  | 'fileId'
  | 'inviteId'
  | 'notificationId'

interface Fixtures extends Record<ResourceId, string> {
  owner: Actor
  member: Actor
  stranger: Actor
}

let fixtures: Fixtures | undefined

/** Built once and shared by the three tests below, because building them is
 * about thirty requests and none of the tests mutates anything: every row
 * that is not `viewerScoped` expects a refusal, and a refusal changes no row.
 * The `viewerScoped` four write only the caller's own. */
async function fixturesOf(): Promise<Fixtures> {
  if (fixtures !== undefined) return fixtures
  const [owner, member, stranger] = (await cast.of(app)) as [
    Actor,
    Actor,
    Actor,
  ]

  const folderId = await makeSharedFolder(app, owner, member, 'ac397 shared')
  const taskId = await makeTask(owner, folderId, 'ac397 the task')
  const stepId = await makeStep(owner, taskId, 'ac397 the step')
  const fileId = await makeFile(owner, folderId, 'ac397.png')
  const commentId = await makeComment(owner, folderId, 'ac397 the comment')
  const shelfId = await makeShelf(owner, 'ac397 the shelf')
  const viewId = await makeSavedView(owner, 'ac397 the view')
  const inviteId = await makeInvite(
    owner,
    folderId,
    `ac397-invitee-${String(Date.now())}@ac397.test`,
  )
  const notificationId = await makeNotification(
    owner,
    member,
    folderId,
    'ac397 the assignment',
  )
  await writePage(owner, 'folders', folderId, 'ac397 folder page')
  await writePage(owner, 'shelves', shelfId, 'ac397 shelf page')

  /* The owner's cover on the same place the viewer-scoped rows write, so
     those rows assert something. Without it the stranger's PUT and DELETE on
     `today` touch a place nobody had claimed, and "the statement carries
     user_id = viewer" would be a sentence in a comment rather than a thing
     the run demonstrates. See PLACE, and the last test in this file. */
  await makePlaceCover(owner, PLACE, fileId)

  const trashedTaskId = await makeTask(owner, folderId, 'ac397 the doomed task')
  await trashTask(owner, trashedTaskId)
  const trashedFolderId = await makeSharedFolder(
    app,
    owner,
    member,
    'ac397 doomed',
  )
  await trashFolder(owner, trashedFolderId)

  fixtures = {
    owner,
    member,
    stranger,
    folderId,
    trashedFolderId,
    taskId,
    trashedTaskId,
    stepId,
    shelfId,
    viewId,
    commentId,
    fileId,
    inviteId,
    notificationId,
  }
  return fixtures
}

/* ------------------------------------------------------------------ *
 * The table
 * ------------------------------------------------------------------ */

interface Attempt {
  /** The path under /api/v1, with the fixture's real ids substituted. */
  path: string
  body?: unknown
}

interface Variant {
  /** The status the spec requires of this caller on this route. */
  expected: number
  /** The rule that says so. Every row owes one; this is what a reviewer
   * reads when a route and its row arrive in the same change. */
  rule: string
  attempt?: (fx: Fixtures) => Attempt
  /**
   * A finding this sweep turned up that is not a missing `accessOf` and is
   * not this file's to decide. The variant is not weakened: `expected` stays
   * what the spec requires, and the variant moves out of the pass that would
   * fail and into the `test.fails` block at the end, which asserts the same
   * thing and is green only while the defect stands. The day it is fixed,
   * that block goes red and says to promote the variant back.
   */
  known?: string
}

interface Row {
  attempt: (fx: Fixtures) => Attempt
  /** Absent on the four viewer-scoped routes, which no stranger can miss. */
  stranger?: Variant
  /** Present on the routes where 5.4 or 7.15 grants a member visibility and
   * withholds the act. */
  member?: Variant
}

/*
Adding a route is adding one line here, and the wave-1 integration merge of
2026-09-04 is the first time that was measured rather than asserted. Three
routes it carried were named in this comment while they were still on other
branches: `POST /api/v1/shelves/:id/duplicate` arrived, cost exactly the one
row below it, and took the count from 59 to 60; `GET /api/v1/me/export` and
`POST /api/csp-report` carry no id and are outside this enumeration, which is
also why neither appears here. Nothing else about the table moved for a merge
that touched sixteen issues, which is the property the count is pinned for.
*/
const TABLE = new Map<string, Row>([
  /* -------------------------------------------------------------- *
   * Folders (5.4's own table)
   * -------------------------------------------------------------- */
  [
    'GET /api/v1/folders/:id',
    {
      attempt: (fx) => ({ path: `/folders/${fx.folderId}` }),
      stranger: {
        expected: 404,
        rule: '5.4 "See folder and every task in it: no (404)" for a non-member, and 10.2 forbids 403 here because it would confirm the folder exists',
      },
    },
  ],
  [
    'PATCH /api/v1/folders/:id',
    {
      attempt: (fx) => ({
        path: `/folders/${fx.folderId}`,
        body: { icon: 'star' },
      }),
      stranger: {
        expected: 404,
        rule: '5.4: a non-member sees nothing, so every act on the folder is 404',
      },
      member: {
        expected: 403,
        rule: '5.4 "Rename folder: no (403)" for a member, the DES-225 split: the folder-owned identity is any member\'s, the name is the owner\'s',
        attempt: (fx) => ({
          path: `/folders/${fx.folderId}`,
          body: { name: 'ac397 renamed by a member' },
        }),
      },
    },
  ],
  [
    'DELETE /api/v1/folders/:id',
    {
      attempt: (fx) => ({ path: `/folders/${fx.folderId}` }),
      stranger: { expected: 404, rule: '5.4: a non-member sees nothing' },
      member: {
        expected: 403,
        rule: '5.4 "Delete folder: no (403)" for a member',
      },
    },
  ],
  [
    'PATCH /api/v1/folders/:id/my-membership',
    {
      attempt: (fx) => ({
        path: `/folders/${fx.folderId}/my-membership`,
        body: { label: 'ac397' },
      }),
      stranger: {
        expected: 404,
        rule: '5.4 "Set or clear own label and color: no" for a non-member; the UPDATE is viewer-scoped besides',
      },
    },
  ],
  [
    'POST /api/v1/folders/:id/members',
    {
      attempt: (fx) => ({
        path: `/folders/${fx.folderId}/members`,
        body: { user_id: fx.stranger.id },
      }),
      stranger: {
        expected: 404,
        rule: '5.4 "Add members: no" for a non-member, and 10.2 makes it 404',
      },
    },
  ],
  [
    'DELETE /api/v1/folders/:id/members/:userId',
    {
      attempt: (fx) => ({
        path: `/folders/${fx.folderId}/members/${fx.member.id}`,
      }),
      stranger: { expected: 404, rule: '5.4: a non-member sees nothing' },
      member: {
        expected: 403,
        rule: '5.4 "Remove another member: no (403)" for a member',
        attempt: (fx) => ({
          path: `/folders/${fx.folderId}/members/${fx.owner.id}`,
        }),
      },
    },
  ],
  [
    'DELETE /api/v1/folders/:id/my-membership',
    {
      attempt: (fx) => ({ path: `/folders/${fx.folderId}/my-membership` }),
      stranger: {
        expected: 404,
        rule: '5.3\'s leave addressed as one\'s own membership: a non-member has none, and 10.2 answers 404 rather than naming the folder',
      },
    },
  ],
  [
    'POST /api/v1/folders/:id/transfer-ownership',
    {
      attempt: (fx) => ({
        path: `/folders/${fx.folderId}/transfer-ownership`,
        body: { to: fx.stranger.id },
      }),
      stranger: { expected: 404, rule: '5.4: a non-member sees nothing' },
      member: {
        expected: 403,
        rule: 'DES-225 and 8.9: ownership is the owner\'s to give, and the member demonstrably sees the folder, so the refusal may say why',
        attempt: (fx) => ({
          path: `/folders/${fx.folderId}/transfer-ownership`,
          body: { to: fx.member.id },
        }),
      },
    },
  ],
  [
    'POST /api/v1/folders/:id/restore',
    {
      attempt: (fx) => ({ path: `/folders/${fx.trashedFolderId}/restore` }),
      stranger: {
        expected: 404,
        rule: '7.13: access to a trashed row is by folder membership, never by who deleted it',
      },
    },
  ],
  [
    'POST /api/v1/folders/:id/duplicate',
    {
      attempt: (fx) => ({ path: `/folders/${fx.folderId}/duplicate` }),
      stranger: {
        expected: 404,
        rule: '7.16: the act reads the whole folder, so it is gated exactly as reading it is',
      },
    },
  ],
  [
    'POST /api/v1/folders/:id/cover/photo',
    {
      attempt: (fx) => ({
        path: `/folders/${fx.folderId}/cover/photo`,
        body: { photo_id: STUB_PHOTO_ID },
      }),
      stranger: {
        expected: 404,
        rule: '7.15 and 7.19: the photograph lands as a file in the named folder, so it takes the folder\'s own membership gate',
      },
    },
  ],
  [
    'GET /api/v1/folders/:id/tasks',
    {
      attempt: (fx) => ({ path: `/folders/${fx.folderId}/tasks?tz=UTC` }),
      stranger: {
        expected: 404,
        rule: 'Q7 is "member only, else 404", and 7.0 makes inaccessible read as 404 rather than 403',
      },
    },
  ],
  [
    'GET /api/v1/folders/:id/page',
    {
      attempt: (fx) => ({ path: `/folders/${fx.folderId}/page` }),
      stranger: {
        expected: 404,
        rule: '4.17: the folder page is the folder\'s, so it is read by exactly the people who read the folder',
      },
    },
  ],
  [
    'PUT /api/v1/folders/:id/page',
    {
      attempt: (fx) => ({
        path: `/folders/${fx.folderId}/page`,
        body: { blocks: [] },
      }),
      stranger: {
        expected: 404,
        rule: '4.17 and D1: any member edits, and a non-member is not one',
      },
    },
  ],
  [
    'POST /api/v1/folders/:id/page/actions',
    {
      attempt: (fx) => ({
        path: `/folders/${fx.folderId}/page/actions`,
        body: {
          action: 'insert_task',
          title: 'cannot place this',
          section_block_id: null,
          after: null,
          before: null,
        },
      }),
      stranger: {
        expected: 404,
        rule: '4.17 and 7.16: a composed-page action is a folder-page edit, so a non-member cannot name the folder or anything on its page',
      },
    },
  ],
  [
    'GET /api/v1/folders/:id/comments',
    {
      attempt: (fx) => ({ path: `/folders/${fx.folderId}/comments` }),
      stranger: {
        expected: 404,
        rule: '7.14: the thread is member-only throughout, and a folder outside the viewer\'s membership is 404 and never 403',
      },
    },
  ],
  [
    'POST /api/v1/folders/:id/comments',
    {
      attempt: (fx) => ({
        path: `/folders/${fx.folderId}/comments`,
        body: { body: 'ac397 from a stranger' },
      }),
      stranger: {
        expected: 404,
        rule: '7.14: writing to a thread needs membership of its folder',
      },
    },
  ],

  /* -------------------------------------------------------------- *
   * Tasks and steps (5.4 row 2: every member acts, no non-member does)
   * -------------------------------------------------------------- */
  [
    'GET /api/v1/tasks/:id',
    {
      attempt: (fx) => ({ path: `/tasks/${fx.taskId}` }),
      stranger: {
        expected: 404,
        rule: 'AC-102 by name: a fetch of an existing task in an inaccessible folder is indistinguishable from a nonexistent id',
      },
    },
  ],
  [
    'PATCH /api/v1/tasks/:id',
    {
      attempt: (fx) => ({
        path: `/tasks/${fx.taskId}`,
        body: { title: 'ac397 edited by a stranger' },
      }),
      stranger: {
        expected: 404,
        rule: '5.4 "Create, edit, complete, abandon, restore, delete any task: no" for a non-member',
      },
    },
  ],
  [
    'DELETE /api/v1/tasks/:id',
    {
      attempt: (fx) => ({ path: `/tasks/${fx.taskId}` }),
      stranger: { expected: 404, rule: '5.4 row 2, for a non-member' },
    },
  ],
  [
    'POST /api/v1/tasks/:id/complete',
    {
      attempt: (fx) => ({ path: `/tasks/${fx.taskId}/complete`, body: {} }),
      stranger: {
        expected: 404,
        rule: '5.4 row 2: 5.1\'s transitions are a member act',
      },
    },
  ],
  [
    'POST /api/v1/tasks/:id/uncomplete',
    {
      attempt: (fx) => ({ path: `/tasks/${fx.taskId}/uncomplete`, body: {} }),
      stranger: { expected: 404, rule: '5.4 row 2' },
    },
  ],
  [
    'POST /api/v1/tasks/:id/abandon',
    {
      attempt: (fx) => ({ path: `/tasks/${fx.taskId}/abandon`, body: {} }),
      stranger: { expected: 404, rule: '5.4 row 2' },
    },
  ],
  [
    'POST /api/v1/tasks/:id/restore',
    {
      attempt: (fx) => ({ path: `/tasks/${fx.trashedTaskId}/restore`, body: {} }),
      stranger: {
        expected: 404,
        rule: '5.4 row 2 and 7.13: one path, two graves, and neither is reachable by a non-member',
      },
    },
  ],
  [
    'POST /api/v1/tasks/:id/duplicate',
    {
      attempt: (fx) => ({ path: `/tasks/${fx.taskId}/duplicate`, body: {} }),
      stranger: {
        expected: 404,
        rule: '7.16: the copy is made from a task the caller must be able to read',
      },
    },
  ],
  [
    'POST /api/v1/tasks/:id/order',
    {
      attempt: (fx) => ({
        path: `/tasks/${fx.taskId}/order`,
        body: { after_id: null, before_id: null },
      }),
      stranger: { expected: 404, rule: '5.4 row 2: a hand order is an edit' },
    },
  ],
  [
    'POST /api/v1/tasks/:id/steps',
    {
      attempt: (fx) => ({
        path: `/tasks/${fx.taskId}/steps`,
        body: { title: 'ac397 from a stranger' },
      }),
      stranger: {
        expected: 404,
        rule: '7.7: a step belongs to its task, and the task\'s folder decides who may touch it',
      },
    },
  ],
  [
    'POST /api/v1/tasks/:id/steps/:stepId/promote',
    {
      attempt: (fx) => ({
        path: `/tasks/${fx.taskId}/steps/${fx.stepId}/promote`,
        body: {},
      }),
      stranger: {
        expected: 404,
        rule: '7.7 and B9: the promotion creates a task in the same folder, so it needs that folder\'s membership',
      },
    },
  ],
  [
    'PATCH /api/v1/steps/:id',
    {
      attempt: (fx) => ({
        path: `/steps/${fx.stepId}`,
        body: { title: 'ac397 edited by a stranger' },
      }),
      stranger: {
        expected: 404,
        rule: '7.7: a step is addressed by its own id and reached through its task\'s folder',
      },
    },
  ],
  [
    'DELETE /api/v1/steps/:id',
    {
      attempt: (fx) => ({ path: `/steps/${fx.stepId}` }),
      stranger: { expected: 404, rule: '7.7, as the PATCH above' },
    },
  ],
  [
    'POST /api/v1/tasks/:id/my-day',
    {
      attempt: (fx) => ({ path: `/tasks/${fx.taskId}/my-day?tz=UTC`, body: {} }),
      stranger: {
        expected: 404,
        rule: '5.4 "Pull any visible task into own Today: no" for a non-member; 7.8 makes visibility the whole of the guard',
      },
    },
  ],
  [
    'DELETE /api/v1/tasks/:id/my-day',
    {
      attempt: (fx) => ({ path: `/tasks/${fx.taskId}/my-day` }),
      stranger: {
        expected: 404,
        rule: '7.8: the drop is the pull\'s inverse and takes the same guard',
      },
    },
  ],
  [
    'PUT /api/v1/tasks/:id/reminder',
    {
      attempt: (fx) => ({
        path: `/tasks/${fx.taskId}/reminder`,
        body: { time_of_day: '09:00' },
      }),
      stranger: {
        expected: 404,
        rule: '7.9: 4.8\'s row is keyed by the task in the path, so every guard on it is a fact about that task',
      },
    },
  ],
  [
    'DELETE /api/v1/tasks/:id/reminder',
    {
      attempt: (fx) => ({ path: `/tasks/${fx.taskId}/reminder` }),
      stranger: {
        expected: 404,
        rule: '7.9: the 404 is the task\'s, never the reminder\'s',
      },
    },
  ],

  /* -------------------------------------------------------------- *
   * Shelves and saved views: one person's own by construction
   * -------------------------------------------------------------- */
  [
    'GET /api/v1/shelves/:id',
    {
      attempt: (fx) => ({ path: `/shelves/${fx.shelfId}` }),
      stranger: {
        expected: 404,
        rule: '4.18: a shelf is its owner\'s alone, so everybody else is a stranger to it and 10.2 answers 404',
      },
    },
  ],
  [
    'PATCH /api/v1/shelves/:id',
    {
      attempt: (fx) => ({
        path: `/shelves/${fx.shelfId}`,
        body: { name: 'ac397 renamed by a stranger' },
      }),
      stranger: { expected: 404, rule: '4.18, as the read above' },
    },
  ],
  [
    'DELETE /api/v1/shelves/:id',
    {
      attempt: (fx) => ({ path: `/shelves/${fx.shelfId}` }),
      stranger: { expected: 404, rule: '4.18, as the read above' },
    },
  ],
  [
    'POST /api/v1/shelves/:id/duplicate',
    {
      attempt: (fx) => ({ path: `/shelves/${fx.shelfId}/duplicate`, body: {} }),
      stranger: {
        expected: 404,
        rule: '7.16 as amended 2026-09-04 (issues #117, #128): `duplicateShelf` selects `WHERE id = ? AND user_id = viewer`, so a shelf that is not the caller\'s is not-found rather than forbidden — 4.18 makes a shelf private by construction, and 10.2 keeps ownership invisible to those without it. **The 404 is doing two jobs here and the second is why this row reads differently from the others**: a copy is a create, so a status other than 404 would not only leak the shelf, it would leave a copy of it in the stranger\'s Library that this sweep never cleans up',
      },
    },
  ],
  [
    'GET /api/v1/shelves/:id/page',
    {
      attempt: (fx) => ({ path: `/shelves/${fx.shelfId}/page` }),
      stranger: {
        expected: 404,
        rule: '4.17 and 4.18: a page is scoped by its home, and this home is private',
      },
    },
  ],
  [
    'PUT /api/v1/shelves/:id/page',
    {
      attempt: (fx) => ({
        path: `/shelves/${fx.shelfId}/page`,
        body: { blocks: [] },
      }),
      stranger: { expected: 404, rule: '4.17 and 4.18, as the read above' },
    },
  ],
  [
    'GET /api/v1/views/:id',
    {
      attempt: (fx) => ({ path: `/views/${fx.viewId}` }),
      stranger: {
        expected: 404,
        rule: 'RFC 0005: a saved view is one account\'s, and every statement behind this route is viewer-scoped',
      },
    },
  ],
  [
    'PATCH /api/v1/views/:id',
    {
      attempt: (fx) => ({
        path: `/views/${fx.viewId}`,
        body: { name: 'ac397 renamed by a stranger' },
      }),
      stranger: { expected: 404, rule: 'RFC 0005, as the read above' },
    },
  ],
  [
    'DELETE /api/v1/views/:id',
    {
      attempt: (fx) => ({ path: `/views/${fx.viewId}` }),
      stranger: { expected: 404, rule: 'RFC 0005, as the read above' },
    },
  ],

  /* -------------------------------------------------------------- *
   * Comments: member-only to see, author-only to change
   * -------------------------------------------------------------- */
  [
    'PATCH /api/v1/comments/:id',
    {
      attempt: (fx) => ({
        path: `/comments/${fx.commentId}`,
        body: { body: 'ac397 edited by a stranger' },
      }),
      stranger: {
        expected: 404,
        rule: '7.14: a comment outside the viewer\'s membership is 404, never 403',
      },
      member: {
        expected: 403,
        rule: '7.14 and DES-225: a member sees the thread, so touching another author\'s words is a forbidden act rather than a missing row',
      },
    },
  ],
  [
    'DELETE /api/v1/comments/:id',
    {
      attempt: (fx) => ({ path: `/comments/${fx.commentId}` }),
      stranger: { expected: 404, rule: '7.14, as the edit above' },
      member: {
        expected: 403,
        rule: '7.14: the author or the folder owner removes a comment, and this member is neither',
      },
    },
  ],
  [
    'PUT /api/v1/comments/:id/like',
    {
      attempt: (fx) => ({ path: `/comments/${fx.commentId}/like`, body: {} }),
      stranger: {
        expected: 404,
        rule: '7.14: a like needs the thread, so it needs the folder',
      },
    },
  ],
  [
    'DELETE /api/v1/comments/:id/like',
    {
      attempt: (fx) => ({ path: `/comments/${fx.commentId}/like` }),
      stranger: { expected: 404, rule: '7.14, as the like above' },
    },
  ],

  /* -------------------------------------------------------------- *
   * Files
   * -------------------------------------------------------------- */
  [
    'GET /api/v1/files/:id',
    {
      attempt: (fx) => ({ path: `/files/${fx.fileId}` }),
      stranger: {
        expected: 404,
        rule: '7.15: bytes stored in a folder are served to that folder\'s members, and an avatar is the one deliberate exception (this fixture is an image in a folder)',
      },
    },
  ],
  [
    'DELETE /api/v1/files/:id',
    {
      attempt: (fx) => ({ path: `/files/${fx.fileId}` }),
      stranger: { expected: 404, rule: '7.15, as the read above' },
      member: {
        expected: 403,
        rule: '7.15 gives the delete to "uploader or folder owner", and this member is neither. 10.2 fixes the status rather than 7.15: the member reads the same file at 200 through GET /files/:id, so visibility is permitted and the forbidden act is 403. DELETE /comments/:id one router over is this exact shape and answers 403. **This row is the one finding the sweep turned up**: it answered 404 when this file was written and was held here as a `known` variant, and the owner ruled the correction in on 2026-09-04 as a move toward 10.2 rather than a change to frozen 7.15. AC-398 is the direct case and 7.15 carries the annotation',
      },
    },
  ],

  /* -------------------------------------------------------------- *
   * Invites (5.2's actors)
   * -------------------------------------------------------------- */
  [
    'POST /api/v1/invites/:id/accept',
    {
      attempt: (fx) => ({ path: `/invites/${fx.inviteId}/accept`, body: {} }),
      stranger: {
        expected: 404,
        rule: '7.5 says outright that an actor who is not the addressee is 404 and not 403: they learn nothing about the invite\'s existence or its state',
      },
    },
  ],
  [
    'POST /api/v1/invites/:id/decline',
    {
      attempt: (fx) => ({ path: `/invites/${fx.inviteId}/decline`, body: {} }),
      stranger: { expected: 404, rule: '7.5, as the accept above' },
    },
  ],
  [
    'POST /api/v1/invites/:id/cancel',
    {
      attempt: (fx) => ({ path: `/invites/${fx.inviteId}/cancel`, body: {} }),
      stranger: {
        expected: 404,
        rule: '5.2: cancel belongs to the inviter or the folder owner, and anybody who cannot see the invite at all gets 404',
      },
      member: {
        expected: 403,
        rule: '5.4 "Cancel any invite for the folder: no (only own)" for a member, who sees it on 7.4\'s pending_invites and so is refused visibly',
      },
    },
  ],
  [
    'POST /api/v1/invites/:id/resend',
    {
      attempt: (fx) => ({ path: `/invites/${fx.inviteId}/resend`, body: {} }),
      stranger: { expected: 404, rule: '5.2: resend has one actor, the inviter' },
      member: {
        expected: 403,
        rule: '5.2 and the same visibility rule cancel uses: a member of the folder sees the invite, so their refusal says why',
      },
    },
  ],

  /* -------------------------------------------------------------- *
   * Notifications, the roster, and the Trash
   * -------------------------------------------------------------- */
  [
    'POST /api/v1/notifications/:id/read',
    {
      attempt: (fx) => ({
        path: `/notifications/${fx.notificationId}/read`,
        body: {},
      }),
      stranger: {
        expected: 404,
        rule: '7.12: a notification is one account\'s row, and the UPDATE carries user_id, so another account\'s is 404',
      },
    },
  ],
  [
    'DELETE /api/v1/connections/:userId',
    {
      attempt: (fx) => ({ path: `/connections/${fx.owner.id}` }),
      stranger: {
        expected: 404,
        rule: '7.3: either side of a pair may remove it and nobody else can name it, so a caller outside the pair is 404',
      },
    },
  ],
  [
    'DELETE /api/v1/trash/tasks/:id',
    {
      attempt: (fx) => ({ path: `/trash/tasks/${fx.trashedTaskId}` }),
      stranger: {
        expected: 404,
        rule: '7.13: access to the Trash is by folder membership, never by who deleted',
      },
      member: {
        expected: 403,
        rule: 'RFC 0005 change control item 38: the permanent delete is the folder owner\'s alone, and a member can see the row, so 10.2\'s grammar admits a forbidden here',
      },
    },
  ],
  [
    'DELETE /api/v1/trash/folders/:id',
    {
      attempt: (fx) => ({ path: `/trash/folders/${fx.trashedFolderId}` }),
      stranger: { expected: 404, rule: '7.13, as the task above' },
      member: {
        expected: 403,
        rule: 'RFC 0005 change control item 38, as the task above',
      },
    },
  ],

  /* -------------------------------------------------------------- *
   * The viewer-scoped four: this file's PUBLIC_READS
   *
   * Each of these carries a path parameter and none of them names a row
   * that could belong to somebody else, so a stranger gets exactly what
   * anybody else gets and the reason is the row. An entry here widens
   * nothing by itself: what it says is that there is no cross-account
   * question on this route, and if that ever stops being true the entry is
   * where a reader will look first.
   * -------------------------------------------------------------- */
  [
    'PUT /api/v1/place-covers/:place',
    {
      attempt: () => ({
        path: `/place-covers/${PLACE}`,
        body: { preset: 'linen' },
      }),
    },
  ],
  [
    'DELETE /api/v1/place-covers/:place',
    { attempt: () => ({ path: `/place-covers/${PLACE}` }) },
  ],
  [
    'PUT /api/v1/place-descriptions/:place',
    {
      attempt: () => ({
        path: `/place-descriptions/${PLACE}`,
        body: { description: 'ac397, the stranger\'s own sentence' },
      }),
    },
  ],
  [
    'GET /api/v1/covers/photos/:id/thumb',
    { attempt: () => ({ path: `/covers/photos/${STUB_PHOTO_ID}/thumb` }) },
  ],
])

/**
 * The four routes with no `stranger` row, and what each one is instead. Held
 * separately from TABLE so that the two are asserted against each other: a
 * route named here and carrying a `stranger` variant is a contradiction, and
 * a route with neither is a row somebody forgot to finish.
 */
const VIEWER_SCOPED = new Map<string, { expected: number; reason: string }>([
  [
    'PUT /api/v1/place-covers/:place',
    {
      expected: 200,
      reason:
        '4.20: `:place` names one of Dana\'s own eight pages, not a row. The statement behind it carries user_id = viewer, so a second account writing "today" writes its own cover and could not reach anybody else\'s if it tried. The one cross-account question this route does have is the file it may name, which is a body field rather than a path id, and AC-368 and AC-374 are that gate',
    },
  ],
  [
    'DELETE /api/v1/place-covers/:place',
    {
      expected: 204,
      reason:
        '4.20, as the PUT: the delete is scoped to the caller and is idempotent, so a stranger removing "today" removes their own row whether or not they had one',
    },
  ],
  [
    'PUT /api/v1/place-descriptions/:place',
    {
      expected: 200,
      reason:
        '4.22 and 7.21: a person\'s own sentence under one of Dana\'s pages, keyed by the viewer exactly as the cover above is',
    },
  ],
  [
    'GET /api/v1/covers/photos/:id/thumb',
    {
      expected: 200,
      reason:
        '7.19: the id is Openverse\'s, not ours. The route exists so that img-src can admit no third-party host, and it proxies a public thumbnail; there is no row here for one account to hold against another. requireSession is still what keeps it off the open internet, which AC-236 asserts',
    },
  ],
])

/* ------------------------------------------------------------------ *
 * Driving one row
 * ------------------------------------------------------------------ */

function methodOf(key: string): string {
  return key.slice(0, key.indexOf(' '))
}

function templateOf(key: string): string {
  return key.slice(key.indexOf(' ') + 1)
}

/**
 * Whether a row's concrete path would be matched by the route its key names.
 *
 * **This is the control that keeps the whole file from passing vacuously, and
 * it is not optional.** `src/server/index.ts` mounts a catch-all at `/api`
 * answering `404 not_found` with the same body every gated route answers, so
 * a row whose path has a typo in it reaches no route at all and is refused by
 * the catch-all with exactly the status the row expects. Fifty-odd rows could
 * be green while testing nothing. Matching the concrete path against the
 * template, segment by segment, is what says the request reached the handler
 * the row is about: the enumeration above has already proved the route is
 * mounted, so a path that matches its pattern cannot fall through to the
 * catch-all.
 *
 * **What it does not prove, stated because the reviewer had to ask.** A `:param`
 * slot accepts any non-empty segment, so this says the request reached that
 * route and nothing about the id being the right row, the right kind of row, or
 * a row at all. That second question is the visibility control's, below, and
 * the two are separate on purpose: this one is exact and total over the table,
 * that one is exact and total over the fixtures, and neither pretends to be
 * the other. `ROUTE_BASE` is named here rather than assumed, and the
 * enumeration test asserts every key carries it.
 */
function matchesTemplate(template: string, concrete: string): boolean {
  const wanted = template.split('/')
  const got = `${ROUTE_BASE}${concrete.split('?')[0] ?? ''}`.split('/')
  if (wanted.length !== got.length) return false
  return wanted.every((segment, index) =>
    segment.startsWith(':') ? (got[index] ?? '') !== '' : segment === got[index],
  )
}

function drive(
  actor: Actor,
  key: string,
  attempt: Attempt,
): Promise<RawResponse> {
  return actor.browser.json(attempt.path, methodOf(key), attempt.body)
}

function snippet(response: RawResponse): string {
  const text = response.body.replace(/\s+/g, ' ').trim()
  return text.length > 120 ? `${text.slice(0, 120)}...` : text
}

/* ------------------------------------------------------------------ *
 * The criterion
 * ------------------------------------------------------------------ */

describe('AC-397 every id-bearing route refuses a stranger', () => {
  test('the enumeration and the table describe the same surface', async () => {
    const routes = idBearingRoutes(app.application)

    /*
    Equality, and the reason is the whole value of this file. A hand-written
    table is worth having for exactly one property: that a route which joins
    the application without an entry fails here rather than passing in
    silence. A floor would give that up — a walker that lost sight of half
    the surface, a router mounted inside another router, would satisfy
    `> 40` while proving nothing about the routes it no longer saw. Measured
    2026-09-04 at 59 and again at 60 an hour later, when the wave-1 merge brought
    `POST /shelves/:id/duplicate`; it moves in the same change as the route that
    moves it.
    */
    expect(
      routes.length,
      `the walker found ${String(routes.length)} routes carrying a path parameter and there were 61 after issue #184 added the composed-page action route. Fewer means the enumeration lost sight of routes that still exist, a router mounted inside another router being the way that happens; more means an id-bearing route was added, and it owes this table a row saying what a stranger gets when they ask for somebody else's`,
    ).toBe(61)

    const missing = routes.filter((route) => !TABLE.has(route))
    expect(
      missing,
      'id-bearing routes with no row in the table. Add one: what does a signed-in person with no relationship to this id get, and which rule says so',
    ).toEqual([])

    /* The attribution in the walk takes the first mount a layer accepts, and
       `match` is a prefix test, so that is only exact while no mount is a
       prefix of another. It was not, once: `/api` sat in that list beside
       `/api/v1`. Asserted rather than commented, because the list is edited by
       whoever adds a router and the failure is silent. */
    const shadowed = MOUNTS.filter((mount) =>
      MOUNTS.some((other) => other !== mount && mount.startsWith(`${other}/`)),
    )
    expect(
      shadowed,
      'mounts shadowed by an earlier, shorter one in MOUNTS. A layer matches on prefix, so the shorter one would claim the longer one\'s routes and key them under the wrong name',
    ).toEqual([])

    // `drive` sends every row through TestBrowser.api, which prepends
    // ROUTE_BASE, and `matchesTemplate` names it too. A key on any other base
    // would be driven at a path that is not the route's.
    const offBase = [...TABLE.keys()].filter(
      (key) => !templateOf(key).startsWith(`${ROUTE_BASE}/`),
    )
    expect(
      offBase,
      `table keys outside ${ROUTE_BASE}. Rows are written relative to it and driven through it, so a route mounted elsewhere needs its own way of being driven rather than a row here`,
    ).toEqual([])

    const stale = [...TABLE.keys()].filter((key) => !routes.includes(key))
    expect(
      stale,
      'table rows naming a route that is not mounted. Delete them rather than leaving an expectation that guards nothing and hides whatever replaces that path',
    ).toEqual([])

    // The two halves of a row, asserted against each other so neither can
    // drift: a viewer-scoped route must not also claim a stranger status,
    // and every other route must claim one.
    const contradictory = [...TABLE.entries()]
      .filter(([key, row]) => VIEWER_SCOPED.has(key) === (row.stranger !== undefined))
      .map(([key]) => key)
    expect(
      contradictory,
      'rows that are both viewer-scoped and stranger-refusing, or neither. Every id-bearing route is one or the other',
    ).toEqual([])
  })

  test('every row reaches the route it names, rather than the /api catch-all', async () => {
    const fx = await fixturesOf()
    const wrong: string[] = []

    for (const [key, row] of TABLE) {
      const attempt = row.attempt(fx)
      if (!matchesTemplate(templateOf(key), attempt.path)) {
        wrong.push(`${key}: the row drives ${attempt.path}, which that route does not match`)
      }
      const variant = row.member
      if (variant?.attempt === undefined) continue
      const memberAttempt = variant.attempt(fx)
      if (!matchesTemplate(templateOf(key), memberAttempt.path)) {
        wrong.push(
          `${key}: the member variant drives ${memberAttempt.path}, which that route does not match`,
        )
      }
    }

    expect(
      wrong,
      'rows whose path does not match the route they claim to be about. index.ts mounts a catch-all at /api answering the same 404 not_found, so such a row would be green and would be measuring nothing',
    ).toEqual([])
  })

  /*
  The other half of the worry the template match above serves, and the half a
  template match cannot answer: a row can name the right route and hand it a
  uuid that is nobody's, and then the stranger's 404 is the truth about a row
  that does not exist rather than about a row they may not have. Every factory
  asserts its own 201, so this holds by construction; it is asserted anyway,
  because "by construction" is what the folder-row comment CLAUDE.md warns
  about also said.

  **A `Record` over `ResourceId` rather than a list of calls** (review of
  2026-09-04), so the compiler refuses an id that joins `Fixtures` and no
  probe. The two pages are named beside it and not in it, because a page is
  addressed by its home's id and has none of its own.
  */
  const VISIBLE_TO_ITS_OWNER: Record<
    ResourceId,
    (fx: Fixtures) => { what: string; path: string; holds?: string }
  > = {
    folderId: (fx) => ({ what: 'the folder', path: `/folders/${fx.folderId}` }),
    taskId: (fx) => ({ what: 'the task', path: `/tasks/${fx.taskId}` }),
    stepId: (fx) => ({
      what: 'the step, on its task',
      path: `/tasks/${fx.taskId}`,
      holds: fx.stepId,
    }),
    shelfId: (fx) => ({ what: 'the shelf', path: `/shelves/${fx.shelfId}` }),
    viewId: (fx) => ({ what: 'the saved view', path: `/views/${fx.viewId}` }),
    fileId: (fx) => ({ what: 'the file', path: `/files/${fx.fileId}` }),
    commentId: (fx) => ({
      what: 'the comment, on its thread',
      path: `/folders/${fx.folderId}/comments`,
      holds: fx.commentId,
    }),
    notificationId: (fx) => ({
      what: 'the notification',
      path: '/notifications',
      holds: fx.notificationId,
    }),
    inviteId: (fx) => ({
      what: 'the invite',
      path: '/invites/sent',
      holds: fx.inviteId,
    }),
    trashedTaskId: (fx) => ({
      what: 'the trashed task',
      path: '/trash',
      holds: fx.trashedTaskId,
    }),
    trashedFolderId: (fx) => ({
      what: 'the trashed folder',
      path: '/trash',
      holds: fx.trashedFolderId,
    }),
  }

  test('every fixture exists and its owner can see it', async () => {
    const fx = await fixturesOf()
    const invisible: string[] = []

    const seen = async (
      what: string,
      path: string,
      holds?: string,
    ): Promise<void> => {
      const answer = await fx.owner.browser.api(path)
      if (answer.status !== 200) {
        invisible.push(
          `${what}: GET ${path} answered ${String(answer.status)} to the person who made it`,
        )
        return
      }
      if (holds !== undefined && !JSON.stringify(answer.json()).includes(holds)) {
        invisible.push(`${what}: GET ${path} answered 200 without it`)
      }
    }

    for (const probe of Object.values(VISIBLE_TO_ITS_OWNER)) {
      const { what, path, holds } = probe(fx)
      await seen(what, path, holds)
    }
    await seen('the folder page', `/folders/${fx.folderId}/page`)
    await seen('the shelf page', `/shelves/${fx.shelfId}/page`)
    await seen(
      'the roster connection',
      '/connections',
      fx.member.id,
    )

    expect(
      invisible,
      'fixtures the sweep addresses that their own maker cannot see. Every 404 in this file would then be honest about the wrong thing',
    ).toEqual([])
  })

  test('a signed-in stranger is refused by every route that names a row', async () => {
    const fx = await fixturesOf()
    const failures: string[] = []

    for (const [key, row] of TABLE) {
      const variant = row.stranger
      if (variant === undefined || variant.known !== undefined) continue
      const answer = await drive(fx.stranger, key, row.attempt(fx))
      if (answer.status !== variant.expected) {
        failures.push(
          `${key}: a stranger got ${String(answer.status)}, not ${String(variant.expected)} (${variant.rule}); body ${snippet(answer)}`,
        )
      }
    }

    expect(
      failures,
      'routes that answered a person with no relationship to the row something other than what 10.2 and the 5.4 matrix require. Each line is one missing or wrong accessOf gate',
    ).toEqual([])
  })

  test('a member is refused the acts 5.4 keeps for the owner', async () => {
    const fx = await fixturesOf()
    const failures: string[] = []

    for (const [key, row] of TABLE) {
      const variant = row.member
      if (variant === undefined || variant.known !== undefined) continue
      const answer = await drive(
        fx.member,
        key,
        (variant.attempt ?? row.attempt)(fx),
      )
      if (answer.status !== variant.expected) {
        failures.push(
          `${key}: a member got ${String(answer.status)}, not ${String(variant.expected)} (${variant.rule}); body ${snippet(answer)}`,
        )
      }
    }

    expect(
      failures,
      'routes where 5.4 grants a member visibility and withholds the act, and the code did something else. A 404 here is as wrong as a 200: the person can see the thing, so the refusal owes them a reason',
    ).toEqual([])
  })

  /*
  The register of findings this sweep turned up that were not its to fix.

  **It is empty as of 2026-09-04 and the machinery stays.** The one entry it
  ever held was `DELETE /api/v1/files/:id`, which answered 404 to a member who
  reads the same bytes at 200; the owner ruled the correction in the same day
  as a move toward 10.2's stated grammar rather than a change to frozen 7.15,
  so the variant was promoted into the member pass above and AC-398 now asserts
  the pair directly. What is left is the shape for the next one, because a
  sweep that can only record findings it is allowed to fix is a sweep that will
  one day be quietly narrowed to fit.

  **Written as a manual inversion rather than as `test.fails`, and the empty
  register is exactly why.** `test.fails` passes when its body throws, so with
  no entries the assertion inside would pass and the block would go red for
  having nothing to do — a red that means nothing and that the next person
  deletes. This asserts the finding is *still open*, which is vacuously true of
  an empty register and false the moment one is closed. Either way the message
  says what to do, and `expected` on a `known` variant stays the status the
  rule requires rather than the one observed, so promoting one is deleting one
  field.
  */
  const known = [...TABLE.entries()].flatMap(([key, row]) =>
    [row.stranger, row.member]
      .filter((variant): variant is Variant => variant?.known !== undefined)
      .map((variant) => ({ key, row, variant })),
  )

  test('every known finding is still open, or says so', async () => {
    if (known.length === 0) return
    const fx = await fixturesOf()
    const closed: string[] = []

    for (const { key, row, variant } of known) {
      const actor = variant === row.stranger ? fx.stranger : fx.member
      const answer = await drive(actor, key, (variant.attempt ?? row.attempt)(fx))
      if (answer.status === variant.expected) {
        closed.push(
          `${key}: now answers ${String(variant.expected)}, which is what the rule requires — ${variant.known ?? ''}`,
        )
      }
    }

    expect(
      closed,
      'findings recorded as open that the code has since closed. Delete each one\'s `known` field so the pass above asserts it for real, rather than leaving a fixed route described as broken',
    ).toEqual([])
  })

  test('the viewer-scoped routes answer a stranger exactly as they answer anyone', async () => {
    const fx = await fixturesOf()
    const failures: string[] = []

    for (const [key, expectation] of VIEWER_SCOPED) {
      const row = TABLE.get(key)
      if (row === undefined) continue
      const answer = await drive(fx.stranger, key, row.attempt(fx))
      if (answer.status !== expectation.expected) {
        failures.push(
          `${key}: answered ${String(answer.status)}, not ${String(expectation.expected)}. It is listed as viewer-scoped because ${expectation.reason}; if that has stopped being true, the entry is what has to change`,
        )
      }
    }

    expect(
      failures,
      'viewer-scoped routes that no longer behave as the entry claims. An exemption that stops being true fails here rather than widening quietly',
    ).toEqual([])

    /*
    The status is the weaker half of what those four entries claim. Each one
    says the row it reaches is the caller's own, and a route that ignored
    `user_id` would answer the stranger the same 200 and 204 while writing over
    somebody else's — the entry's reason would be false and every assertion
    above would still be green. The owner set a cover on this same place in the
    fixtures; the stranger has just written and deleted `place-covers/PLACE`
    twice over. So the owner's must still be there.
    */
    const owners = await fx.owner.browser.api('/place-covers')
    expect(
      owners.status,
      'the owner reads their own place covers (spec 7.19)',
    ).toBe(200)
    const covers = (owners.json() as { covers?: Array<{ place?: unknown }> })
      .covers
    expect(
      (covers ?? []).map((cover) => cover.place),
      `the stranger's writes and deletes on ${PLACE} must not have touched the owner's cover on it. If this is empty, the four viewer-scoped entries are describing a surface that is not viewer-scoped and every status above was measuring the wrong thing`,
    ).toContain(PLACE)
  })
})
