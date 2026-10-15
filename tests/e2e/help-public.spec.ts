import { expect, test } from '@playwright/test'

test('help is available without a signed-in session', async ({ page }) => {
  await page.goto('/help')
  await expect(page.getByRole('heading', { name: 'How can we help?' })).toBeVisible()
  await expect(page.getByRole('link', { name: /Schedule a task/ }).first()).toBeVisible()

  await page.getByRole('searchbox', { name: 'Search help articles' }).fill('keyboard')
  await expect(page.getByRole('link', { name: /Keyboard shortcuts/ })).toBeVisible()
  await page.getByRole('link', { name: /Keyboard shortcuts/ }).click()
  await expect(page.getByRole('heading', { name: 'Keyboard shortcuts' })).toBeVisible()
  await expect(page.getByText('Search', { exact: true }).first()).toBeVisible()
})

test('direct help article links resolve without an account', async ({ page }) => {
  await page.goto('/help/schedule-a-task')
  await expect(page.getByRole('heading', { name: 'Schedule a task' })).toBeVisible()
  await expect(page.getByText('Start Date', { exact: false }).first()).toBeVisible()
})
