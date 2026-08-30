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
  createFolder,
  openQuickAdd,
  quickAddControl,
  quickAddInput,
  routesV2,
  seedSubs,
  signIn,
  taskSurface,
  TEST_TIMEOUT_MS,
  waitForApiIdle,
  watchWire,
} from './harness.js'

test.use({ timezoneId: 'UTC', actionTimeout: ACTION_TIMEOUT_MS })
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

test('AC-353: Open full form carries the typed title, and Escape keeps a filled box', async ({
  page,
}) => {
  await signIn(page, seedSubs.hassan)
  const folder = await createFolder(page, caseTitle('AC-353 quick-add'))
  await page.goto(routesV2.folder(folder.id))

  const input = await openQuickAdd(page, 'the folder page carries the inline quick-add')
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
  await waitForApiIdle(page, 'the task has been made from the carried title')
  expect(
    wire.mutations().filter((call) => call.method === 'POST' && call.url.endsWith('/api/v1/tasks')),
    'spec 7.6: the title is enough to make the task, so it is made',
  ).toHaveLength(1)
  await expect(quickAddInput(page), 'the quick-add no longer holds the words it handed over').toHaveCount(
    0,
  )
})
