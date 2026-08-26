/*
AC-218: given unread notifications, then the bell's accessible name carries
the count; pressing a row opens its subject and marks it read; Mark all read
zeroes the badge.

Appended to section 12 by RFC 0005, Accepted 2026-08-24, and transcribed
unchanged. The server half is AC-187/AC-188, green since S3; this is the 9.12
surface, red until S12 builds the bell from its DES-226 drawing.

**The unread rows are minted through section 7**, the way every fixture in
this leg is made: the other account assigns tasks to the viewer, which is
4.14's assignment trigger, so the bell has something true to say. Two
notifications rather than one, so "pressing a row marks it read" can be told
apart from "pressing a row marks everything read": the count must fall by
exactly one.

**The name is the badge said aloud.** 9.1's names table: "Notifications",
suffixed ", N unread" while any are. The count in the name is the assertion,
a visual badge with an unlabelled button being exactly what the row exists
to forbid.

Spec: 9.1 (the names table's bell row and "Mark all read"), 9.12 (the
surface), 4.14 (the assignment trigger), AC-187/AC-188 (the server half).
*/
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  caseTitle,
  clickControl,
  createTask,
  patchTask,
  routesV2,
  seedIds,
  seedSubs,
  signIn,
  TEST_TIMEOUT_MS,
} from './harness.js'

test.use({ timezoneId: 'UTC', actionTimeout: ACTION_TIMEOUT_MS })
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

/**
 * Hassan assigns two fresh Groceries tasks to Imran, in Hassan's own
 * context, so Imran's bell holds exactly two unread rows this case minted.
 * The titles are case-unique per the harness rule, and no seed row moves.
 */
async function mintTwoAssignments(browserPage: Page, titles: [string, string]): Promise<void> {
  const context = await browserPage.context().browser()?.newContext()
  if (context === undefined) throw new Error('a second context is how the other account acts')
  const actor = await context.newPage()
  await signIn(actor, seedSubs.hassan)
  for (const title of titles) {
    const { id } = await createTask(actor, { title, folder_id: seedIds.groceries })
    await patchTask(actor, id, { assignee_id: seedIds.imran })
  }
  await context.close()
}

test.describe('AC-218: the notifications bell', () => {
  test('AC-218: the name carries the count, a row opens and reads, Mark all read zeroes', async ({
    page,
  }) => {
    const first = caseTitle('Bell first errand')
    const second = caseTitle('Bell second errand')
    await signIn(page, seedSubs.imran)
    await mintTwoAssignments(page, [first, second])
    await page.goto(routesV2.desk)

    const bellWith = (count: number) =>
      page.getByRole('button', { name: `Notifications, ${count} unread`, exact: true })

    await expect(
      bellWith(2),
      'spec 9.1\'s names table: the bell is "Notifications", suffixed ", N unread" while ' +
        'any are, the badge said aloud. Two rows were just minted through 4.14\'s ' +
        'assignment trigger. The v1 client has no bell, which is the red this shows ' +
        'until S12',
    ).toBeVisible()

    await clickControl(bellWith(2), 'the bell opens its surface (9.12)')
    await clickControl(
      page.getByRole('button', { name: new RegExp(first) }).or(
        page.getByRole('link', { name: new RegExp(first) }),
      ),
      'spec 9.12: pressing a row opens its subject',
    )
    await expect(
      page.getByRole('main').getByText(first).first(),
      'the row\'s subject is the assigned task, so the task is now on screen',
    ).toBeVisible()
    await expect(
      bellWith(1),
      'spec 9.12: opening a row marks that row read and only that row, so the count ' +
        'fell by exactly one; a client marking everything read on any press collapses ' +
        'this to zero and fails here',
    ).toBeVisible()

    await clickControl(bellWith(1), 'reopen the surface for the read-all control')
    await clickControl(
      page.getByRole('button', { name: 'Mark all read', exact: true }),
      'spec 9.1\'s names table: the read-all control inside the surface is "Mark all read"',
    )
    await expect(
      page.getByRole('button', { name: 'Notifications', exact: true }),
      'spec 9.1: with nothing unread the suffix is gone, the name being the badge; ' +
        'AC-188 already pins the server\'s half of the same zero',
    ).toBeVisible()
  })
})
