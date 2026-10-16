import { expect, test } from '@playwright/test'

test('help is available without a signed-in session', async ({ page }) => {
  await page.goto('/help')
  await expect(page.getByRole('heading', { name: 'How can we help?' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Help articles' })).toBeVisible()

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


test('the sidebar opens a section and marks the open guide', async ({ page }) => {
  await page.goto('/help')
  const nav = page.getByRole('navigation', { name: 'Help articles' })
  await nav.getByText('Tasks and planning', { exact: true }).click()
  await nav.getByRole('link', { name: 'Schedule a task', exact: true }).click()
  await expect(page).toHaveURL(/\/help\/schedule-a-task/)
  await expect(page.getByRole('heading', { name: 'Schedule a task', level: 1 })).toBeVisible()
  await expect(nav.getByRole('link', { name: 'Schedule a task', exact: true })).toHaveAttribute('aria-current', 'page')
})

test('article navigation stays usable on a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/help/schedule-a-task')
  await expect(page.getByRole('heading', { name: 'Schedule a task' })).toBeVisible()

  const menu = page.locator('details', { hasText: 'Browse articles' })
  await menu.getByText('Browse articles').click()
  await expect(menu.getByRole('navigation', { name: 'Help articles' })).toBeVisible()
  await expect(menu.getByRole('link', { name: 'Schedule a task', exact: true })).toHaveAttribute('aria-current', 'page')
})

test('search can recover from no results', async ({ page }) => {
  await page.goto('/help')
  await page.getByRole('searchbox', { name: 'Search help articles' }).fill('nothing-matches-this-help-query')
  await expect(page.getByRole('heading', { name: 'No matching articles' })).toBeVisible()
  await page.getByRole('button', { name: 'Clear search' }).click()
  await expect(page.getByRole('heading', { name: 'No matching articles' })).toBeHidden()
  await expect(page.getByRole('searchbox', { name: 'Search help articles' })).toHaveValue('')
})


test('public build identity is uncached and never guesses a commit', async ({ request }) => {
  const response = await request.get('/api/v1/build')
  expect([200, 503]).toContain(response.status())
  expect(response.headers()['cache-control']).toContain('no-store')
  const result = await response.json()
  if (response.ok()) expect(result.commit).toMatch(/^[a-f0-9]{40}$/)
  else expect(result.status).toBe('unavailable')
})
