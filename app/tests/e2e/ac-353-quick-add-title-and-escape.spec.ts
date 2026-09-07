/*
AC-353: the quick-add hands its words to the full form and never throws them
away on Escape.

The adversarial round of 2026-08-30 (taskrow F3 and F7): "Open full form"
opened a blank title over the words still sitting in the quick-add, and
Escape emptied a half-typed box while clicking away kept it. One rule now
for both: a box with words keeps them, an empty box collapses; and the full
form opens on the title typed, the task already made from it.

Spec: 9.1 (the inline quick-add and "Open full form"), 9.3.
*/
import { expect, test } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  caseTitle,
  clickControl,
  openQuickAdd,
  quickAddControl,
  quickAddInput,
  routesV2,
  seedSubs,
  signIn,
  taskSurface,
  TEST_TIMEOUT_MS,
  watchCommit,
  watchWire,
} from './harness.js'

test.use({ timezoneId: 'UTC', actionTimeout: ACTION_TIMEOUT_MS })
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

test('AC-353: Open full form carries the typed title, and Escape keeps a filled box', async ({
  page,
}) => {
  await signIn(page, seedSubs.hassan)
  /* #184 makes a folder's list (including Desk) the compose-first canvas;
     the generic inline quick-add contract remains on the task places.
     Exercise it there so this criterion keeps testing its own behavior
     without requiring the retired second editor on a folder page. */
  await page.goto(routesV2.anytime)

  const input = await openQuickAdd(page, 'Anytime carries the inline quick-add')
  await input.fill('half typed')
  await input.press('Escape')
  await expect(input, 'Escape on a filled box leaves the words where they are').toHaveValue(
    'half typed',
  )
  await input.fill('')
  await input.press('Escape')
  await expect(quickAddInput(page), 'Escape on an empty box collapses it').toHaveCount(0)
  await expect(quickAddControl(page).first()).toBeVisible()

  const title = caseTitle('AC-353 full form test')
  const again = await openQuickAdd(page, 'and it opens again')
  await again.fill(title)
  const wire = watchWire(page)
  /* Before the act (2026-09-04, issue #159). `waitForApiIdle` returns as
     soon as nothing is in flight, and that is also true in the window
     between the press and the request the press causes, so a read taken
     there lands before the write and reports the state the page was in
     before it -- which is the shape of the defect being asserted against
     rather than of a barrier. `watchCommit` waits for the page to have
     sent something before it waits for quiet. */
  const made = watchCommit(page)
  await clickControl(
    page.getByRole('button', { name: 'Open full form', exact: true }),
    "spec 9.1: the quick-add's escalation control",
  )
  const surface = taskSurface(page)
  await expect(surface).toBeVisible()
  await expect(
    surface.getByLabel(/^\s*title\s*$/i),
    'the full form opens on the words typed rather than on a blank title',
  ).toHaveValue(title)
  await made.settled('the task reaches the server before the wire is counted')
  expect(
    wire.mutations().filter((call) => call.method === 'POST' && call.url.endsWith('/api/v1/tasks')),
    'spec 7.6: the title is enough to make the task, so it is made',
  ).toHaveLength(1)
  await expect(quickAddInput(page), 'the quick-add no longer holds the words it handed over').toHaveCount(
    0,
  )
})
