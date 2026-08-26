/*
AC-220: given the assignee menu in a multi-member folder, then it lists that
folder's members, Invite by email, and Unassigned last; choosing Unassigned
clears the assignment.

Appended to section 12 by RFC 0005, Accepted 2026-08-24, and transcribed
unchanged. AC-094 is its API-side sibling and stays green through the v1
form; this one addresses the v2 surface and its one addition, the way out:
the v1 dropdown has no Unassigned at all, so a task could take an assignee
and never let one go (the W2 finding, DES-194). Red until S11 lands the v2
assignee menu.

**"Unassigned last" is order, asserted from the option list**, because last
is where DES-194 put it, after a separator, where "New folder…" sits in the
folder menu; a menu listing it first has copied the value and lost the
design's reason.

**The clear is asserted on the stored row**, through the surface and then the
wire: choose a member, then Unassigned, and the task's row shows no assignee
chip where it showed one.

Spec: 9.3 (the assignee chip), 9.1 (the addressing sentence), DES-194,
AC-094 (the API sibling), INV-5.
*/
import { expect, test } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  caseTitle,
  clickControl,
  createTask,
  seedIds,
  seedSubs,
  signIn,
  TEST_TIMEOUT_MS,
  waitForApiIdle,
} from './harness.js'

test.use({ timezoneId: 'UTC', actionTimeout: ACTION_TIMEOUT_MS })
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

test.describe('AC-220: the assignee menu', () => {
  test('AC-220: members, Invite by email, and Unassigned last; Unassigned clears', async ({
    page,
  }) => {
    const title = caseTitle('Assignable errand')
    await signIn(page, seedSubs.hassan)
    await createTask(page, { title, folder_id: seedIds.groceries })
    await page.goto(`/app/folders/${seedIds.groceries}`)

    await clickControl(
      page.getByRole('main').getByText(title).first(),
      'spec 9.3: the row opens its task, whose header strip carries the assignee chip',
    )
    await clickControl(
      page.getByRole('button', { name: /assignee|assign/i }).first(),
      'spec 9.3: the assignee chip opens its picker in place. The v1 form renders a ' +
        'select with no Unassigned, which is the red this shows until S11',
    )

    const options = page.getByRole('menuitem').or(page.getByRole('option'))
    const labels = (await options.allTextContents()).map((text) => text.trim())
    for (const member of ['Hassan', 'Imran']) {
      expect(
        labels.some((label) => label.includes(member)),
        `spec 9.3: the menu lists the folder's members, and ${member} is one of ` +
          `Groceries' two. Read: ${JSON.stringify(labels)}`,
      ).toBe(true)
    }
    expect(
      labels.some((label) => /Invite by email/.test(label)),
      `AC-094's list carries into v2: Invite by email is offered. Read: ${JSON.stringify(labels)}`,
    ).toBe(true)
    expect(
      /Unassigned/.test(labels[labels.length - 1] ?? ''),
      'DES-194: Unassigned sits last, after the members and the invite, which is where ' +
        `the way out lives. Read: ${JSON.stringify(labels)}`,
    ).toBe(true)

    // Assign, then clear, and read the clear off the surface.
    await clickControl(options.filter({ hasText: 'Imran' }).first(), 'assign to the member')
    await waitForApiIdle(page, 'the assignment write lands before the clear is attempted')
    await clickControl(
      page.getByRole('button', { name: /assignee|assign/i }).first(),
      'reopen the menu for the clear',
    )
    await clickControl(
      page
        .getByRole('menuitem', { name: /Unassigned/ })
        .or(page.getByRole('option', { name: /Unassigned/ }))
        .first(),
      'spec 9.3: choosing Unassigned clears the assignment, the control AC-094\'s v1 ' +
        'surface never offered',
    )
    await waitForApiIdle(page, 'the clear write lands before it is read back')
    await expect(
      page.getByRole('button', { name: /Imran/ }),
      'the chip no longer names the member: the assignment is cleared on the row the ' +
        'server holds, not merely in the menu\'s highlight',
    ).toHaveCount(0)
  })
})
