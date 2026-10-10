/*
structural: every route on the mounted application whose path carries
a resource id is driven as a signed-in person with no relationship to the
thing that id names, and answers 404 — or 403 where 5.4 grants visibility and
withholds the act — enumerated over the router rather than sampled, with the
membership variants the 5.4 matrix distinguishes asserted beside the
stranger's.

## Why this file exists

`ac-236` made **authentication** structural, on every method since issue #33.
Authorization rests on people remembering: it is **hand-written
`accessOf(...)` calls across many files, and forgetting one fails nothing**
(issue #74). Without this file, a GET that takes a session and then reads
whatever id it is handed passes the entire suite.

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
- **`member`**, on the twelve routes where 5.4, 7.15 or the Folder Access
  model of issue #228 grants a member visibility and withholds the act: 403,
  and the refusal may say why, precisely because the person can already see
  the thing. **The count is prose and nothing asserts it** -- what is
  asserted is the route enumeration below, in both directions -- so read it
  as a description of the table rather than as a guard over it.
  `PATCH /api/v1/folders/:id` has no member variant, because accepted #209
  R8A gives a folder's whole identity to Can edit and `fx.member` is admitted
  at Can edit, so there is no act on that route this actor is refused.
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
import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import {
  STUB_PHOTO_ID,
  makeComment,
  makeDependency,
  makeDiscussion,
  makeTab,
  makeFile,
  makeInvite,
  makeFolderLabel,
  makeNotification,
  makePersonalLabel,
  makePlaceCover,
  makeSavedView,
  makeSharedFolder,
  makeShelf,
  makeStep,
  makeTask,
  memoryFileStore,
  startUpstreamStub,
  trashDiscussion,
  trashFolder,
  trashTask,
  writePage,
} from '../support/authorization-harness.js'
import type { UpstreamStub } from '../support/authorization-harness.js'
import { Cast } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import type { RawResponse } from '../support/http-client.js'

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
  /* The seeded Discussion first: its Outcome's actor key would otherwise be
     released before the Discussion that holds it. */
  if (fixtures !== undefined) {
    await app.db.execute(
      sql`DELETE FROM discussions WHERE id = ${fixtures.discussionId}::uuid`,
    )
  }
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
 * **Bare `/api` must not be in this list.** A layer's
 * `match` is a prefix test, so a router mounted at bare `/api` accepts
 * `/api/v1` too and would have been attributed to the first candidate in the
 * list. Its routes would then be keyed `/api/v1/whatever`, tabulated under
 * that name, and driven at a path no route matches — straight into the
 * `/api` catch-all, which answers the same 404 the table expects. The bad
 * outcome is not a red run, it is a green one over routes nobody swept. So
 * this list holds only mounts that are unambiguous, `ROUTE_BASE` below fixes
 * the one prefix rows are written against, a router matching none of them is
 * reported by name rather than silently keyed at the root, and the
 * no-mount-is-a-prefix-of-another rule the attribution rests on is asserted in
 * the enumeration test rather than left to whoever edits this line.
 *
 * **`/api/csp-report`** (issue #99) is mounted at its own path, so it needs
 * its own entry; without one the walk reports a route path of `/`. The route
 * carries no parameter, so it enumerates and is then filtered out.
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
 * diligent**. A hand-written list of probes is exactly the thing this file
 * exists to refuse: an id added here and forgotten there would be swept while nothing
 * proved it was a real row, and every 404 about it would be honest about the
 * wrong thing. The probes below are a `Record` over this union, so the
 * compiler refuses a new id that nobody proves visible.
 */
type ResourceId =
  | 'folderId'
  | 'trashedFolderId'
  | 'archivedFolderId'
  | 'taskId'
  | 'blockingTaskId'
  | 'dependencyId'
  | 'trashedTaskId'
  | 'stepId'
  | 'shelfId'
  | 'viewId'
  | 'commentId'
  | 'fileId'
  | 'inviteId'
  | 'notificationId'
  | 'personalLabelId'
  | 'strangerPersonalLabelId'
  | 'folderLabelId'
  /* Step 7: a Doc tab of the folder's project, the target of the facet
     backlinks route (a facet's id is its tab's). */
  | 'tabId'
  /* #320/#321: one Discussion seeded as a row, serving as a Dana Link target
     and as the home of an open input round; plus one (superseded) Outcome. */
  | 'discussionId'
  | 'outcomeId'
  /* #213: a native Result, a block of a Results Doc tab (step 7). */
  | 'resultId'
  | 'inputRoundId'
  /* Issue #320: the General discussion the owner's legacy Folder-thread
     comment was filed under, read back from that comment rather than made
     through a Discussion route, so the comment routes' rows stand on their
     own. */
  | 'generalDiscussionId'
  | 'conversationId'
  | 'directMessageId'
  /* Issue #320: a trashed Discussion, for the Trash pair (7.28). */
  | 'trashedDiscussionId'

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
  const blockingTaskId = await makeTask(owner, folderId, 'ac397 the blocker')
  const dependencyId = await makeDependency(owner, taskId, blockingTaskId)
  const fileId = await makeFile(owner, folderId, 'ac397.png')
  const commentId = await makeComment(owner, folderId, 'ac397 the comment')
  const generalDiscussionId = await discussionOfComment(owner, folderId, commentId)
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
  const openedConversation = await owner.browser.json('/direct-conversations', 'POST', {
    folder_id: folderId,
    member_id: member.id,
  })
  expect(openedConversation.status).toBe(200)
  const conversationId = String((openedConversation.json() as { id: string }).id)
  const sentMessage = await owner.browser.json(
    `/direct-conversations/${conversationId}/messages`, 'POST', { body: 'Private message' },
  )
  expect(sentMessage.status).toBe(201)
  const directMessageId = String((sentMessage.json() as { id: string }).id)
  await writePage(owner, 'folders', folderId, 'ac397 folder page')
  await writePage(owner, 'shelves', shelfId, 'ac397 shelf page')

  /* Issue #226's two Label scopes, one fixture each. Both are the owner's to
     reach and neither is the stranger's: a Personal Label is private to the
     account that made it, and a Folder Label belongs to a Folder the stranger
     is not in. The eleven rows below address them, seven with these two and
     four with the third fixture underneath. */
  const personalLabelId = await makePersonalLabel(owner, 'ac397 personal')
  const folderLabelId = await makeFolderLabel(owner, folderId, 'ac397 folder')

  /* A third Label, and it is the **stranger's own**, which is the only thing
     that makes the four assignment rows measure what their `rule` strings
     say. Those rows drive `PUT` and `DELETE` on
     `/folders/:folderId/labels/:labelId` and `/tasks/:taskId/labels/:labelId`,
     each of which has two gates — the target and the Label — and each of
     which answers 404 to a stranger either way. Driven with the *owner's*
     Personal Label the row is satisfied by the Label gate alone, so deleting
     the target gate leaves it green — a mutation test showed exactly that,
     for both the folder gate and `accessibleTask`. Handing over a Label they genuinely own takes the Label gate out of the
     answer and leaves only the target's. */
  const strangerPersonalLabelId = await makePersonalLabel(
    stranger,
    'ac397 the stranger\'s own personal',
  )

  /* The owner's cover on the same place the viewer-scoped rows write, so
     those rows assert something. Without it the stranger's PUT and DELETE on
     `today` touch a place nobody had claimed, and "the statement carries
     user_id = viewer" would be a sentence in a comment rather than a thing
     the run demonstrates. See PLACE, and the last test in this file. */
  await makePlaceCover(owner, PLACE, fileId)

  const tabId = await makeTab(owner, folderId, 'ac397 the tab')
  const resultsTabId = await makeTab(owner, folderId, 'Results')
  const resultId = randomUUID()
  await app.db.execute(sql`
    INSERT INTO page_blocks (id, folder_id, kind, position, text)
    VALUES (${resultId}::uuid, ${resultsTabId}::uuid, 'result', 0,
            'ac397 the result')`)

  const trashedDiscussionId = await makeDiscussion(
    owner,
    folderId,
    'ac397 doomed discussion',
  )
  await trashDiscussion(owner, trashedDiscussionId)

  /* A Discussion written straight to the table: the input-round routes are
     what this sweep measures, and they need only the row. The round is
     opened through its own route, as its owner. */
  const discussionRows = await app.db.execute(
    sql`INSERT INTO discussions (folder_id, title, created_by)
        VALUES (${folderId}::uuid, 'ac397 the discussion', ${owner.id}::uuid)
        RETURNING id`,
  )
  const discussionId = String(
    (discussionRows as unknown as { rows: { id: string }[] }).rows[0]?.id,
  )
  const openedRound = await owner.browser.json(
    `/discussions/${discussionId}/input-rounds`,
    'POST',
    { mode: 'choose', prompt: 'ac397 the round', options: ['one', 'two'] },
  )
  expect(openedRound.status, 'the owner opens an input round (#321)').toBe(201)
  const inputRoundId = String((openedRound.json() as { id: string }).id)

  const trashedTaskId = await makeTask(owner, folderId, 'ac397 the doomed task')
  await trashTask(owner, trashedTaskId)
  const trashedFolderId = await makeSharedFolder(
    app,
    owner,
    member,
    'ac397 doomed',
  )
  await trashFolder(owner, trashedFolderId)
  const archivedFolderId = await makeSharedFolder(app, owner, member, 'ac397 archived')
  const archived = await owner.browser.json(`/folders/${archivedFolderId}/archive`, 'POST', {})
  expect(archived.status).toBe(204)

  const outcomeId = randomUUID()
  await app.db.execute(sql`
    INSERT INTO discussion_outcomes (id, discussion_id, statement, actor_id)
    VALUES (${outcomeId}::uuid, ${discussionId}::uuid, 'ac397 the outcome',
            ${owner.id}::uuid)`)

  fixtures = {
    owner,
    member,
    stranger,
    folderId,
    trashedFolderId,
    archivedFolderId,
    taskId,
    blockingTaskId,
    dependencyId,
    trashedTaskId,
    stepId,
    shelfId,
    viewId,
    commentId,
    fileId,
    inviteId,
    notificationId,
    conversationId,
    directMessageId,
    personalLabelId,
    strangerPersonalLabelId,
    folderLabelId,
    tabId,
    discussionId,
    outcomeId,
    resultId,
    generalDiscussionId,
    inputRoundId,
    trashedDiscussionId,
  }
  return fixtures
}

