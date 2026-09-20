/*
AC-493: every mutating route on the mounted application is mapped, by name, to
either a Folder action the resolver governs or an explicit classification as
personal, account or system state that Folder Access does not govern -- and
the mapping is enumerated over the router in both directions, so a route that
joins the application without a decision fails here.

Issue #228 required proof 24, and the forward half of proof 25. Product
authority: #209 R7 section Q and R8A; #228 "Existing mutation audit".

## What this is and what it is not

#228 asks for an audit, and an audit is a document. What a document cannot do
is stay true. So this criterion is the audit written as a table and then
**enumerated against the mounted router in both directions**, which is the
same bargain `ac-236`'s `PUBLIC_READS` and `ac-397`'s expected-status table
strike and the only property that makes a hand-written list a guard:

- a mutating route the walker finds and this table does not name fails here;
- a table entry naming a route that is not mounted fails here too.

**It does not check that the mapping is right.** Nothing structural can: the
question "is trashing a Task Can edit's or Full control's" is a product
question, and it is answered by AC-482 through AC-491, each driving real
actors at real routes. What this catches is the different and more likely
failure -- a route added later with no thought about Access at all, which
would otherwise inherit whatever its neighbours happened to do.

## The classifications, and why "outside" needs a reason each

`OUTSIDE_FOLDER_ACCESS` is not an exemption list; it is the other half of the
answer. R7 section A puts personal and account state outside Folder Access
deliberately, and a route that belongs there is not ungoverned -- it is
governed by ownership of the account, which `requireSession` and a
viewer-scoped query already settle. Each entry carries the reason, because a
list of paths with no reasons is a list nobody can review.

## Proof 25, in the state #226 leaves it

#228 supersedes #208/#226's interim "all Folder members may manage Folder
Labels" rule. **The Label routes are not on this branch**: #226 is in flight
and merges before this. So the forward contract is what can be proved today --
that the two Label actions exist in the vocabulary at R8A's bars -- plus the
enumeration above, which will fail the moment #226's twelve routes arrive
without a decision beside each. That is the handoff, and it is written in the
pull request as well as here.

Spec: 10.2; #209 R7 sections A, H and Q, R8A.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import {
  FOLDER_ACTIONS,
  atLeast,
  mayPerform,
  ruleFor,
} from '../../src/server/domain/folder-access.js'
import type { FolderAction } from '../../src/server/domain/folder-access.js'
import { FOLDER_ACCESS_PRESETS } from '../../src/shared/folder-access.js'
import type { FolderAccessPreset } from '../../src/shared/folder-access.js'

let app: AuthTestApp

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await app.close()
})

/* The router walk, the same one `ac-236` uses and for the same reason: this
 * suite measures the mounted artifact and cannot borrow Express's definition
 * of correct. One level deep, which is exactly as deep as this application
 * mounts; `ac-236`'s header carries the measurement and the count that would
 * notice the day that stops being true. */
interface RouteShape {
  path: string | readonly string[]
  methods: Record<string, boolean>
}
interface LayerShape {
  match?: (path: string) => boolean
  route?: RouteShape
  handle?: { stack?: LayerShape[] }
}

const MOUNTS = ['/api/v1', '/api/health', '/api/csp-report', '/api']
const MUTATING = ['post', 'patch', 'put', 'delete'] as const

function mutatingRoutes(application: unknown): string[] {
  const stack = (application as { router?: { stack?: LayerShape[] } }).router
    ?.stack
  expect(
    Array.isArray(stack),
    'the mounted application no longer exposes router.stack: this sweep must be rewritten against the new shape, never skipped',
  ).toBe(true)

  const found = new Set<string>()
  const collect = (route: RouteShape, mount: string): void => {
    const paths = typeof route.path === 'string' ? [route.path] : route.path
    for (const method of MUTATING) {
      if (route.methods[method] !== true) continue
      for (const path of paths) {
        found.add(`${method.toUpperCase()} ${mount}${path}`)
      }
    }
  }
  for (const layer of stack as LayerShape[]) {
    if (layer.route !== undefined) {
      collect(layer.route, '')
      continue
    }
    const sub = layer.handle?.stack
    if (!Array.isArray(sub)) continue
    const mount =
      MOUNTS.find((candidate) => layer.match?.(candidate) === true) ?? ''
    for (const nested of sub) {
      if (nested.route !== undefined) collect(nested.route, mount)
    }
  }
  return [...found].sort()
}

/**
 * Every shared mutation, mapped to the Folder action that governs it.
 *
 * A route that can perform more than one act names the act its *gate* asks
 * for, which for a body-switched route is the strictest of them -- the page
 * actions endpoint is the case, and the choice is recorded in the refusals
 * list of the pull request.
 */
