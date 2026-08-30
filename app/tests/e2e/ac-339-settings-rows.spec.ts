/*
AC-339: given Settings, then "Where a task opens" offers Dialog and Panel and
no Tab; the Account section offers a Timezone control whose choice is
written through PATCH /me and read back; and neither "Open People" nor a
"Sign out" button stands on the page, each living in the sidebar alone.

Authored 2026-08-30 at the polish round (settings F4, F5, F6, F8).

Spec: 9.7 (Settings, as amended at the polish round), 7.1 (PATCH /me).
*/
import { expect, test } from '@playwright/test'

import {
  routesV2,
  seedSubs,
  signIn,
  TEST_TIMEOUT_MS,
  waitForApiIdle,
} from './harness.js'

test.describe.configure({ timeout: TEST_TIMEOUT_MS })

test('AC-339: no Tab option, a timezone choice over PATCH /me, one door each for People and Sign out', async ({
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
    'settings F4: a tab is an action a row offers, never a remembered place; an option that did nothing is gone',
  ).toHaveCount(0)

  const timezone = main.getByLabel('Timezone', { exact: true })
  await expect(timezone, 'settings F6: the timezone is a choice, 7.1 taking one').toBeVisible()
  const before = await timezone.inputValue()
  const next = before === 'Europe/Paris' ? 'Europe/Berlin' : 'Europe/Paris'
  await timezone.selectOption(next)
  await waitForApiIdle(page, 'PATCH /me has answered')
  const me = await page.request.get('/api/v1/me')
  expect(((await me.json()) as { user: { timezone: string } }).user.timezone, '7.1: the account carries the choice').toBe(next)
  await timezone.selectOption(before)
  await waitForApiIdle(page, 'restored')

  await expect(main.getByRole('button', { name: 'Open People', exact: true }), 'settings F5: People is the sidebar\'s').toHaveCount(0)
  await expect(main.getByRole('button', { name: 'Sign out', exact: true }), 'settings F5: Sign out is the account menu\'s').toHaveCount(0)
  await expect(main.getByText('Browser menu', { exact: true }), 'settings F8: no chip dressed as a button that does nothing').toHaveCount(0)
})
