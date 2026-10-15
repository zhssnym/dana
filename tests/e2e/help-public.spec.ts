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

test('topic navigation and article outline use real links', async ({ page }) => {
  await page.goto('/help')
  await page.getByRole('navigation', { name: 'Help topics' }).getByRole('link', { name: 'Tasks and planning' }).click()
  await expect(page).toHaveURL(/\/help#topic-tasks-and-planning$/)
  await page.getByRole('link', { name: 'Schedule a task' }).first().click()
  await expect(page.getByRole('navigation', { name: 'Article outline' }).getByRole('link', { name: 'Choose dates' })).toBeVisible()
  await page.getByRole('navigation', { name: 'Article outline' }).getByRole('link', { name: 'Choose dates' }).click()
  await expect(page).toHaveURL(/#choose-dates$/)
})

test('mobile readers can browse topics', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/help')
  await page.getByText('Browse topics', { exact: true }).last().click()
  await expect(page.getByRole('navigation', { name: 'Help topics' })).toBeVisible()
  await page.getByRole('link', { name: 'Getting started' }).click()
  await expect(page).toHaveURL(/\/help#topic-getting-started$/)
})