const GOVERNED: Record<string, FolderAction> = {
  'PATCH /api/v1/folders/:id': 'folder.profile.edit',
  'DELETE /api/v1/folders/:id': 'folder.trash',
  'POST /api/v1/folders/:id/restore': 'folder.restore',
  'DELETE /api/v1/trash/folders/:id': 'folder.destroy',
  'DELETE /api/v1/trash/tasks/:id': 'task.destroy',
  'POST /api/v1/folders/:id/duplicate': 'folder.duplicate',
  'POST /api/v1/folders/:id/transfer-ownership': 'folder.ownership.transfer',
  'POST /api/v1/folders/:id/owner-recovery': 'owner.custody_recovery',
  'POST /api/v1/folders/:id/members': 'member.add',
  'PATCH /api/v1/folders/:id/members/:userId': 'member.access.change',
  'DELETE /api/v1/folders/:id/members/:userId': 'member.remove',
  'DELETE /api/v1/folders/:id/my-membership': 'member.leave',
  'PUT /api/v1/folders/:id/page': 'folder.page.edit',
  'POST /api/v1/folders/:id/page/actions': 'folder.section.manage',
  'POST /api/v1/folders/:id/cover/photo': 'folder.profile.edit',
  'POST /api/v1/folders/:id/comments': 'comment.create',
  'PATCH /api/v1/comments/:id': 'comment.mutate.own',
  'DELETE /api/v1/comments/:id': 'comment.mutate.own',
  'PUT /api/v1/comments/:id/like': 'comment.like',
  'DELETE /api/v1/comments/:id/like': 'comment.like',
  'POST /api/v1/tasks': 'task.create',
  'PATCH /api/v1/tasks/:id': 'task.edit',
  'DELETE /api/v1/tasks/:id': 'task.trash',
  'POST /api/v1/tasks/:id/complete': 'task.status.complete',
  'POST /api/v1/tasks/:id/uncomplete': 'task.status.complete',
  'POST /api/v1/tasks/:id/abandon': 'task.status.abandon',
  'POST /api/v1/tasks/:id/restore': 'task.status.abandon',
  'POST /api/v1/tasks/:id/order': 'task.move',
  'POST /api/v1/tasks/:id/duplicate': 'task.duplicate',
  'POST /api/v1/tasks/:id/dependencies': 'task.dependency.manage',
  'DELETE /api/v1/tasks/:id/dependencies/:dependencyId':
    'task.dependency.manage',
  'POST /api/v1/tasks/:id/steps': 'step.manage',
  'PATCH /api/v1/steps/:id': 'step.toggle',
  'DELETE /api/v1/steps/:id': 'step.manage',
  'POST /api/v1/tasks/:id/steps/:stepId/promote': 'step.manage',
  'PUT /api/v1/tasks/:id/reminder': 'task.reminder.manage',
  'DELETE /api/v1/tasks/:id/reminder': 'task.reminder.manage',
  'POST /api/v1/files': 'file.upload.comment',
  'DELETE /api/v1/files/:id': 'file.delete',
  'POST /api/v1/tasks/:id/my-day': 'personal.my_day',
  'DELETE /api/v1/tasks/:id/my-day': 'personal.my_day',
  'PATCH /api/v1/folders/:id/my-membership': 'personal.membership_label',
  'POST /api/v1/invites': 'invite.create',
  'POST /api/v1/invites/:id/cancel': 'invite.administer',
  'POST /api/v1/invites/:id/resend': 'invite.administer',
}

/**
 * Every mutation that is **not** Folder Access's, with the reason.
 *
 * Read the reasons rather than the list: each is a claim that the route
 * touches personal, account or system state, and a wrong one here is exactly
 * as bad as a missing gate.
 */
