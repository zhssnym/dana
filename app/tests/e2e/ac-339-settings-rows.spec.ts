/*
AC-339: given Settings, then "Where a task opens" offers the three homes 9.7
names, Dialog, Panel and Tab; the Account section offers a Timezone control
whose choice is written through PATCH /me and read back; and neither "Open
People" nor a "Sign out" button stands on the page, each living in the
sidebar alone.

Authored 2026-08-30 at the polish round (settings F4, F5, F6, F8).

**The Tab clause is the merge's, and it reads the other way round from the
sitting that wrote this file.** Settings F4 and taskcard F3 are one finding
seen from two seats: this screen's fixer read "Tab accepted and ignored" and
removed the option, and the task fixer read the same thing and built what it
promised — `/app/tasks/:id` is the card itself now, over the editing hook the
dialog uses, and AC-354 asserts it. A control that works is not the dead
control F4 objected to, 9.7's Appearance bullet names three, and neither
fixer amended that bullet. So the option stands and this criterion asserts
all three rather than the absence of one.

Spec: 9.7 (Settings, as amended at the polish round), 7.1 (PATCH /me).
*/
import { expect, test } from '@playwright/test'

import {
  routesV2,
  seedSubs,
  signIn,
  TEST_TIMEOUT_MS,
  watchCommit,
} from './harness.js'

test.describe.configure({ timeout: TEST_TIMEOUT_MS })

test('AC-339: three homes for a task, a timezone choice over PATCH /me, one door each for People and Sign out', async ({
  page,
}) => {
  await signIn(page, seedSubs.hassan)
  await page.goto(routesV2.settings)
  const main = page.getByRole('main')

  const opens = main.getByRole('radiogroup', { name: 'Where a task opens', exact: true })
  await expect(opens, 'spec 9.7: the control').toBeVisible()
  await expect(opens.getByRole('radio', { name: 'Dialog', exact: true })).toBeVisible()
  await expect(opens.getByRole('radio', { name: 'Panel', exact: true })).toBeVisible()
  await expect(
    opens.getByRole('radio', { name: 'Tab', exact: true }),
    'spec 9.7: the third home, kept because taskcard F3 made it open the card as a page (AC-354) ' +
      'rather than the dialog it said it would not use',
  ).toBeVisible()

  const timezone = main.getByLabel('Timezone', { exact: true })
  await expect(timezone, 'settings F6: the timezone is a choice, 7.1 taking one').toBeVisible()
  const before = await timezone.inputValue()
  const next = before === 'Europe/Paris' ? 'Europe/Berlin' : 'Europe/Paris'
  /* Before the act (2026-09-04, issue #159). `waitForApiIdle` returns as
     soon as nothing is in flight, and that is also true in the window
     between the press and the request the press causes, so a read taken
     there lands before the write and reports the state the page was in
     before it -- which is the shape of the defect being asserted against
     rather than of a barrier. `watchCommit` waits for the page to have
     sent something before it waits for quiet. */
  const chosen = watchCommit(page)
  await timezone.selectOption(next)
  await chosen.settled('the choice reaches 7.1 before /me is asked what it holds')
  const me = await page.request.get('/api/v1/me')
  expect(((await me.json()) as { user: { timezone: string } }).user.timezone, '7.1: the account carries the choice').toBe(next)
  /* Before the act (2026-09-04, issue #159). `waitForApiIdle` returns as
     soon as nothing is in flight, and that is also true in the window
     between the press and the request the press causes, so a read taken
     there lands before the write and reports the state the page was in
     before it -- which is the shape of the defect being asserted against
     rather than of a barrier. `watchCommit` waits for the page to have
     sent something before it waits for quiet. */
  const restored = watchCommit(page)
  await timezone.selectOption(before)
  await restored.settled('the account is put back before this case ends, the seeded zone being every other file')

  await expect(main.getByRole('button', { name: 'Open People', exact: true }), 'settings F5: People is the sidebar\'s').toHaveCount(0)
  await expect(main.getByRole('button', { name: 'Sign out', exact: true }), 'settings F5: Sign out is the account menu\'s').toHaveCount(0)
  await expect(main.getByText('Browser menu', { exact: true }), 'settings F8: no chip dressed as a button that does nothing').toHaveCount(0)
})