/** The Discussion a Folder-thread comment was filed under (issue #320). */
async function discussionOfComment(
  owner: Actor,
  folderId: string,
  commentId: string,
): Promise<string> {
  const thread = await owner.browser.json(`/folders/${folderId}/comments`, 'GET')
  expect(thread.status).toBe(200)
  const line = (
    thread.json() as { comments: { id: string; discussion_id?: string | null }[] }
  ).comments.find((comment) => comment.id === commentId)
  expect(line?.discussion_id, 'the Folder-thread comment names its Discussion').toEqual(
    expect.any(String),
  )
  return String(line?.discussion_id)
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
Adding a route is adding one line here. Routes that carry no id, such as
`GET /api/v1/me/export` and `POST /api/csp-report`, are outside this
enumeration.
*/
const TABLE = new Map<string, Row>([
  [
    'PATCH /api/v1/feedback/:id',
    {
      attempt: () => ({ path: '/feedback/00000000-0000-4000-8000-000000000000', body: { done: true } }),
      stranger: { expected: 404, rule: '#625: only operators in DANA_OPERATORS can change feedback' },
    },
  ],
  [
    'GET /api/v1/direct-conversations/:id/messages',
    {
      attempt: (fx) => ({ path: `/direct-conversations/${fx.conversationId}/messages` }),
      stranger: { expected: 404, rule: '#610: only the two participants can read a private conversation' },
    },
  ],
  [
    'POST /api/v1/direct-conversations/:id/messages',
    {
      attempt: (fx) => ({ path: `/direct-conversations/${fx.conversationId}/messages`, body: { body: 'Intrusion' } }),
      stranger: { expected: 404, rule: '#610: only the two participants can write to a private conversation' },
    },
  ],
  [
    'POST /api/v1/direct-conversations/:id/read',
    {
      attempt: (fx) => ({ path: `/direct-conversations/${fx.conversationId}/read`, body: { through: fx.directMessageId } }),
      stranger: { expected: 404, rule: '#608: only a participant can clear unread private messages' },
    },
  ],
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
      /* **No member variant, and its absence is the decision.** `fx.member`
         is admitted at Can edit, and accepted #209 R8A makes a folder's whole
         identity ordinary shared Folder work that Can edit changes, so there
         is no act on this route this actor is refused (AC-011, AC-012,
         AC-193). `DELETE /api/v1/folders/:id` below does refuse the member,
         403. */
    },
  ],
  [
    'DELETE /api/v1/folders/:id',
    {
      attempt: (fx) => ({ path: `/folders/${fx.folderId}` }),
      stranger: { expected: 404, rule: '5.4: a non-member sees nothing' },
      member: {
        expected: 403,
        rule: "5.4: moving the folder to Trash is Full control's, and `fx.member` holds Can edit (AC-015)",
      },
    },
  ],
  [
    'POST /api/v1/folders/:id/archive',
    {
      attempt: (fx) => ({ path: `/folders/${fx.folderId}/archive` }),
      stranger: { expected: 404, rule: 'an outsider cannot see Work to archive it' },
      member: { expected: 403, rule: 'archiving Work requires Full control' },
    },
  ],
  [
    'PATCH /api/v1/folders/:id/location',
    {
      /* Wave 2's page-tree move. To the top level, so the path id is the only
         id in play: the body ids (`parent_folder_id`, `after_id`) are
         invisible to this sweep and are AC-1016's. No member variant:
         `fx.member` holds Can edit, which is what a move needs. */
      attempt: (fx) => ({
        path: `/folders/${fx.folderId}/location`,
        body: { parent_folder_id: null },
      }),
      stranger: {
        expected: 404,
        rule: 'wave 2: moving a page edits it, and a non-member sees nothing, so 404 before the body is read',
      },
    },
  ],
  [
    'PATCH /api/v1/folders/:id/my-membership',
    {
      attempt: (fx) => ({
        path: `/folders/${fx.folderId}/my-membership`,
        body: { shelf: 'ac397' },
      }),
      stranger: {
        expected: 404,
        rule: '5.4 "Set or clear own label and color: no" for a non-member, the label being 4.4\'s shelf_name, sent as `shelf`; the UPDATE is viewer-scoped besides',
      },
    },
  ],
  [
    'POST /api/v1/folders/:id/members',
    {
      /* `access` joined this body with issue #228 and is required. The
         attempt carries a valid one so the sweep measures the authorization
         answer rather than the schema's: this surface parses the body before
         it resolves the row, deliberately, because a refusal that reads no
         row tells a prober nothing about which rows exist (the same ordering
         7.5's invite create uses). Without it the stranger would be answered
         422 and the sweep would be measuring the wrong refusal. */
      attempt: (fx) => ({
        path: `/folders/${fx.folderId}/members`,
        body: { user_id: fx.stranger.id, access: 'can_edit' },
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
  /*
  The four Access routes of issue #228, each with its authorization row.

  Three of them are member administration, so the *member* variant matters as
  much as the stranger's: a plain member sees the folder and is refused the
  act, which is 403, and somebody outside it is told nothing at all, which is
  404. The fourth pair are reads and carry the folder's own visibility.
  */
  [
    'PATCH /api/v1/folders/:id/members/:userId',
    {
      attempt: (fx) => ({
        path: `/folders/${fx.folderId}/members/${fx.member.id}`,
        body: { access: 'can_view' },
      }),
      stranger: {
        expected: 404,
        rule: "7.4: changing a member's Access is member administration, and 10.2 refuses to confirm the folder exists to somebody outside it",
      },
      member: {
        expected: 403,
        rule: '7.4: administering Access is Full control\'s and Can edit cannot, and the member demonstrably sees the folder, so the refusal may say why',
        attempt: (fx) => ({
          path: `/folders/${fx.folderId}/members/${fx.owner.id}`,
          body: { access: 'can_view' },
        }),
      },
    },
  ],
  [
    'POST /api/v1/folders/:id/owner-recovery',
    {
      attempt: (fx) => ({ path: `/folders/${fx.folderId}/owner-recovery` }),
      stranger: { expected: 404, rule: '5.4: a non-member sees nothing' },
      member: {
        expected: 403,
        rule: "7.4: custody recovery is the structural owner's alone and Full control does not confer it, so a member who sees the folder is told why",
        attempt: (fx) => ({ path: `/folders/${fx.folderId}/owner-recovery` }),
      },
    },
  ],
  [
    'GET /api/v1/folders/:id/access-history',
    {
      attempt: (fx) => ({ path: `/folders/${fx.folderId}/access-history` }),
      stranger: {
        expected: 404,
        rule: '7.4: Access history is visible to current Folder members; somebody outside the folder learns nothing, not even that it exists',
      },
    },
  ],
  [
    'GET /api/v1/folders/:id/members/:userId/access-history',
    {
      attempt: (fx) => ({
        path: `/folders/${fx.folderId}/members/${fx.member.id}/access-history`,
      }),
      stranger: {
        expected: 404,
        rule: "7.4: the member-specific slice is the folder's history filtered, and carries the folder's own visibility",
      },
    },
  ],
  /*
  The five Responsibility routes of issue #230, each with its authorization
  row.

  Three are reads that carry the folder's own visibility: #209 R5 makes the
  Responsibility document Folder-visible in M1 and R10 gives prior revisions
  ordinary Folder visibility, so a current member reads them and somebody
  outside the folder is told nothing at all. That last half is proof 15 of
  #230 as well as 10.2: **a former member is refused their own history**, and
  the refusal is 404 because they are no longer in the folder rather than
  because anything hides the subject from themselves.

  Two are mutations. The grant toggle is member administration, so a plain
  member who demonstrably sees the folder is told why it is refused. The
  commit is the one row on this surface whose *member* variant deliberately
  has no `expected: 403`: the refusal is issued from inside the write's own
  transaction, after the target's grant has been read under the same lock,
  which is where that decision has to be made and is not something a
  path-shaped sweep can see. AC-562 and AC-563 drive it with real actors.
  */
  [
    'GET /api/v1/folders/:id/members/:userId',
    {
      attempt: (fx) => ({
        path: `/folders/${fx.folderId}/members/${fx.member.id}`,
      }),
      stranger: {
        expected: 404,
        rule: '7.4: the member-details projection composes facts the roster already shows to members, and 10.2 refuses to confirm the folder exists to somebody outside it',
      },
    },
  ],
  [
    'GET /api/v1/folders/:id/members/:userId/responsibility',
    {
      attempt: (fx) => ({
        path: `/folders/${fx.folderId}/members/${fx.member.id}/responsibility`,
      }),
      stranger: {
        expected: 404,
        rule: '7.4: the Responsibility document is Folder-visible in M1, which means visible to the Folder and to nobody else',
      },
    },
  ],
  [
    'PATCH /api/v1/folders/:id/members/:userId/bio',
    {
      attempt: (fx) => ({
        path: `/folders/${fx.folderId}/members/${fx.owner.id}/bio`,
        body: { bio: 'A short introduction' },
      }),
      stranger: {
        expected: 404,
        rule: 'A teammate bio is visible only through the Team, so an outsider cannot learn that the folder exists.',
      },
      member: {
        expected: 403,
        rule: 'A member may edit their own bio. Editing another member requires responsibility management authority.',
        attempt: (fx) => ({
          path: `/folders/${fx.folderId}/members/${fx.owner.id}/bio`,
          body: { bio: 'Changed by another member' },
        }),
      },
    },
  ],
  [
    'GET /api/v1/folders/:id/members/:userId/responsibility/history',
    {
      attempt: (fx) => ({
        path: `/folders/${fx.folderId}/members/${fx.member.id}/responsibility/history`,
      }),
      stranger: {
        expected: 404,
        rule: '7.4: prior revisions carry ordinary Folder visibility, so being the subject of one is not a way into a folder',
      },
    },
  ],
  [
    'PUT /api/v1/folders/:id/members/:userId/responsibility',
    {
      attempt: (fx) => ({
        path: `/folders/${fx.folderId}/members/${fx.member.id}/responsibility`,
        body: {
          content: { version: 1, blocks: [] },
          base_revision: 'ac397-not-the-current-revision',
        },
      }),
      stranger: {
        expected: 404,
        rule: "7.4: writing a member's Responsibility needs Full control or that member's explicit self-edit grant, and 10.2 tells somebody outside the folder nothing at all",
      },
    },
  ],
  [
    'PUT /api/v1/folders/:id/members/:userId/self-edit-grant',
    {
      attempt: (fx) => ({
        path: `/folders/${fx.folderId}/members/${fx.member.id}/self-edit-grant`,
        body: { enabled: true },
      }),
      stranger: {
        expected: 404,
        rule: '7.4: toggling the self-edit grant is member administration, and 10.2 refuses to confirm the folder exists to somebody outside it',
      },
      member: {
        expected: 403,
        rule: "7.4: only Full control administers the grant, and a member who could turn their own on would be granting themselves the thing the grant exists to withhold; the member demonstrably sees the folder, so the refusal may say why",
        attempt: (fx) => ({
          path: `/folders/${fx.folderId}/members/${fx.member.id}/self-edit-grant`,
          body: { enabled: true },
        }),
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
        rule: '8.9: ownership is the owner\'s to give, and the member demonstrably sees the folder, so the refusal may say why',
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
    'POST /api/v1/folders/:id/import',
    {
      attempt: (fx) => ({
        path: `/folders/${fx.folderId}/import?tz=UTC`,
        body: { dana: 'workflow', version: 1, folders: [{ name: 'cannot land here' }] },
      }),
      stranger: {
        expected: 404,
        rule: 'wave 2 and 7.16: importing into a page adds sub-pages to it, a page edit, so a non-member cannot name the page',
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

  [
    'GET /api/v1/discussions/:id/comments',
    {
      attempt: (fx) => ({
        path: `/discussions/${fx.generalDiscussionId}/comments`,
      }),
      stranger: {
        expected: 404,
        rule: '#320 and 7.14: a Discussion is its Folder\'s, so its conversation is member-only and a Discussion outside the viewer\'s membership is 404, never 403',
      },
    },
  ],
  [
    'POST /api/v1/discussions/:id/comments',
    {
      attempt: (fx) => ({
        path: `/discussions/${fx.generalDiscussionId}/comments`,
        body: { body: 'ac397 from a stranger' },
      }),
      stranger: {
        expected: 404,
        rule: '#320 and 7.14: writing to a Discussion needs membership of its Folder',
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
    'GET /api/v1/tasks/:id/document',
    {
      attempt: (fx) => ({ path: `/tasks/${fx.taskId}/document` }),
      stranger: {
        expected: 404,
        rule: "#221 (AC-882): a Task's document is read by whoever can see the Task, so a non-member is 404 exactly as on `GET /tasks/:id`",
      },
    },
  ],
  [
    'PUT /api/v1/tasks/:id/document',
    {
      attempt: (fx) => ({
        path: `/tasks/${fx.taskId}/document`,
        body: {
          action: 'document_transaction',
          mutation_id: '00000000-0000-4000-8000-000000000397',
          base_revision: 'ac397',
          operations: [{ op: 'set_outline', items: [] }],
        },
      }),
      stranger: {
        expected: 404,
        rule: "#221 (AC-882): the document transaction over a Task, refused as 404 because the Task's folder is not the caller's to see",
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
  /* -------------------------------------------------------------- *
   * Task dependencies (issue #224). Three routes, one relation, and the
   * table has one thing to say about each: a person with no membership of
   * the folder the task lives in cannot read its relations, cannot give it
   * a blocker, and cannot take one away. The far end of an edge is named in
   * the *body* on the create and so is invisible to this sweep, which is
   * why the gate on it is hand-written in domain/task-dependencies.ts and
   * pinned by AC-443 rather than here.
   * -------------------------------------------------------------- */
  [
    'GET /api/v1/tasks/:id/dependencies',
    {
      attempt: (fx) => ({ path: `/tasks/${fx.taskId}/dependencies` }),
      stranger: {
        expected: 404,
        rule: '10.2: a task\'s relations are read by exactly the people who read the task, and an inaccessible task is 404 rather than 403',
      },
    },
  ],
  [
    'GET /api/v1/folders/:id/dependencies',
    {
      attempt: (fx) => ({ path: `/folders/${fx.folderId}/dependencies` }),
      stranger: {
        expected: 404,
        rule: '10.2 and 7.25: a Folder\'s internal relations are read by exactly its members, and a non-member is told what an id naming nothing is told — 404, never 403, with no edge looked at',
      },
    },
  ],
  [
    'POST /api/v1/tasks/:id/dependencies',
    {
      attempt: (fx) => ({
        path: `/tasks/${fx.taskId}/dependencies`,
        body: { blocking_task_id: fx.blockingTaskId },
      }),
      stranger: {
        expected: 404,
        rule: '5.4 row 2: giving a task a blocker is an edit of that task, and a non-member makes none',
      },
    },
  ],
  [
    'DELETE /api/v1/tasks/:id/dependencies/:dependencyId',
    {
      attempt: (fx) => ({
        path: `/tasks/${fx.taskId}/dependencies/${fx.dependencyId}`,
      }),
      stranger: {
        expected: 404,
        rule: '5.4 row 2: either end of a relation may remove it, and a non-member is neither end',
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
        rule: '7.7 (a shim over the body checklist until the contract release): the task\'s folder decides who may touch it',
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
        rule: '7.7 (shim): a checklist item is addressed by its own id and reached through its task\'s folder',
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
        rule: '7.16: `duplicateShelf` selects `WHERE id = ? AND user_id = viewer`, so a shelf that is not the caller\'s is not-found rather than forbidden — 4.18 makes a shelf private by construction, and 10.2 keeps ownership invisible to those without it. The 404 does a second job here: a copy is a create, so any other status would not only leak the shelf but leave a copy of it in the stranger\'s Library that this sweep never cleans up',
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
    'POST /api/v1/shelves/:id/page/actions',
    {
      attempt: (fx) => ({
        path: `/shelves/${fx.shelfId}/page/actions`,
        body: {
          action: 'document_transaction',
          mutation_id: '00000000-0000-4000-8000-000000000890',
          base_revision: 'ac397',
          operations: [{ op: 'set_outline', items: [] }],
        },
      }),
      stranger: {
        expected: 404,
        rule: "#221 and 4.18: a Shelf's document transaction, refused before the body is read because the Shelf is not the caller's",
      },
    },
  ],
  [
    'GET /api/v1/views/:id',
    {
      attempt: (fx) => ({ path: `/views/${fx.viewId}` }),
      stranger: {
        expected: 404,
        rule: '4.19: a saved view is one account\'s, and every statement behind this route is viewer-scoped',
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
      stranger: { expected: 404, rule: '4.19, as the read above' },
    },
  ],
  [
    'DELETE /api/v1/views/:id',
    {
      attempt: (fx) => ({ path: `/views/${fx.viewId}` }),
      stranger: { expected: 404, rule: '4.19, as the read above' },
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
        rule: '7.14: a member sees the thread, so touching another author\'s words is a forbidden act rather than a missing row',
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
  [
    'PUT /api/v1/comments/:id/reactions/:reaction',
    {
      attempt: (fx) => ({ path: `/comments/${fx.commentId}/reactions/heart`, body: {} }),
      stranger: {
        expected: 404,
        rule: '7.14: a reaction needs the thread, so it needs the folder; the key is read only after',
      },
    },
  ],
  [
    'DELETE /api/v1/comments/:id/reactions/:reaction',
    {
      attempt: (fx) => ({ path: `/comments/${fx.commentId}/reactions/heart` }),
      stranger: { expected: 404, rule: '7.14, as the reaction above' },
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
        rule: '7.15 gives the delete to "uploader or folder owner", and this member is neither. 10.2 fixes the status: the member reads the same file at 200 through GET /files/:id, so visibility is permitted and the forbidden act is 403, the same shape DELETE /comments/:id answers. AC-398 is the direct case',
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
        rule: "7.13: a task's permanent delete is Full control's, and this member holds Can edit, so they can see the row and 10.2 admits a forbidden here. Ownership is *ignored* by `task.destroy` and required beside Full control by `folder.destroy`, so this row and the next are one status and two rules",
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
        rule: "7.13, as the task above and one step narrower: a folder's permanent destruction needs the owner *and* Full control together, so this member is refused twice over",
      },
    },
  ],
  [
    'POST /api/v1/archive/folders/:id/restore',
    {
      attempt: (fx) => ({ path: `/archive/folders/${fx.archivedFolderId}/restore` }),
      stranger: { expected: 404, rule: 'archive restore is scoped by project membership' },
      member: { expected: 403, rule: 'archive restore requires Full control or ownership' },
    },
  ],
  [
    'DELETE /api/v1/archive/folders/:id',
    {
      attempt: (fx) => ({ path: `/archive/folders/${fx.archivedFolderId}` }),
      stranger: { expected: 404, rule: 'archived Work is invisible outside its project' },
      member: { expected: 403, rule: 'permanent deletion needs ownership and Full control' },
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

  /* -------------------------------------------------------------- *
   * Dana Link references (issue #223)
   * -------------------------------------------------------------- */
  [
    'GET /api/v1/references/:kind/:id',
    {
      /* Driven as a folder, deliberately, and not because a folder is the
         interesting kind. This sweep drives one concrete path per route, so
         the row can only speak for one of the three; the criterion that
         covers the other two, and the case that a shelf and a task refuse
         the same way, is AC-425, which asks all three of both accounts.
         What this row is for is the structural half: the route cannot join
         the application without somebody writing down what a stranger
         gets. */
      attempt: (fx) => ({ path: `/references/folder/${fx.folderId}` }),
      stranger: {
        expected: 404,
        rule: '10.2 and 7.24: a Dana Link never grants access, and an inaccessible target must be indistinguishable from a nonexistent one, so a non-member is told exactly what an id naming nothing is told — 404, never 403, and never a label',
      },
    },
  ],
  [
    'GET /api/v1/tasks/:id/backlinks',
    {
      attempt: (fx) => ({ path: `/tasks/${fx.taskId}/backlinks` }),
      stranger: {
        expected: 404,
        rule: 'issue #214 and 10.2: "referenced from" is gated on the target through the Dana Link resolver, so a reader who cannot open the target is told what an id naming nothing is told — 404, and no source is scanned',
      },
    },
  ],
  [
    'GET /api/v1/folders/:id/backlinks',
    {
      attempt: (fx) => ({ path: `/folders/${fx.folderId}/backlinks` }),
      stranger: {
        expected: 404,
        rule: 'issue #214 and 10.2: "referenced from" is gated on the target through the Dana Link resolver, so a reader who cannot open the target is told what an id naming nothing is told — 404, and no source is scanned',
      },
    },
  ],
  [
    'GET /api/v1/shelves/:id/backlinks',
    {
      attempt: (fx) => ({ path: `/shelves/${fx.shelfId}/backlinks` }),
      stranger: {
        expected: 404,
        rule: 'issue #214 and 10.2: "referenced from" is gated on the target through the Dana Link resolver, so a reader who cannot open the target is told what an id naming nothing is told — 404, and no source is scanned',
      },
    },
  ],
  [
    'GET /api/v1/facets/:id/backlinks',
    {
      attempt: (fx) => ({ path: `/facets/${fx.tabId}/backlinks` }),
      stranger: {
        expected: 404,
        rule: 'issue #214 and 10.2: "referenced from" is gated on the target through the Dana Link resolver, so a reader who cannot open the target is told what an id naming nothing is told — 404, and no source is scanned',
      },
    },
  ],
  [
    'GET /api/v1/discussions/:id/backlinks',
    {
      attempt: (fx) => ({ path: `/discussions/${fx.discussionId}/backlinks` }),
      stranger: {
        expected: 404,
        rule: 'issues #214 and #320, 10.2: a Discussion is a Dana Link target gated on membership of its live Folder, so a non-member is told what an id naming nothing is told — 404, and no source is scanned',
      },
    },
  ],
  [
    'GET /api/v1/results/:id/backlinks',
    {
      attempt: (fx) => ({ path: `/results/${fx.resultId}/backlinks` }),
      stranger: {
        expected: 404,
        rule: 'issues #213 and #214, 10.2: a Result is a Dana Link target gated on membership of the live Folder of its Results facet, so a non-member is told what an id naming nothing is told — 404, and no source is scanned',
      },
    },
  ],
  [
    'GET /api/v1/results/:id',
    {
      attempt: (fx) => ({ path: `/results/${fx.resultId}` }),
      stranger: {
        expected: 404,
        rule: "#213: a Result's location is exactly as visible as its Results facet, and inaccessible is indistinguishable from nonexistent",
      },
    },
  ],
  [
    'GET /api/v1/outcomes/:id/backlinks',
    {
      attempt: (fx) => ({ path: `/outcomes/${fx.outcomeId}/backlinks` }),
      stranger: {
        expected: 404,
        rule: 'issues #214 and #320, 10.2: an Outcome is a Dana Link target gated on membership of the live Folder of its Discussion, so a non-member is told what an id naming nothing is told — 404, and no source is scanned',
      },
    },
  ],

  /* -------------------------------------------------------------- *
   * Labels (issue #226, parent #208)
   *
   * Eleven rows, one per id-bearing route of the Label surface, and every one
   * of them 404. There is no `member` variant anywhere in this block, and the
   * reason changed in issue #274 while the rows did not.
   *
   * It used to be the model: #208's accepted R5A gave **all current Folder
   * members equal rights** to create, rename, recolor, describe, archive,
   * restore, apply and remove Folder Labels, so there was no act here that 5.4
   * granted a member sight of and withheld. That sentence also predicted that
   * #209's explicit Responsibilities and Authorities would put `member`
   * variants in this block "and the sweep will ask for them by failing".
   *
   * **#209 arrived as #228 and #274, R8 superseded R5A, and the sweep did not
   * ask** — which is worth reading rather than correcting away. A `member`
   * variant asserts what a member is *refused*, and `fx.member` holds **Can
   * edit**, which is exactly the bar `label.vocabulary.manage` and
   * `label.apply` sit at; there is still no act on these routes this actor is
   * refused. A member **below** the bar now gets 403 from six of them, and
   * that is AC-800's subject, driven with one actor per preset. The same
   * correction is on `PATCH /api/v1/folders/:id` above, for the same reason
   * and on the same day.
   *
   * `GET /api/v1/labels` is deliberately absent, and it is the standing
   * example this file's header warns about: it takes `folder_id` from the
   * **query string**, so it carries no path parameter, does not enumerate
   * here, and cannot be swept. AC-473 is its gate's criterion.
   * -------------------------------------------------------------- */
  [
    'PATCH /api/v1/labels/personal/:labelId',
    {
      attempt: (fx) => ({
        path: `/labels/personal/${fx.personalLabelId}`,
        body: { name: 'ac397 renamed by a stranger' },
      }),
      stranger: {
        expected: 404,
        rule: "4.24: a Personal Label is private to its owner. The statement's predicate carries owner_user_id = viewer, so a foreign id resolves to nothing rather than to a row this handler then refuses — which is what 10.2 requires, a 403 here confirming that somebody has a label by that id",
      },
    },
  ],
  [
    'POST /api/v1/labels/personal/:labelId/archive',
    {
      attempt: (fx) => ({ path: `/labels/personal/${fx.personalLabelId}/archive` }),
      stranger: {
        expected: 404,
        rule: '4.24, as the PATCH above: archiving somebody else\'s private vocabulary is not a thing the query can express',
      },
    },
  ],
  [
    'POST /api/v1/labels/personal/:labelId/restore',
    {
      attempt: (fx) => ({ path: `/labels/personal/${fx.personalLabelId}/restore` }),
      stranger: {
        expected: 404,
        rule: '4.24, as its twin above',
      },
    },
  ],
  [
    'POST /api/v1/folders/:folderId/labels',
    {
      attempt: (fx) => ({
        path: `/folders/${fx.folderId}/labels`,
        body: { name: 'ac397 intruder', color: '#123456' },
      }),
      stranger: {
        expected: 404,
        rule: '5.4 "See folder and every task in it: no (404)" for a non-member, and a Folder\'s Label vocabulary is part of the Folder. The gate is accessOf on the path folder, before the body is even read for a decision',
      },
    },
  ],
  [
    'PATCH /api/v1/folders/:folderId/labels/:labelId',
    {
      attempt: (fx) => ({
        path: `/folders/${fx.folderId}/labels/${fx.folderLabelId}`,
        body: { color: '#654321' },
      }),
      stranger: {
        expected: 404,
        rule: '5.4 and 10.2: the folder gate refuses a non-member before the label is resolved, and the label predicate carries the path folder besides, so neither id alone is a way in',
      },
    },
  ],
  [
    'POST /api/v1/folders/:folderId/labels/:labelId/archive',
    {
      attempt: (fx) => ({
        path: `/folders/${fx.folderId}/labels/${fx.folderLabelId}/archive`,
      }),
      stranger: { expected: 404, rule: '5.4 and 10.2, as the PATCH above' },
    },
  ],
  [
    'POST /api/v1/folders/:folderId/labels/:labelId/restore',
    {
      attempt: (fx) => ({
        path: `/folders/${fx.folderId}/labels/${fx.folderLabelId}/restore`,
      }),
      stranger: { expected: 404, rule: '5.4 and 10.2, as its twin above' },
    },
  ],
  [
    'PUT /api/v1/folders/:folderId/labels/:labelId',
    {
      /* Driven with the stranger's own Personal Label rather than with the
         owner's, which is the harder of the two questions and the one worth
         asking. A stranger handing over a label they genuinely own must still
         be refused, because what they may not reach is the **folder**; a row
         driving the owner's label would pass on the label gate alone and would
         say nothing about the folder gate this route also needs: with
         `folderAccess` replaced by a bare `parsedId`, a stranger could write a
         `folder_personal_labels` row against a folder they cannot see. */
      attempt: (fx) => ({
        path: `/folders/${fx.folderId}/labels/${fx.strangerPersonalLabelId}`,
      }),
      stranger: {
        expected: 404,
        rule: "5.4: a non-member cannot see the folder, so they cannot classify it either, and 10.2 makes that a 404. The label in the path is the stranger's own here, so the refusal is the folder gate's and could not be the label's",
      },
    },
  ],
  [
    'DELETE /api/v1/folders/:folderId/labels/:labelId',
    {
      attempt: (fx) => ({
        path: `/folders/${fx.folderId}/labels/${fx.strangerPersonalLabelId}`,
      }),
      stranger: {
        expected: 404,
        rule: '5.4 and 10.2, as the PUT above; the delete is idempotent for a member and still unreachable for a stranger',
      },
    },
  ],
  [
    'PUT /api/v1/tasks/:taskId/labels/:labelId',
    {
      attempt: (fx) => ({
        path: `/tasks/${fx.taskId}/labels/${fx.strangerPersonalLabelId}`,
      }),
      stranger: {
        expected: 404,
        rule: "5.4 and 10.2: the task gate is accessibleTask, whose membership join is in its FROM clause, so a task in a folder the caller is not in is null rather than a row. The label is the stranger's own, so the 404 is the task's",
      },
    },
  ],
  [
    'DELETE /api/v1/tasks/:taskId/labels/:labelId',
    {
      attempt: (fx) => ({
        path: `/tasks/${fx.taskId}/labels/${fx.strangerPersonalLabelId}`,
      }),
      stranger: {
        expected: 404,
        rule: '5.4 and 10.2, as the PUT above',
      },
    },
  ],

  /* -------------------------------------------------------------- *
   * Project tabs (step 7). 7.27's twelve facet routes are gone with the
   * facets: a facet is a tab, and a tab is a page the folder rows cover.
   * -------------------------------------------------------------- */
  [
    'POST /api/v1/folders/:id/tabs',
    {
      /* A valid body, so the row measures the gate rather than the schema.
         No member variant: `fx.member` holds Can edit, which is what adding
         a tab needs. */
      attempt: (fx) => ({
        path: `/folders/${fx.folderId}/tabs`,
        body: { kind: 'doc' },
      }),
      stranger: {
        expected: 404,
        rule: "step 7 and 10.2: adding a tab edits the project's structure, and a non-member sees nothing of it, so 404 before the body is read",
      },
    },
  ],
  /* The retired 7.27 facet reads, kept as shims over the tab rows for one
     release (installed PWAs on the old bundle). The contract migration
     deletes them and these rows. */
  [
    'GET /api/v1/folders/:id/facets',
    {
      attempt: (fx) => ({ path: `/folders/${fx.folderId}/facets` }),
      stranger: {
        expected: 404,
        rule: "step 7 shim and 10.2: the facet listing is the project's tab row, and a non-member sees nothing of the project",
      },
    },
  ],
  [
    'GET /api/v1/folders/:id/facets/:facetId/page',
    {
      attempt: (fx) => ({ path: `/folders/${fx.folderId}/facets/${fx.tabId}/page` }),
      stranger: {
        expected: 404,
        rule: "step 7 shim and 7.16: a tab's document is read by the tab's members, so a non-member is 404 exactly as on `/folders/:id/page`",
      },
    },
  ],
  [
    'GET /api/v1/facets/:id/location',
    {
      attempt: (fx) => ({ path: `/facets/${fx.tabId}/location` }),
      stranger: {
        expected: 404,
        rule: "step 7 shim and 10.2: the location names the tab's project, which a non-member must not learn",
      },
    },
  ],
  /* -------------------------------------------------------------- *
   * Consultation (7.28, issue #320)
   * -------------------------------------------------------------- */
  /*
  Every `/discussions/:id` route resolves the Discussion to its Folder and
  asks `accessOf` before reading a body, so a stranger is 404 whatever they
  send. `fx.member` holds Can edit, which every Discussion act below Full
  control admits, so the one member row is the permanent delete.
  */
  [
    'GET /api/v1/folders/:id/discussions',
    {
      attempt: (fx) => ({ path: `/folders/${fx.folderId}/discussions` }),
      stranger: {
        expected: 404,
        rule: "7.28 and 10.2: the Consultation list is `discussion.read`'s, and a non-member sees nothing of the Folder",
      },
    },
  ],
  [
    'POST /api/v1/folders/:id/discussions',
    {
      attempt: (fx) => ({
        path: `/folders/${fx.folderId}/discussions`,
        body: { title: 'ac397 intruder' },
      }),
      stranger: {
        expected: 404,
        rule: "7.28 and 10.2: starting a Discussion in somebody else's Folder is 404 and never 403",
      },
    },
  ],
  [
    'GET /api/v1/discussions/:id',
    {
      attempt: (fx) => ({ path: `/discussions/${fx.discussionId}` }),
      stranger: {
        expected: 404,
        rule: "7.28 and 10.2: a Discussion is readable by its Folder's members only, and a refusal must not confirm it exists",
      },
    },
  ],
  [
    'PATCH /api/v1/discussions/:id',
    {
      attempt: (fx) => ({
        path: `/discussions/${fx.discussionId}`,
        body: { title: 'ac397 renamed' },
      }),
      stranger: {
        expected: 404,
        rule: '7.28: existence before the body, so a non-member is 404 on the edit',
      },
    },
  ],
  [
    'DELETE /api/v1/discussions/:id',
    {
      attempt: (fx) => ({ path: `/discussions/${fx.discussionId}` }),
      stranger: {
        expected: 404,
        rule: "7.28 and 7.13: a non-member cannot move somebody else's Discussion to Trash, and is told nothing about it",
      },
    },
  ],
  [
    'POST /api/v1/discussions/:id/resolve',
    {
      attempt: (fx) => ({
        path: `/discussions/${fx.discussionId}/resolve`,
        body: { statement: 'ac397 intruder outcome' },
      }),
      stranger: {
        expected: 404,
        rule: '7.28: resolving records an Outcome in the Folder, so a non-member is 404 before the body is read',
      },
    },
  ],
  [
    'POST /api/v1/discussions/:id/reopen',
    {
      attempt: (fx) => ({ path: `/discussions/${fx.discussionId}/reopen`, body: {} }),
      stranger: {
        expected: 404,
        rule: '7.28: reopening is a Discussion act, 404 to a non-member',
      },
    },
  ],
  [
    'POST /api/v1/discussions/:id/tasks',
    {
      attempt: (fx) => ({
        path: `/discussions/${fx.discussionId}/tasks`,
        body: { task_id: fx.taskId },
      }),
      stranger: {
        expected: 404,
        rule: "7.28 (issue #497): linking a task is a Discussion edit, gated on the Discussion's Folder before the body's task_id is read, so a non-member is 404 and no edge is written",
      },
    },
  ],
  [
    'DELETE /api/v1/discussions/:id/tasks/:taskId',
    {
      attempt: (fx) => ({ path: `/discussions/${fx.discussionId}/tasks/${fx.taskId}` }),
      stranger: {
        expected: 404,
        rule: '7.28 (issue #497): unlinking is a Discussion edit, so a non-member is 404 on the Discussion before the task id is looked at',
      },
    },
  ],
  [
    'PUT /api/v1/discussions/:id/read',
    {
      attempt: (fx) => ({ path: `/discussions/${fx.discussionId}/read` }),
      stranger: {
        expected: 404,
        rule: "7.28: a read marker is a member's own state on a Discussion they can see, so a non-member is 404 and no row is written",
      },
    },
  ],
  [
    'POST /api/v1/tasks/:id/discussion',
    {
      attempt: (fx) => ({ path: `/tasks/${fx.taskId}/discussion` }),
      stranger: {
        expected: 404,
        rule: "7.28 (M5): a task's Discussion is found or made in the task's Folder, so a non-member is 404, as on every /tasks/:id route, and no Discussion is made",
      },
    },
  ],
  [
    'GET /api/v1/discussions/:id/outcomes',
    {
      attempt: (fx) => ({ path: `/discussions/${fx.discussionId}/outcomes` }),
      stranger: {
        expected: 404,
        rule: '7.28: Outcome history is read with its Discussion, by members only',
      },
    },
  ],
  [
    'GET /api/v1/outcomes/:id',
    {
      attempt: (fx) => ({ path: `/outcomes/${fx.outcomeId}` }),
      stranger: {
        expected: 404,
        rule: "7.28 and #320: an Outcome's direct route is exactly as visible as its Discussion, and inaccessible is indistinguishable from nonexistent",
      },
    },
  ],
  [
    'POST /api/v1/discussions/:id/restore',
    {
      attempt: (fx) => ({ path: `/discussions/${fx.trashedDiscussionId}/restore` }),
      stranger: {
        expected: 404,
        rule: '7.13 and 7.28: access to a trashed row is by membership at read time, so a non-member is 404',
      },
    },
  ],
  [
    'DELETE /api/v1/trash/discussions/:id',
    {
      attempt: (fx) => ({ path: `/trash/discussions/${fx.trashedDiscussionId}` }),
      stranger: {
        expected: 404,
        rule: '7.13 and 7.28: a non-member sees nothing in Trash either',
      },
      member: {
        expected: 403,
        rule: '#320 and 7.28: permanently deleting a Discussion is `discussion.purge`, Full control, and `fx.member` holds Can edit',
      },
    },
  ],
  /* -------------------------------------------------------------- *
   * Consultation input rounds (issue #321)
   *
   * Every route resolves the Discussion's Folder membership first, inside
   * the transaction that writes, so a non-member is 404 whatever the body.
   * No member variant: `fx.member` holds Can edit, which may open, close and
   * respond, so nothing on these routes refuses them for authority.
   * -------------------------------------------------------------- */
  [
    'GET /api/v1/discussions/:id/input-rounds',
    {
      attempt: (fx) => ({ path: `/discussions/${fx.discussionId}/input-rounds` }),
      stranger: {
        expected: 404,
        rule: "#321 and 10.2: input rounds are read with `discussion.read`, the Folder's own visibility, so a non-member learns nothing, not even that the Discussion exists",
      },
    },
  ],
  [
    'POST /api/v1/discussions/:id/input-rounds',
    {
      /* A valid body, so a green row cannot be a 422 that never reached the
         gate. The fixture's round is still open, so a member would be 409;
         the stranger is refused before that is looked at. */
      attempt: (fx) => ({
        path: `/discussions/${fx.discussionId}/input-rounds`,
        body: { mode: 'advice', prompt: 'ac397 attempt' },
      }),
      stranger: {
        expected: 404,
        rule: "#321 and 10.2: asking for input in somebody else's Discussion is 404 and never 403",
      },
    },
  ],
  [
    'GET /api/v1/input-rounds/:id',
    {
      attempt: (fx) => ({ path: `/input-rounds/${fx.inputRoundId}` }),
      stranger: {
        expected: 404,
        rule: "#321 and 10.2: a round carries its Discussion's Folder visibility",
      },
    },
  ],
  [
    'POST /api/v1/input-rounds/:id/close',
    {
      attempt: (fx) => ({ path: `/input-rounds/${fx.inputRoundId}/close`, body: {} }),
      stranger: { expected: 404, rule: '#321 and 10.2: a non-member sees nothing' },
    },
  ],
  [
    'PUT /api/v1/input-rounds/:id/response',
    {
      attempt: (fx) => ({
        path: `/input-rounds/${fx.inputRoundId}/response`,
        body: { option_id: fx.inputRoundId },
      }),
      stranger: {
        expected: 404,
        rule: '#321 and 10.2: responding needs Can comment in the Folder; a non-member is refused before the body is checked against the round, so the answer says nothing about its options',
      },
    },
  ],
  [
    'DELETE /api/v1/input-rounds/:id/response',
    {
      attempt: (fx) => ({ path: `/input-rounds/${fx.inputRoundId}/response` }),
      stranger: {
        expected: 404,
        rule: '#321 and 10.2: withdrawing is scoped to the caller, and a non-member has no response and no Folder to withdraw it from',
      },
    },
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

describe('every id-bearing route refuses a stranger', () => {
  test('the enumeration and the table describe the same surface', async () => {
    const routes = idBearingRoutes(app.application)

    // No pinned count. The table-equality checks below are what make a new
    // id-bearing route fail here until it has a row saying what a stranger gets.
    expect(routes.length, 'the walker found no id-bearing routes').toBeGreaterThan(0)

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
  because comments here describe intent, and "by construction" is a claim
  worth running.

  **A `Record` over `ResourceId` rather than a list of calls**, so the compiler refuses an id that joins `Fixtures` and no
  probe. The two pages are named beside it and not in it, because a page is
  addressed by its home's id and has none of its own.
  */
  const VISIBLE_TO_ITS_OWNER: Record<
    ResourceId,
    (fx: Fixtures) => {
      what: string
      path: string
      holds?: string
      /** Who to ask, where the fixture's maker is not `owner`. Added with
       * `strangerPersonalLabelId`, whose whole point is that it belongs to
       * somebody else; asking the owner about it would answer 200 without it
       * and read as a missing fixture. */
      as?: Actor
    }
  > = {
    folderId: (fx) => ({ what: 'the folder', path: `/folders/${fx.folderId}` }),
    taskId: (fx) => ({ what: 'the task', path: `/tasks/${fx.taskId}` }),
    blockingTaskId: (fx) => ({
      what: 'the blocking task',
      path: `/tasks/${fx.blockingTaskId}`,
    }),
    dependencyId: (fx) => ({
      what: 'the dependency, on the dependent task it hangs from',
      path: `/tasks/${fx.taskId}/dependencies`,
      holds: fx.dependencyId,
    }),
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
    generalDiscussionId: (fx) => ({
      what: 'the General discussion, by its conversation',
      path: `/discussions/${fx.generalDiscussionId}/comments`,
      holds: fx.commentId,
    }),
    notificationId: (fx) => ({
      what: 'the notification',
      path: '/notifications',
      holds: fx.notificationId,
    }),
    conversationId: (fx) => ({
      what: 'the private conversation',
      path: `/direct-conversations/${fx.conversationId}/messages`,
      holds: fx.conversationId,
    }),
    directMessageId: (fx) => ({
      what: 'the private message',
      path: `/direct-conversations/${fx.conversationId}/messages`,
      holds: fx.directMessageId,
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
    archivedFolderId: (fx) => ({
      what: 'the archived Work',
      path: '/archive/folders',
      holds: fx.archivedFolderId,
    }),
    /* Both Label fixtures are read through the one listing that answers for
       both scopes, with `scope=all`, which is also the cheapest way to prove
       the definition listing shows an owner their own work. */
    personalLabelId: (fx) => ({
      what: 'the personal label',
      path: '/labels?scope=all',
      holds: fx.personalLabelId,
    }),
    strangerPersonalLabelId: (fx) => ({
      what: "the stranger's own personal label",
      path: '/labels?scope=all',
      holds: fx.strangerPersonalLabelId,
      as: fx.stranger,
    }),
    folderLabelId: (fx) => ({
      what: 'the folder label',
      path: '/labels?scope=all',
      holds: fx.folderLabelId,
    }),
    tabId: (fx) => ({
      what: 'the Doc tab, on the folder list',
      path: '/folders?tabs=1',
      holds: fx.tabId,
    }),
    discussionId: (fx) => ({
      what: 'the discussion, as a Dana Link',
      path: `/references/discussion/${fx.discussionId}`,
      holds: fx.discussionId,
    }),
    outcomeId: (fx) => ({
      what: 'the outcome, as a Dana Link',
      path: `/references/outcome/${fx.outcomeId}`,
      holds: fx.outcomeId,
    }),
    resultId: (fx) => ({
      what: 'the result, as a Dana Link',
      path: `/references/result/${fx.resultId}`,
      holds: fx.resultId,
    }),
    trashedDiscussionId: (fx) => ({
      what: 'the trashed discussion',
      path: '/trash',
      holds: fx.trashedDiscussionId,
    }),
    inputRoundId: (fx) => ({
      what: 'the input round, through its discussion',
      path: `/discussions/${fx.discussionId}/input-rounds`,
      holds: fx.inputRoundId,
    }),
  }

  test('every fixture exists and its owner can see it', async () => {
    const fx = await fixturesOf()
    const invisible: string[] = []

    const seen = async (
      what: string,
      path: string,
      holds?: string,
      as?: Actor,
    ): Promise<void> => {
      const answer = await (as ?? fx.owner).browser.api(path)
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
      const { what, path, holds, as } = probe(fx)
      await seen(what, path, holds, as)
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

  **It is empty, and the machinery stays** as the shape for the next one,
  because a sweep that can only record findings it is allowed to fix is a
  sweep that will one day be quietly narrowed to fit.

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