const OUTSIDE_FOLDER_ACCESS: Record<string, string> = {
  /* `POST /api/v1/auth/dev-login` is deliberately absent, and its absence is
     the one thing in this table that needs saying rather than listing. The
     route exists only when `DANA_DEV_LOGIN` is set at construction and is
     excluded from production builds outright (11.6, AC-114), so it is not on
     the mounted application this sweep walks; a row for it would be a row
     naming nothing, which the both-directions check below is there to
     refuse. It is account state either way: it mints a session and names no
     folder. */
  'POST /api/v1/auth/logout':
    'the caller ends their own session. 10.1, and no folder is named',
  'PATCH /api/v1/me':
    "the account's own profile and timezone (7.1). Account state",
  'DELETE /api/v1/me':
    "the account itself (7.1, 8.10). Account state -- and since #228 it *reads* Folder ownership as a precondition, refusing while the account owns a shared folder somebody else is in (R6 section 3), which is a guard on the account act rather than a Folder action",
  'POST /api/v1/me/avatar':
    "the account's own picture, a folderless file (7.15)",
  'DELETE /api/v1/me/avatar': "the account's own picture",
  'PATCH /api/v1/settings': "the account's own settings (4.19, 7.23)",
  'POST /api/v1/views': 'a saved view, which is one person\'s (7.23)',
  'PATCH /api/v1/views/:id': "the person's own saved view; the query is viewer-scoped",
  'DELETE /api/v1/views/:id': "the person's own saved view",
  'PUT /api/v1/place-covers/:place':
    "one person's cover on one of Dana's own pages (7.19, 4.20). Per viewer by construction",
  'DELETE /api/v1/place-covers/:place': "one person's cover on a place page",
  'PUT /api/v1/place-descriptions/:place':
    "one person's sentence under a place page (7.21)",
  'POST /api/v1/notifications/:id/read':
    "the person's own notification state (4.14)",
  'POST /api/v1/notifications/read-all': "the person's own notification state",
  'DELETE /api/v1/connections/:userId':
    "the person's own roster (7.3, 4.2). A connection is between two accounts and belongs to neither folder nor membership",
  'POST /api/v1/sample': "the account's own sample workspace (7.22)",
  'DELETE /api/v1/sample': "the account's own sample workspace",
  'POST /api/v1/folders':
    'creating a folder is an account-level creation act (R7 section A): the creator becomes its owner and Full control, and no existing folder is touched',
  'POST /api/v1/workflows/import':
    'importing a workflow creates the importer\'s own folders (R7 section A, R7 section K: "Workflow import creates the importer\'s own Folder and is an account-level action outside source-Folder Access")',
  'POST /api/v1/shelves': 'a shelf is private to one person (4.18)',
  'PATCH /api/v1/shelves/:id': "the person's own shelf; viewer-scoped",
  'DELETE /api/v1/shelves/:id': "the person's own shelf",
  'POST /api/v1/shelves/:id/duplicate': "the person's own shelf",
  'PUT /api/v1/shelves/:id/page': "the person's own shelf page (4.18)",
  'POST /api/v1/covers/photo':
    'stores a picture owned by the caller with no folder at all, spending their own quota (7.19, issues #20 and #100)',
  'POST /api/v1/invites/:id/accept':
    "the recipient's own decision. R7 section L: \"Accepting/declining one's own invitation is a recipient action and does not require existing Folder Access\"",
  'POST /api/v1/invites/:id/decline': "the recipient's own decision",
  'POST /api/csp-report/':
    "the browser's own report of a policy refusal (issue #99). No session, no database, no folder",
}

