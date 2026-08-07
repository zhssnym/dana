/*
AC-048: given an unassigned task due today in a multi-member folder, then it
is in no one's My Day and carries the unassigned chip in Planned.

The folder must have more than one member for this row to exist at all.
INV-5 forces the assignee in a folder with exactly one member, so an
unassigned task is only possible where there are two, and the criterion's
"multi-member" is a precondition of its own fixture rather than an incidental
detail.

"In no one's My Day" is the clause with teeth. Q1's automatic clause is
conjunctive on assignee_id = V, so a null assignee satisfies it for nobody: a
due date alone never puts a task on a page. The failure mode this catches is
an implementation reading the clause as "due today and (assigned to me or
unassigned)", which is a plausible product instinct and a specification
violation, and it would put this row on every member's page at once.

The chip is section 9's and arrives with P8. Its server half, and this
package's whole share of the clause, is the pair of facts the chip is drawn
from: the Planned row's assignee is null, and the folder has more than one
member. The second is read from the merged 7.4 surface, since 7.0's TaskCard
carries no member count and the client already holds the Folder object.

Spec: 6 Q1 (the conjunctive automatic clause), 6 Q3 (the unassigned
adornment), INV-5, 8.2, 7.4, 7.10.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast, expectStatus } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import {
  expectTaskInvariants,
  pullIntoMyDay,
} from './tasks-harness.js'
import {
  requireCard,
  expectStillSameDay,
  idsOf,
  middayZone,
  myDay,
  planned,
  seedViewTask,
  sharedFolder,
  todayIn,
} from './views-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'member'], 'p4')

const tz = middayZone()

interface Stage {
  owner: Actor
  member: Actor
  folderId: string
  today: string
  unassigned: string
  assigned: string
}
let staged: Stage | undefined

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const [owner, member] = await cast.of(app)
    if (owner === undefined || member === undefined) {
      throw new Error('cast must produce two actors')
    }
    const folderId = await sharedFolder(
      app.db,
      owner,
      member,
      'p4 ac048 shared',
    )
    const today = todayIn(tz)

    const unassigned = await seedViewTask(app.db, {
      folderId,
      createdBy: owner.id,
      assigneeId: null,
      title: 'p4 ac048 unassigned due today',
      dueDate: today,
    })
    // The control: same folder, same date, one assignee. If the unassigned
    // row appeared on a page, this one proves the page was reachable at all.
    const assigned = await seedViewTask(app.db, {
      folderId,
      createdBy: owner.id,
      assigneeId: member.id,
      title: 'p4 ac048 assigned due today',
      dueDate: today,
    })

    staged = { owner, member, folderId, today, unassigned, assigned }
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

describe('AC-048: an unassigned dated task belongs to no one\'s day', () => {
  test('AC-048: it is in neither member\'s My Day', async () => {
    const { owner, member, today, unassigned } = await stage()
    for (const [who, actor] of [
      ['the owner', owner],
      ['the other member', member],
    ] as const) {
      const body = await myDay(actor, tz)
      expectStillSameDay(tz, today, 'AC-048')
      expect(
        [...idsOf(body.today), ...idsOf(body.carried), ...idsOf(body.recap)],
        `${who}: Q1's automatic clause is conjunctive on assignee_id = V, so a null assignee satisfies it for nobody. A due date alone never puts a task on a page, and reading the clause as "due today and unassigned or mine" would put this row on every member's page at once`,
      ).not.toContain(unassigned)
    }
  })

  test('AC-048: the assigned control row does reach its assignee\'s page', async () => {
    const { member, today, assigned } = await stage()
    const body = await myDay(member, tz)
    expectStillSameDay(tz, today, 'AC-048')
    expect(
      idsOf(body.today),
      'without this the case above would pass against an implementation whose My Day is empty for every reason',
    ).toContain(assigned)
  })

  test('AC-048: it is in Planned for both members, with a null assignee', async () => {
    const { owner, member, unassigned } = await stage()
    for (const [who, actor] of [
      ['the owner', owner],
      ['the other member', member],
    ] as const) {
      const body = await planned(actor, tz)
      const card = requireCard(
        body.rows,
        unassigned,
        `${who}: Q3's predicate is the folder scope plus a non-null due_date and an open status, none of which mentions the assignee`,
      )
      expect(
        card.assignee,
        `${who}: the unassigned chip of Q3 is drawn from a null assignee, and the chip itself is section 9's rendering, pinned at P8`,
      ).toBeNull()
    }
  })

  test('AC-048: the folder has more than one member, the chip\'s other condition', async () => {
    const { owner, folderId } = await stage()
    const response = await owner.browser.api(`/folders/${folderId}`)
    expectStatus(
      response,
      200,
      'GET /folders/:id must answer the folder detail to a member (spec 7.4; P2 is merged)',
    )
    const body = response.json() as { member_count?: unknown }
    expect(
      body.member_count,
      'Q3 shows the unassigned chip only where the folder has more than one member, and 7.0 puts that count on the Folder object rather than on the card, so a client draws the chip from the two together',
    ).toBe(2)
  })

  test('AC-048 adversarial: a pull puts it on the puller\'s page and no one else\'s', async () => {
    const { owner, member, today, unassigned } = await stage()
    const response = await pullIntoMyDay(owner, unassigned)
    expectStatus(
      response,
      200,
      'the entry clause of Q1 has no assignee condition, so pulling an unassigned task is legal (spec 7.8)',
    )

    const mine = await myDay(owner, tz)
    expectStillSameDay(tz, today, 'AC-048')
    expect(
      idsOf(mine.today),
      'the row reaches a page the only way it can, by someone deciding to take it',
    ).toContain(unassigned)

    const theirs = await myDay(member, tz)
    expect(
      [...idsOf(theirs.today), ...idsOf(theirs.carried)],
      'and the other member\'s page is untouched: the decision was one person\'s',
    ).not.toContain(unassigned)
  })

  test('AC-048: the fixture satisfies section 3', async () => {
    const { owner, member, folderId, unassigned, assigned } = await stage()
    await expectTaskInvariants(
      app.db,
      [unassigned, assigned],
      [folderId],
      [owner.id, member.id],
    )
  })
})
