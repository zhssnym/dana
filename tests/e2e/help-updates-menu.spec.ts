import { expect, test } from '@playwright/test'

async function enterDana(page: import('@playwright/test').Page): Promise<void> {
  const response = await page.request.post('/api/v1/auth/dev-login', {
    data: { sub: 'seed-google-sub-hassan' },
  })
  expect(response.status()).toBe(200)
  await page.goto('/app/today')
  const skip = page.getByRole('dialog', { name: 'How did you hear about Dana?' })
    .getByRole('button', { name: 'Skip' })
  await skip.waitFor({ timeout: 4000 }).then(() => skip.click(), () => undefined)
}

test('footer Help menu opens guides and the existing feedback dialog', async ({ page }) => {
  await enterDana(page)
  const help = page.getByRole('button', { name: 'Help & Updates', exact: true })
  await expect(help).toBeVisible()
  await help.click()
  await expect(page.getByText('About this build')).toBeVisible()
  await expect(page.getByText('Client built')).toBeVisible()
  await expect(page.getByRole('link', { name: 'View all updates' })).toBeVisible()

  await page.getByRole('button', { name: 'Send feedback' }).click()
  await expect(page.getByRole('dialog', { name: 'Send feedback' })).toBeVisible()
  await page.keyboard.press('Escape')
  await help.click()
  await page.getByRole('link', { name: 'Documentation' }).click()
  await expect(page).toHaveURL(/\/help$/)
  await expect(page.getByRole('heading', { name: 'How can we help?' })).toBeVisible()
})

test('updates links and current account acknowledgement state are available', async ({ page }) => {
  await enterDana(page)
  const data = await page.request.get('/api/v1/settings')
  expect(data.ok()).toBe(true)
  const saved = await data.json() as { updates_seen_ids: string[] }
  expect(Array.isArray(saved.updates_seen_ids)).toBe(true)

  await page.getByRole('button', { name: 'Help & Updates', exact: true }).click()
  await page.getByRole('link', { name: 'View all updates' }).click()
  await expect(page).toHaveURL(/\/updates$/)
})

test('Help controls fit Dana minimum sidebar width and remain keyboard-accessible', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('dana.sidebar-width', '224')
    localStorage.setItem('dana.sidebar-collapsed', 'false')
  })
  await enterDana(page)
  const help = page.getByRole('button', { name: 'Help & Updates', exact: true })
  await expect(help).toBeVisible()
  await expect(page.getByRole('link', { name: 'Trash' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Settings' })).toBeVisible()
  const foot = page.locator('[data-slot="sidebar-footer"]')
  const fits = await foot.evaluate((element) => element.scrollWidth <= element.clientWidth)
  expect(fits).toBe(true)
  await help.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByText('About this build')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(help).toBeFocused()
})

test('Help is accessible from the mobile sidebar drawer', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await enterDana(page)
  await page.getByRole('button', { name: 'Menu', exact: true }).click()
  await page.getByRole('button', { name: 'Help & Updates', exact: true }).click()
  await expect(page.getByText('About this build')).toBeVisible()
})
