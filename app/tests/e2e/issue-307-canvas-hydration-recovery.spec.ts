import { expect, test } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  routesV2,
  seedIds,
  seedSubs,
  signIn,
  TEST_TIMEOUT_MS,
} from './harness.js'

test.use({ timezoneId: 'UTC', actionTimeout: ACTION_TIMEOUT_MS })
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

test('issue 307: a malformed canvas keeps the application available and offers recovery', async ({ page }) => {
  await signIn(page, seedSubs.hassan)
  await page.route((url) => url.pathname === `/api/v1/folders/${seedIds.groceries}/page`, async (route) => {
    await route.fulfill({
      json: {
        revision: 'broken-outline',
        blocks: [],
        items: [{ kind: 'block', id: '12121212-1212-4212-8212-121212121212' }],
        task_placements: [],
      },
    })
  })

  await page.goto(routesV2.folder(seedIds.groceries))

  const recovery = page.getByRole('alert')
  await expect(recovery).toContainText('Writing could not be opened')
  await expect(recovery).toContainText('The page contains an unavailable block. Reload before editing.')
  await expect(recovery.getByRole('button', { name: 'Reload page' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 1, name: 'Groceries' })).toBeVisible()
})
