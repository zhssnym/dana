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

**RFC 0005 replaces this criterion and the replacement is not asserted here.**
Its v2 text is "given the assignee control in a multi-member folder, then its
choices are that folder's members, Invite by email, and Unassigned; given a
single-member folder, then the control is hidden and the server still
enforces INV-5." The addition is the way out, which the v1 dropdown has never
had, and AC-220 is the criterion that asserts it against the v2 assignee menu
S11 lands. That split is S1's ruling and is recorded in AC-220's own file:
this number stays on the v1 form until the v2 surface exists, so that the two
never assert the same control in two states of the port at once.

**Reworked onto the v2 surfaces on 2026-08-24 (RFC 0005).** Every case
opened the form from the floating add button, on /app/tasks or on the folder
page, and 9.1's v2 capture rule leaves it on neither: the button appears only
on Today, Important and Assignments, every other page having a capture point
of its own. So the form opens from Today, which is where that rule now puts
the button, and the multi-member arms reach their folder by selecting it.
Selecting is what this criterion says in its own words, "given a
single-member folder selected", and 9.3's behavior rule is that folder
selection re-filters the dropdown, so the two arms are the same act at two
values rather than two entry points.

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

Spec: 9.3 (the dependency table's assignee row, its two words, and the
re-filtering behavior rule), 9.1 (the v2 capture rule and the v2 routes
table), INV-5, 7.5 and 8.7 (the bare invite and its acceptance), 7.4,
AC-220 (the v2 surface and the Unassigned entry).
*/
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  chooseOption,
  clickControl,
  csrfToken,
  fieldDisplay,
  floatingAddButton,
  formField,
  optionLabels,
  routesV2,
  seedSubs,
  signIn,
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
 * The 9.3 form, opened from Today with its seven expandable fields showing.
 *
 * Today rather than any other page because 9.1's v2 capture rule leaves the
 * floating add button on three pages and this is the first of them; its
 * entry default is the account's own default folder, which 4.3 gives exactly
 * one member, so the form opens in the state the first arm below is about.
 */
async function openForm(page: Page): Promise<void> {
  await page.goto(routesV2.today)
  await clickControl(
    floatingAddButton(page),
    'spec 9.1: the floating add button opens the task form with the entry-point defaults of ' +
      '9.3, and Today is one of the three pages that section leaves it on',
  )
  await clickControl(
    page.getByRole('button', { name: 'More options' }),
    "spec 9.3: seven of the form's ten fields sit behind one expander, and the section names " +
      'it "More options"',
  )
}

test.beforeEach(async ({ page }) => {
  await signIn(page, seedSubs.hassan)
})

test.describe('AC-094: the assignee field follows the folder', () => {
  test('AC-094: a single-member folder renders no assignee field at all', async ({
    page,
  }) => {
    await openForm(page)

    // The form opened from Today defaults to the account's default folder
    // (9.3's entry table), which is 4.3's Desk and has one member by
    // construction: defaults are never shared, which is the INV-5 case the
    // hidden field exists for. The seeded row is still named Inbox, the
    // Desk rename reaching only defaults that carried that name at the
    // migration.
    expect(
      await fieldDisplay(formField(page, 'folder')),
      "spec 9.3 entry-point defaults: the form opened from Today starts in the viewer's " +
        'default folder',
    ).toContain('Inbox')

    await expect(
      formField(page, 'assignee'),
      'spec 9.3: the assignee row of the dependency table is hidden in single-member ' +
        'folders, and that table defines hidden as absent, not as visible and inoperable',
    ).toHaveCount(0)
  })

  test('AC-094: a multi-member folder lists exactly its members plus the invite option', async ({
    page,
  }) => {
    await openForm(page)
    await chooseOption(page, formField(page, 'folder'), 'Groceries')

    const assignee = formField(page, 'assignee')
    await expect(
      assignee,
      'spec 9.3: the assignee field is visible when the target folder has two or more ' +
        'members, and the seeded shared folder has two',
    ).toBeVisible()

    const labels = await optionLabels(page, assignee)
    expect(
      labels.length,
      `spec 9.3: the dropdown lists that folder's members plus "Invite by email", which is ` +
        `three entries for a two-member folder; it offered ${JSON.stringify(labels)}. The ` +
        'fourth entry RFC 0005 adds, "Unassigned", is AC-220 and arrives with the v2 menu',
    ).toBe(3)
    expect(
      labels.filter((label) => label.includes('Hassan')).length,
      'the folder owner is a member and so is in the dropdown',
    ).toBe(1)
    expect(
      labels.filter((label) => label.includes('Imran')).length,
      'the second member is in the dropdown',
    ).toBe(1)
    expect(
      labels,
      'spec 9.3: the dropdown carries "Invite by email", which opens the sharing flow with ' +
        'this folder attached',
    ).toContain('Invite by email')
  })

  test('AC-094: the field appears and disappears with the folder selected', async ({
    page,
  }) => {
    await openForm(page)

    await expect(
      formField(page, 'assignee'),
      'the form starts in the default folder, where the field is absent',
    ).toHaveCount(0)

    // 9.3's behavior rule: folder selection re-filters the assignee
    // dropdown. The same open form, no reopen.
    const folder = formField(page, 'folder')
    await chooseOption(page, folder, 'Groceries')
    await expect(
      formField(page, 'assignee'),
      'spec 9.3: selecting a folder with two or more members makes the assignee field ' +
        'visible in the form already open, rather than at the next open',
    ).toBeVisible()

    await chooseOption(page, folder, 'Inbox')
    await expect(
      formField(page, 'assignee'),
      'spec 9.3: selecting back to a single-member folder hides the field again. An ' +
        'implementation deciding once when the form opens satisfies the criterion read as ' +
        'two scenarios and fails this one',
    ).toHaveCount(0)
  })

  test('AC-094: a connection who is not a member is not in the dropdown', async ({
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

    await openForm(page)
    await chooseOption(page, formField(page, 'folder'), 'Groceries')

    const labels = await optionLabels(page, formField(page, 'assignee'))
    expect(
      labels.filter((label) => label.includes(THIRD_NAME)).length,
      "spec 9.3: the dropdown lists that folder's members, and 8.7 grants a bare invite a " +
        'connection and no membership, so a roster entry who is in no folder is not offered ' +
        `as an assignee. The dropdown offered ${JSON.stringify(labels)}`,
    ).toBe(0)
    expect(
      labels.length,
      'spec 9.3: still the two members plus the invite option, the roster having grown by one',
    ).toBe(3)
  })
})
