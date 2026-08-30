/*
AC-094: given a single-member folder selected, then no assignee field
renders; given a multi-member folder, then the dropdown lists exactly its
members plus the invite option.

Two halves that fail in opposite directions, which is why 9.3 states them as
one row of its dependency table. The first is an absence and the section is
precise about which kind: that table opens by defining its two words,
"disabled means visible but inoperable with helper text; hidden means
absent", and the assignee row says hidden. A greyed-out assignee field in a
single-member folder is the wrong state, not a softer version of the right
one, and it is what an implementation reaches for when it treats every
dependent field alike.

**RFC 0005 replaces this criterion and this file now asserts the
replacement.** Its v2 text is "given the assignee control in a multi-member
folder, then its choices are that folder's members, Invite by email, and
Unassigned; given a single-member folder, then the control is hidden and the
server still enforces INV-5." The addition is the way out, which the v1
dropdown never had.

S1 split the two halves deliberately and the split has now expired. Its
ruling, recorded in AC-220's own file, was that this number stayed on the v1
form until the v2 surface existed, "so that the two never assert the same
control in two states of the port at once". S11 built the surface and S15
retires the v1 control under it, so there is only one state left and only one
control to assert against; keeping the split would leave this criterion
addressing a field that is gone. **The two numbers stay distinct and read
different sentences**: AC-220 reads the order and the clearing, "Unassigned
last" and what choosing it writes, and this one reads the membership rule,
which entries the list is derived from and the folder in which the control is
absent altogether.

**Reworked onto the v2 surfaces on 2026-08-24 (RFC 0005), and onto 9.3's v2
card at S15 (items 15 and 19).** The first rework moved where the form was
opened from: every case had used the floating add button on /app/tasks or on
the folder page, and 9.1's v2 capture rule leaves it on neither, the button
appearing only on Today, Important and Assignments. The capture point is
still Today, and the multi-member arms still reach their folder by selecting
it. Selecting is what this criterion says in its own words, "given a
single-member folder selected", and the behaviour rule is that folder
selection re-filters the assignee choices, so the two arms are the same act
at two values rather than two entry points.

The second rework moved the controls: the folder and the assignee are chips
on 9.3's header strip, each opening its picker in place, and the expander
that used to stand between the form and them is gone.

**The field follows the selected folder, not the page it was opened from.**
The visibility is a property of the current selection inside one open form.
Both directions are asserted in one form instance: single to multi and multi
back to single. An implementation deciding once at open passes the criterion
read as two separate scenarios and fails here.

**"Exactly its members" needs a third person to mean anything.** The seeded
roster and the seeded shared folder hold the same two people, so a dropdown
listing the folder's members and a dropdown listing everyone the viewer is
connected to are indistinguishable against the seed alone, and the wrong one
is the easy one to write: the roster is one request where members are per
folder. So this spec makes a third account through the development login,
connects it to the viewer with a bare invite accepted through 7.5, and
leaves it out of the folder. The dropdown that lists it is listing the
roster.

That third account and its connection outlive this spec, the seeded database
being shared by every spec in this leg. Both are named for this file, and
nothing else here reads a roster.

Spec: 9.3 (the v2 assignee row, "the target folder's members plus 'Invite
by email', and, new in v2, 'Unassigned', offered last after a separator;
hidden in single-member folders (INV-5)", and the v2 header strip), 9.1 (the
v2 capture rule and the v2 routes table), INV-5, 7.5 and 8.7 (the bare invite
and its acceptance), 7.4, AC-220 (the order and what choosing the way out
writes).
*/
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  chipChoices,
  chipOptions,
  chipValue,
  clickControl,
  closeChipPicker,
  csrfToken,
  floatingAddButton,
  routesV2,
  seedSubs,
  signIn,
  taskChip,
  taskSurface,
  TEST_TIMEOUT_MS,
} from './harness.js'

test.use({ timezoneId: 'UTC', actionTimeout: ACTION_TIMEOUT_MS })
// Raised from Playwright's 30 second default so a red names its assertion
// rather than the clock, for the reason recorded at TEST_TIMEOUT_MS.
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

const THIRD_SUB = 'ac-094-connected-non-member'
const THIRD_EMAIL = `${THIRD_SUB}@dev.local`
const THIRD_NAME = 'Ac094 Connected Nonmember'

/**
 * Captures a task from Today and leaves 9.3's card open on it.
 *
 * Today rather than any other page because 9.1's v2 capture rule leaves the
 * floating add button on three pages and this is the first of them; its
 * entry default is the account's own default folder, which 4.3 gives exactly
 * one member, so the card opens in the state the first arm below is about.
 */
async function openTheCard(page: Page): Promise<void> {
  await page.goto(routesV2.today)
  await clickControl(
    floatingAddButton(page),
    'spec 9.1: the floating add button is a capture point and "every capture creates the ' +
      'task with the entry defaults of 9.3 for where it stands", and Today is one of the ' +
      'three pages that section leaves it on',
  )
  await expect(
    taskSurface(page),
    "spec 9.1's v2 roles table: the captured task opens on its surface, a dialog when opened " +
      'as one',
  ).toBeVisible()
}

/** Answers the folder chip with a named folder, through its picker. */
async function chooseFolder(page: Page, folder: string): Promise<void> {
  await clickControl(
    taskChip(page, 'folder'),
    'spec 9.3: the folder is a chip on the header strip, opening its picker in place',
  )
  await clickControl(
    chipChoices(page).filter({ hasText: folder }).first(),
    `spec 9.3: the folder picker offers the real folder library, and ${folder} is in it`,
  )
}

test.beforeEach(async ({ page }) => {
  await signIn(page, seedSubs.hassan)
})