describe('AC-493 every mutation is mapped to an action or classified outside', () => {
  test('AC-493 proof 24: the router and the audit describe the same surface', () => {
    const mounted = mutatingRoutes(app.application)
    const mapped = [
      ...Object.keys(GOVERNED),
      ...Object.keys(OUTSIDE_FOLDER_ACCESS),
    ].sort()

    const unmapped = mounted.filter((route) => !mapped.includes(route))
    expect(
      unmapped,
      'a mutating route with no row here is a route nobody decided about. Add it to GOVERNED with the Folder action that governs it, or to OUTSIDE_FOLDER_ACCESS with the reason it is personal, account or system state -- and, if it is governed, write the gate, because nothing here writes one for you',
    ).toEqual([])

    const stale = mapped.filter((route) => !mounted.includes(route))
    expect(
      stale,
      'a row naming a route this application does not mount is a decision about nothing, and it hides the day the route came back under a different name',
    ).toEqual([])

    expect(
      mounted.length,
      'the two directions above are what make this a guard; this count is the third reading and moves with every route added or removed',
    ).toBe(mapped.length)
  })

  test('AC-493 proof 24: every mapped action is one the resolver actually knows', () => {
    // A typo in the table would otherwise map a route to an action that
    // decides nothing, and the row would read as a decision.
    for (const [route, action] of Object.entries(GOVERNED)) {
      expect(
        FOLDER_ACTIONS.includes(action),
        `${route} names ${action}, which is not in the fixed vocabulary`,
      ).toBe(true)
    }
  })

  test('AC-493 proof 24: no governed action admits a preset below its stated bar', () => {
    /*
    The resolver's own table, read back as a matrix. This does not say whether
    a bar is *right* -- the capability criteria do that against real actors --
    it says the answers are monotonic in the ladder and that the assignment
    clause widens nothing that the bar did not already admit.

    Monotonic means: if a preset may perform an action, every preset above it
    may too. A ladder that failed this would not be a ladder, and a member
    promoted to Full control could find themselves refused something they
    could do before.
    */
    const facts = (access: FolderAccessPreset) => ({
      folderId: '00000000-0000-0000-0000-000000000001',
      actorId: '00000000-0000-0000-0000-000000000002',
      access,
      isOwner: false,
      isDefault: false,
      name: 'ac493',
    })
    for (const action of FOLDER_ACTIONS) {
      const rule = ruleFor(action)
      if (rule.owner === 'required') continue // custody acts; ownership decides
      let seenAllowed = false
      for (const preset of [...FOLDER_ACCESS_PRESETS].reverse()) {
        const allowed = mayPerform(facts(preset), action, {
          authorId: '00000000-0000-0000-0000-000000000002',
        }).allowed
        if (allowed) seenAllowed = true
        expect(
          !(seenAllowed && !allowed),
          `${action} admits ${preset} and refuses a preset above it, which is not a ladder`,
        ).toBe(true)
      }
    }
  })

  test('AC-493 proof 24: the assignment clause never admits a preset the bar already refused for others', () => {
    // The `whenAssignedToActor` escape is a boundary rather than a grant: it
    // may let Can contribute plan *their own* Task, and it must never let a
    // preset act on a Task that is not theirs.
    const stranger = '00000000-0000-0000-0000-000000000009'
    const me = '00000000-0000-0000-0000-000000000002'
    const facts = (access: FolderAccessPreset) => ({
      folderId: '00000000-0000-0000-0000-000000000001',
      actorId: me,
      access,
      isOwner: false,
      isDefault: false,
      name: 'ac493',
    })
    for (const action of FOLDER_ACTIONS) {
      const rule = ruleFor(action)
      if (rule.whenAssignedToActor === undefined) continue
      for (const preset of rule.whenAssignedToActor) {
        expect(
          mayPerform(facts(preset), action, { assigneeId: me }).allowed,
          `${action} must admit ${preset} on a Task assigned to them`,
        ).toBe(true)
        const bar = rule.atLeast
        const byBar = bar !== null && atLeast(preset, bar)
        expect(
          mayPerform(facts(preset), action, { assigneeId: stranger }).allowed,
          `${action} must refuse ${preset} on somebody else's Task unless the bar already admitted them`,
        ).toBe(byBar)
        expect(
          mayPerform(facts(preset), action, { assigneeId: null }).allowed,
          `${action} must refuse ${preset} on an unassigned Task unless the bar already admitted them`,
        ).toBe(byBar)
      }
    }
  })

  test('AC-493 proof 25: the Label actions exist at R8A\'s bars, ahead of #226\'s routes', () => {
    /*
    #228 supersedes #208/#226's interim "all Folder members may manage Folder
    Labels" rule, and #226 is a branch in flight: its twelve routes are not on
    this one. What can be proved today is the contract they will call, and
    the enumeration above is what will refuse them if they arrive without a
    decision.

    R8A, as #228 restates it:
      - Full control and Can edit manage the vocabulary and apply broadly;
      - Can contribute applies and removes only on work they may self-manage;
      - Assigned work, Can comment and Can view may not modify shared Labels.
    */
    const facts = (access: FolderAccessPreset) => ({
      folderId: '00000000-0000-0000-0000-000000000001',
      actorId: '00000000-0000-0000-0000-000000000002',
      access,
      isOwner: false,
      isDefault: false,
      name: 'ac493',
    })
    const mine = { assigneeId: '00000000-0000-0000-0000-000000000002' }

    for (const preset of ['full_control', 'can_edit'] as const) {
      expect(
        mayPerform(facts(preset), 'label.vocabulary.manage').allowed,
        `${preset} manages the shared Label vocabulary (#228, R8A)`,
      ).toBe(true)
      expect(
        mayPerform(facts(preset), 'label.apply').allowed,
        `${preset} applies and removes Folder Labels broadly`,
      ).toBe(true)
    }

    expect(
      mayPerform(facts('can_contribute'), 'label.vocabulary.manage').allowed,
      '#228: Can contribute may not manage the Label vocabulary',
    ).toBe(false)
    expect(
      mayPerform(facts('can_contribute'), 'label.apply', mine).allowed,
      '#228: Can contribute applies existing Folder Labels on work they are authorized to self-manage',
    ).toBe(true)
    expect(
      mayPerform(facts('can_contribute'), 'label.apply').allowed,
      "and not on work that is not theirs",
    ).toBe(false)

    for (const preset of ['assigned_work', 'can_comment', 'can_view'] as const) {
      expect(
        mayPerform(facts(preset), 'label.apply', mine).allowed,
        `#228: ${preset} may not modify shared Folder Labels, even on their own Task`,
      ).toBe(false)
      expect(
        mayPerform(facts(preset), 'label.vocabulary.manage').allowed,
        `#228: nor the vocabulary`,
      ).toBe(false)
    }
  })
})
