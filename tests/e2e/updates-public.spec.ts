import { expect, test } from '@playwright/test'

test('What's New and historical notes are available without signing in', async ({ page }) => {
  await page.goto('/updates')
  await expect(page.getByRole('heading', { name: "What's new" })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Earlier improvements' })).toBeVisible()
  await page.getByRole('link', { name: /Easier date adjustments in Calendar/ }).click()
  await expect(page).toHaveURL(/\/updates\/pr-641$/)
  await expect(page.getByRole('heading', { name: 'Easier date adjustments in Calendar' })).toBeVisible()
  await page.getByRole('link', { name: 'Back to all updates' }).click()
  await expect(page).toHaveURL(/\/updates$/)
})

test('public updates manifest matches the displayed article URL', async ({ request, page }) => {
  const response = await request.get('/updates/feed.json')
  expect(response.ok()).toBe(true)
  const feed = await response.json() as { version: number; entries: Array<{ id: string; title: string }> }
  expect(feed.version).toBe(1)
  expect(feed.entries.length).toBeGreaterThan(0)
  await page.goto('/updates/' + feed.entries[0]!.id)
  await expect(page.getByRole('heading', { name: feed.entries[0]!.title })).toBeVisible()
})

test('What's New remains readable on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/updates')
  await expect(page.getByRole('heading', { name: "What's new" })).toBeVisible()
  await expect(page.getByRole('link', { name: /A personal bio for each teammate/ })).toBeVisible()
  const overflows = await page.evaluate(() =>
    document.documentElement.scrollWidth > document.documentElement.clientWidth)
  expect(overflows).toBe(false)
})