test.describe('AC-094: the assignee chip follows the folder', () => {
  test('AC-094: a single-member folder renders no assignee chip at all', async ({ page }) => {
    await openTheCard(page)

    // The task captured on Today lands in the account's default folder
    // (9.3's entry table), which is 4.3's Desk and has one member by
    // construction: defaults are never shared, which is the INV-5 case the
    // hidden control exists for. The seeded row is still named Inbox, the
    // Desk rename reaching only defaults that carried that name at the
    // migration.
    expect(
      await chipValue(taskChip(page, 'folder'), 'folder'),
      "spec 9.3 entry-point defaults: a task captured on Today lands in the viewer's default " +
        'folder, and the strip reads it back',
    ).toContain('Inbox')

    await expect(
      taskChip(page, 'assignee'),
      'spec 9.3: the assignee is "hidden in single-member folders (INV-5)", and the v1 ' +
        "table's own definition of hidden, which v2 does not restate and does not revoke, is " +
        'absent rather than visible and inoperable. A greyed chip is the wrong state, not a ' +
        'softer version of the right one',
    ).toHaveCount(0)
  })

  test('AC-094: a multi-member folder offers exactly its members, the invite, and the way out', async ({
    page,
  }) => {
    await openTheCard(page)
    await chooseFolder(page, 'Groceries')

    await expect(
      taskChip(page, 'assignee'),
      'spec 9.3: the assignee control is on the strip when the target folder has two or more ' +
        'members, and the seeded shared folder has two',
    ).toBeVisible()

    const labels = await chipOptions(
      page,
      'assignee',
      'spec 9.3: the assignee chip opens its picker in place',
    )
    expect(
      labels.length,
      `spec 9.3's v2 assignee row: the choices are that folder's members, "Invite by email", ` +
        `and "Unassigned", which is four entries for a two-member folder; it offered ` +
        `${JSON.stringify(labels)}`,
    ).toBe(4)
    expect(
      labels.filter((label) => label.includes('Hassan')).length,
      'the folder owner is a member and so is among the choices',
    ).toBe(1)
    expect(
      labels.filter((label) => label.includes('Imran')).length,
      'the second member is among the choices',
    ).toBe(1)
    expect(
      labels,
      'spec 9.3: the choices carry "Invite by email", which opens the sharing flow with ' +
        'this folder attached',
    ).toContain('Invite by email')
    expect(
      labels,
      'spec 9.3, new in v2 and closing section 13 item 28: "Unassigned" is offered. Its ' +
        'position is AC-220\'s sentence; that it is offered at all is this one\'s, because ' +
        'the count above is what a client still rendering the v1 closed list fails',
    ).toContain('Unassigned')
    await closeChipPicker(page)
  })

  test('AC-094: the chip appears and disappears with the folder chosen', async ({ page }) => {
    await openTheCard(page)

    await expect(
      taskChip(page, 'assignee'),
      'the captured task starts in the default folder, where the control is absent',
    ).toHaveCount(0)

    // 9.3's behaviour: choosing a folder re-filters the assignee choices, and
    // the control's presence follows the folder's membership. The same open
    // card, no reopen.
    await chooseFolder(page, 'Groceries')
    await expect(
      taskChip(page, 'assignee'),
      'spec 9.3: choosing a folder with two or more members puts the assignee chip on the ' +
        'strip already open, rather than at the next open',
    ).toBeVisible()

    await chooseFolder(page, 'Inbox')
    await expect(
      taskChip(page, 'assignee'),
      'spec 9.3: choosing back to a single-member folder hides it again. A client deciding ' +
        'once when the surface opens satisfies the criterion read as two scenarios and fails ' +
        'this one',
    ).toHaveCount(0)
  })

  test('AC-094: a connection who is not a member is not among the choices', async ({
    page,
    browser,
  }) => {
    // A third account, connected to the viewer and in none of their folders.
    // Without it the seeded roster and the seeded folder hold the same two
    // people and this criterion cannot tell a members query from a roster
    // query, which is the wrong implementation and also the shorter one.
    const token = await csrfToken(page.context())
    const invited = await page.request.post('/api/v1/invites', {
      data: { email: THIRD_EMAIL },
      headers: { 'X-CSRF-Token': token },
    })
    expect(
      invited.status(),
      `POST /invites for the bare invite answered ${invited.status()}: ${await invited.text()}`,
    ).toBe(201)
    const { invite } = (await invited.json()) as { invite: { id: string } }

    const otherContext = await browser.newContext()
    const otherPage = await otherContext.newPage()
    await signIn(otherPage, THIRD_SUB, THIRD_NAME)
    const otherToken = await csrfToken(otherContext)
    const accepted = await otherPage.request.post(`/api/v1/invites/${invite.id}/accept`, {
      headers: { 'X-CSRF-Token': otherToken },
    })
    expect(
      accepted.status(),
      `POST /invites/${invite.id}/accept answered ${accepted.status()}: ${await accepted.text()}`,
    ).toBe(200)
    await otherContext.close()

    await openTheCard(page)
    await chooseFolder(page, 'Groceries')

    const labels = await chipOptions(
      page,
      'assignee',
      'spec 9.3: the assignee chip opens its picker in place',
    )
    expect(
      labels.filter((label) => label.includes(THIRD_NAME)).length,
      "spec 9.3: the choices are that folder's members, and 8.7 grants a bare invite a " +
        'connection and no membership, so a roster entry who is in no folder is not offered ' +
        `as an assignee. The picker offered ${JSON.stringify(labels)}`,
    ).toBe(0)
    expect(
      labels.length,
      'spec 9.3: still the two members plus the invite and the way out, the roster having ' +
        'grown by one',
    ).toBe(4)
    await closeChipPicker(page)
  })
})
