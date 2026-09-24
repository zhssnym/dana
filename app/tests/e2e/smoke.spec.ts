/*
The browser smoke test: the whole of the Playwright leg since the owner cut it
from eight spec files to one (2026-09-23), trading exhaustive browser coverage
for a leg that is short and dependable.

It answers one question the vitest suite cannot: does the built client, served
by the real server against the seed, let a person sign in, capture a task and
open a folder. Anything finer belongs in a vitest criterion.

The runner seeds once per run (playwright.config.ts), so a task this spec
creates carries a per-run suffix and never collides with a previous run's rows
if the database was not reseeded. Seed rows are only read, never changed.
*/
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import { seedIds } from '../../db/seed.js'

test.use({ timezoneId: 'UTC', actionTimeout: 15_000 })
test.describe.configure({ timeout: 120_000 })

/** 11.10's session source for this leg: the development login, seed account. */
async function signIn(page: Page): Promise<void> {
  const response = await page.request.post('/api/v1/auth/dev-login', {
    data: { sub: 'seed-google-sub-hassan', sample: false },
  })
  expect(
    response.status(),
    `POST /api/v1/auth/dev-login answered ${response.status()}: ${await response.text()}`,
  ).toBe(200)
}

function taskRow(page: Page, title: string) {
  return page.getByRole('listitem').or(page.getByRole('row')).filter({ hasText: title })
}

test('smoke: sign in, create a task, open a folder', async ({ page }) => {
  await signIn(page)

  await test.step('the signed-in shell renders', async () => {
    await page.goto('/app')
    // /app lands on Today.
    await expect(page).toHaveURL(/\/app\/today$/)
    await expect(page.getByRole('navigation').first()).toBeVisible()
  })

  const title = `smoke task ${Date.now()}`
  await test.step('the quick-add creates a task', async () => {
    // Already on Today. The inline "New task" row ends the list; N focuses it.
    await expect(page.getByRole('textbox', { name: 'New task', exact: true }).first()).toBeVisible()
    await page.keyboard.press('n')
    const box = page.getByRole('textbox', { name: 'New task', exact: true }).first()
    await expect(box).toBeFocused()
    await box.fill(title)
    await box.press('Enter')
    await expect(taskRow(page, title)).toBeVisible()

    // Read back from the server, so a row drawn only in local state fails.
    await expect
      .poll(async () => {
        const response = await page.request.get(
          `/api/v1/search?q=${encodeURIComponent(title)}&tz=UTC`,
        )
        const body = (await response.json()) as { rows: { title: string }[] }
        return body.rows.filter((row) => row.title === title).length
      })
      .toBe(1)
  })

  await test.step('a folder opens from the sidebar', async () => {
    const folderPath = `/app/folders/${seedIds.groceries}`
    const link = page
      .getByRole('navigation')
      .getByRole('link', { name: /Groceries/ })
      .and(page.locator(`[href="${folderPath}"]`))
      .first()
    await link.click()
    await expect(page).toHaveURL(new RegExp(`${folderPath}$`))
    await expect(taskRow(page, 'Buy milk').first()).toBeVisible()
  })
})
