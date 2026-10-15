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


test('topics and article contents support direct navigation', async ({ page }) => {
  await page.goto('/help')
  await page.getByRole('link', { name: /Tasks and planning/ }).click()
  await expect(page).toHaveURL(/section=Tasks/)
  await expect(page.getByRole('heading', { name: 'Tasks and planning' })).toBeVisible()

  await page.getByRole('link', { name: /Schedule a task/ }).click()
  await expect(page).toHaveURL(/\/help\/schedule-a-task/)
  await expect(page.getByRole('navigation', { name: 'On this page' })).toBeVisible()
  await page.getByRole('navigation', { name: 'On this page' })
    .getByRole('link', { name: 'Choose dates' }).click()
  await expect(page).toHaveURL(/#choose-dates$/)
  await expect(page.locator('#choose-dates')).toBeVisible()
  await page.getByRole('link', { name: 'Search help' }).click()
  await expect(page.getByRole('searchbox', { name: 'Search help articles' })).toBeFocused()
})

test('article navigation stays usable on a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/help/schedule-a-task')
  await expect(page.getByRole('heading', { name: 'Schedule a task' })).toBeVisible()

  const menu = page.locator('details')
  await menu.locator('summary').click()
  await expect(menu.getByRole('navigation', { name: 'Help articles' })).toBeVisible()
  await expect(menu.getByRole('link', { name: 'Schedule a task', exact: true })).toHaveAttribute('aria-current', 'page')
})

test('search can recover from no results', async ({ page }) => {
  await page.goto('/help')
  await page.getByRole('searchbox', { name: 'Search help articles' }).fill('nothing-matches-this-help-query')
  await expect(page.getByRole('heading', { name: 'No matching articles' })).toBeVisible()
  await page.getByRole('button', { name: 'Clear search' }).click()
  await expect(page.getByRole('heading', { name: 'Browse by topic' })).toBeVisible()
})


test('public build identity is uncached and never guesses a commit', async ({ request }) => {
  const response = await request.get('/api/v1/build')
  expect([200, 503]).toContain(response.status())
  expect(response.headers()['cache-control']).toContain('no-store')
  const result = await response.json()
  if (response.ok()) expect(result.commit).toMatch(/^[a-f0-9]{40}$/)
  else expect(result.status).toBe('unavailable')
})
