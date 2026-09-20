/*
AC-573: the member-details projection carries the current Responsibility and
its metadata in a **constant** number of statements however many members it is
asked about; and the history record identifies actor, subject and change
structurally, so nothing has to read a sentence to know what happened.

Issue #230 required proofs 22 and 23. Product authority: #230 "Member-details
backend contract" and "History presentation contract", #209 R9A.

## Proof 22 is about a number, so it counts

"Without N+1 behavior" is not something a response shape can demonstrate: a
projection that ran one query per member would answer identically and cost
twenty-six round trips on a full folder. So the domain function is driven
through an executor that counts the statements it is handed, with one member
and then with six, and the two counts must be equal. That is the assertion,
and it is why `memberDetailsOf` takes a list where the route passes one id.

## Proof 23 is about not needing the prose

#230 wants History to render `Sarah updated Omar's Responsibilities` and
`Ahmed's Responsibilities ended when membership ended`. The trap is to store
that sentence and call it the record. R9A's governing principle is the
opposite: "Feature issues own the truth of their history records. The History
feature owns how users explore that truth."

So the criterion **builds those sentences from the structured record alone** --
actor, subject, transition -- and never from the `detail` text the generic
events table also carries. If the structured fields were insufficient, the
sentences could not be built and this fails. The generic event line is checked
to *exist* beside them, because it is the navigation record R10 describes, and
checked to be exactly not the authority: the criterion never reads it.

## The viewer-dependent flags

Two members see different answers for "may I change this", and the projection
says so. What it must never do is *authorize*: R8A forbids a projection that
decides. The case therefore checks both that the flags track the viewer and
that a viewer whose flag is false is still refused at the route -- because the
flag being right is not what makes the refusal happen.

Spec: 7.4; #209 R9A, R10; #230.
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { sharedFolder, taskIn } from '../support/folder-access-harness.js'
import {
  Cast,
  expectStatus,
  removeMember,
} from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import {
  commitOk,
  paragraph,
  putResponsibility,
  readMemberDetails,
  recordOf,
  setSelfEditGrantOk,
  standingOf,
} from '../support/responsibility-harness.js'
import { memberDetailsOf } from '../../src/server/domain/responsibility.js'
import { rows } from '../support/helpers.js'
import type { Executor } from '../../src/server/database.js'
import type { FolderMemberDetails } from '../../src/shared/responsibility.js'

let app: AuthTestApp
const cast = new Cast(
  ['owner', 'deputy', 'subject', 'extra1', 'extra2', 'extra3'],
  'ac573',
)

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-573 the member-details projection and the history contract', () => {
  test('AC-573 proof 22: the projection carries the current Responsibility and its metadata', async () => {
    const [owner, deputy, subject] = (await cast.of(app)) as Actor[] as [
      Actor,
      Actor,
      Actor,
    ]
    const folderId = await sharedFolder(app, owner, 'AC-573 projection', [
      [deputy, 'full_control'],
      [subject, 'assigned_work'],
    ])
    await setSelfEditGrantOk(owner, folderId, subject.id, true)
    await commitOk(
      deputy,
      folderId,
      subject.id,
      paragraph('Runs the delivery round'),
    )
    await taskIn(owner, folderId, 'AC-573 assigned open task', subject.id)
    await taskIn(owner, folderId, 'AC-573 a task for somebody else', owner.id)

    const response = await readMemberDetails(owner, folderId, subject.id)
    expectStatus(
      response,
      200,
      '#230: one canonical Folder-contextual member read, sufficient for the later UI',
    )
    const details = response.json() as FolderMemberDetails

    expect(details.user.id, 'identity').toBe(subject.id)
    expect(details.is_owner, 'the owner marker').toBe(false)
    expect(
      Number.isFinite(Date.parse(details.joined_at)),
      'and the effective membership time',
    ).toBe(true)
    expect(details.access, "the member's current Access preset (#228)").toBe(
      'assigned_work',
    )
    expect(
      details.can_edit_own_responsibilities,
      "and the self-edit grant, which is part of reading the roster",
    ).toBe(true)
    expect(
      details.responsibility.content,
      'the current rich document',
    ).toEqual(paragraph('Runs the delivery round'))
    expect(details.responsibility.revision_no).toBe(1)
    expect(
      details.responsibility.current_revision_id,
      'the current revision id, so a panel can name the version it is showing',
    ).not.toBeNull()
    expect(
      details.responsibility.updated_at,
      'the last updated time',
    ).not.toBeNull()
    expect(
      details.responsibility.updated_by?.id,
      'and the last updating actor',
    ).toBe(deputy.id)
    expect(
      details.assigned_open_task_count,
      '#230: current work is informational only -- a count of Tasks currently assigned to this member in this Folder, and not Responsibility truth',
    ).toBe(1)
    expect(
      details.history.responsibility_path,
      "R9A's lightweight affordance: a route to retrieve the history rather than a payload the panel has to be told how to build",
    ).toBe(`/folders/${folderId}/members/${subject.id}/responsibility/history`)
    expect(details.history.access_path).toBe(
      `/folders/${folderId}/members/${subject.id}/access-history`,
    )
  })

  test('AC-573 proof 22: the statement count does not move with the number of members', async () => {
    const actors = (await cast.of(app)) as Actor[]
    const [owner, ...rest] = actors as [Actor, ...Actor[]]
    const folderId = await sharedFolder(
      app,
      owner,
      'AC-573 no n plus one',
      rest.map((member) => [member, 'can_edit'] as const),
    )
    for (const member of rest) {
      await commitOk(
        owner,
        folderId,
        member.id,
        paragraph(`Scope of ${member.id}`),
      )
      await taskIn(owner, folderId, `AC-573 task for ${member.id}`, member.id)
    }

    /* An executor that forwards every statement and counts it. The domain
       function is driven directly rather than through HTTP, because the
       question is about statements and HTTP would add the session read and
       the access resolution to every measurement equally. */
    const counting = (): { executor: Executor; count: () => number } => {
      let n = 0
      const executor: Executor = {
        execute: async (statement) => {
          n += 1
          return app.db.execute(statement)
        },
      }
      return { executor, count: () => n }
    }

    const one = counting()
    await memberDetailsOf(one.executor, folderId, [owner.id])
    const many = counting()
    const all = await memberDetailsOf(
      many.executor,
      folderId,
      actors.map((actor) => actor.id),
    )

    expect(
      all.size,
      'six members came back, so the comparison is between two real answers',
    ).toBe(actors.length)
    expect(
      many.count(),
      `#230 proof 22: the projection must not become one query per member. One member cost ${String(one.count())} statements and ${String(actors.length)} members cost ${String(many.count())}; an N+1 shape would make the second roughly ${String(actors.length)} times the first`,
    ).toBe(one.count())
    expect(
      one.count(),
      'and the constant is small enough to say out loud: the membership rows, the assigned-task counts, and the batched Responsibility read',
    ).toBe(3)

    const mine = all.get(rest[0]!.id)
    expect(
      mine?.responsibility.content,
      'and the batched read still gives each member their own document rather than one document to all of them',
    ).toEqual(paragraph(`Scope of ${rest[0]!.id}`))
  })

  test('AC-573 proof 23: History can name actor, subject and change from the record alone', async () => {
    const [owner, deputy, subject] = (await cast.of(app)) as Actor[] as [
      Actor,
      Actor,
      Actor,
    ]
    const folderId = await sharedFolder(app, owner, 'AC-573 history', [
      [deputy, 'full_control'],
      [subject, 'can_view'],
    ])
    await setSelfEditGrantOk(deputy, folderId, subject.id, true)
    await commitOk(deputy, folderId, subject.id, paragraph('Their first scope'))
    await commitOk(subject, folderId, subject.id, paragraph('Their own edit'))
    await removeMember(owner, folderId, subject.id)

    const names = new Map<string, string>([
      [owner.id, 'Owner'],
      [deputy.id, 'Sarah'],
      [subject.id, 'Omar'],
    ])

    /* The sentences #230 asks History to render, built from the structured
       record and from nothing else. `detail` on the generic events row is
       never read here, which is the point: R9A gives the truth to this issue
       and the exploration of it to the History product, and a renderer that
       had to parse prose would make the prose the authority. */
    const render = (entry: {
      transition: string
      actor_id: string
      member_id: string
    }): string => {
      const actor = names.get(entry.actor_id) ?? 'somebody'
      const member = names.get(entry.member_id) ?? 'somebody'
      const theirs =
        entry.actor_id === entry.member_id ? 'their own' : `${member}'s`
      switch (entry.transition) {
        case 'responsibility_created':
          return `${actor} wrote ${theirs} Responsibilities`
        case 'responsibility_updated':
          return `${actor} updated ${theirs} Responsibilities`
        case 'responsibility_ended':
          return `${member}'s Responsibilities ended when membership ended`
        case 'self_edit_granted':
          return `${actor} enabled ${member} to edit their own Responsibilities`
        default:
          return `${actor} stopped ${member} editing their own Responsibilities`
      }
    }

    const entries = await recordOf(app.db, folderId, subject.id)
    expect(
      entries.map(render),
      '#230 proof 23: the structured record is sufficient to identify actor, subject and change, so the generic text is never the authority',
    ).toEqual([
      'Sarah enabled Omar to edit their own Responsibilities',
      "Sarah wrote Omar's Responsibilities",
      'Omar updated their own Responsibilities',
      "Omar's Responsibilities ended when membership ended",
    ])

    /* And the generic Folder History line exists beside them, which R10 calls
       "the navigation/presentation record". It is counted rather than read:
       a renderer that needed its words would be the thing R9A forbids. */
    const generic = await rows(
      app.db,
      sql`SELECT detail FROM events
           WHERE folder_id = ${folderId}::uuid
             AND detail LIKE '%Responsibilities%'`,
    )
    expect(
      generic.length,
      'the ordinary Folder History carries an entry for each consequential change, for navigation',
    ).toBeGreaterThanOrEqual(3)
  })

  test('AC-573 proof 23: the viewer-dependent flags track the viewer and authorize nothing', async () => {
    const [owner, deputy, subject] = (await cast.of(app)) as Actor[] as [
      Actor,
      Actor,
      Actor,
    ]
    const folderId = await sharedFolder(app, owner, 'AC-573 flags', [
      [deputy, 'can_edit'],
      [subject, 'can_view'],
    ])

    const asAdmin = (
      await readMemberDetails(owner, folderId, subject.id)
    ).json() as FolderMemberDetails
    expect(
      asAdmin.viewer_may_change_access,
      'Full control may change a non-owner member\'s Access, so the control is worth rendering',
    ).toBe(true)
    expect(asAdmin.viewer_may_change_self_edit_grant).toBe(true)
    expect(asAdmin.viewer_may_edit_responsibility).toBe(true)

    const asPeer = (
      await readMemberDetails(deputy, folderId, subject.id)
    ).json() as FolderMemberDetails
    expect(
      asPeer.viewer_may_change_access,
      'Can edit administers nobody, and the projection says so rather than pretending everyone sees the same screen',
    ).toBe(false)
    expect(asPeer.viewer_may_change_self_edit_grant).toBe(false)
    expect(asPeer.viewer_may_edit_responsibility).toBe(false)

    /* And the flag is not what refuses: R8A's "projections never authorize".
       The peer is refused at the route, which asks the resolver again. */
    const base = (await standingOf(deputy, folderId, subject.id)).revision
    expectStatus(
      await putResponsibility(
        deputy,
        folderId,
        subject.id,
        paragraph('Written by a peer whose flag said no'),
        base,
      ),
      403,
      'the refusal comes from the route asking the resolver, not from the flag the projection computed',
    )

    const onOwner = (
      await readMemberDetails(deputy, folderId, owner.id)
    ).json() as FolderMemberDetails
    expect(
      onOwner.is_owner,
      'the owner is marked as such',
    ).toBe(true)
    expect(
      onOwner.viewer_may_change_access,
      "R7 section M: nobody administers the owner's standing, so the control is never offered for them",
    ).toBe(false)
    expect(onOwner.viewer_may_change_self_edit_grant).toBe(false)
  })
})
