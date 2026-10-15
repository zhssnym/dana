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

test('Help and Updates open in new tabs; feedback stays in Dana', async ({ page }) => {
  await enterDana(page)
  const help = page.getByRole('button', { name: 'Help & Updates', exact: true })
  await expect(help).toBeVisible()
  await help.click()
  await expect(page.getByText('About this build')).toBeVisible()
  await expect(page.getByText('Version (build)')).toBeVisible()
  await expect(page.getByText('Client built')).toBeVisible()

  const updates = page.getByRole('region', { name: "What's New" })
  await expect(updates.getByRole('link', { name: /Find Help articles more easily/ })).toBeVisible()
  await expect(updates.locator('a[href^="/updates/pr-"]')).toHaveCount(3)

  await page.getByRole('button', { name: 'Send feedback' }).click()
  await expect(page.getByRole('dialog', { name: 'Send feedback' })).toBeVisible()
  await page.keyboard.press('Escape')
  await help.click()

  const helpPagePromise = page.context().waitForEvent('page')
  await page.getByRole('link', { name: 'Help Center', exact: true }).click()
  const helpPage = await helpPagePromise
  await helpPage.waitForLoadState('domcontentloaded')
  await expect(helpPage).toHaveURL(/\/help$/)
  await expect(helpPage.getByRole('heading', { name: 'How can we help?' })).toBeVisible()
  await expect(page).toHaveURL(/\/app\/today$/)

  await help.click()
  const updatesPagePromise = page.context().waitForEvent('page')
  await page.getByRole('link', { name: 'View all updates' }).click()
  const updatesPage = await updatesPagePromise
  await updatesPage.waitForLoadState('domcontentloaded')
  await expect(updatesPage).toHaveURL(/\/updates$/)
  await expect(updatesPage.getByRole('heading', { name: "What's New" })).toBeVisible()
})

test('newly published releases show an alert and clear when inspected', async ({ page }) => {
  await page.route('**/updates/feed.json', async (route) => {
    const live = await route.fetch()
    const feed = await live.json() as { version: number; entries: unknown[] }
    await route.fulfill({ json: { ...feed, entries: [{
      id: 'pr-99887766',
      publishedAt: '2026-10-15',
      historical: false,
      kind: 'improvement',
      title: 'A new release to review',
      summary: 'A newly published improvement shown in the sidebar feed.',
      pr: 99887766,
      commit: 'a'.repeat(40),
    }, ...feed.entries] } })
  })
  await enterDana(page)
  const help = page.getByRole('button', { name: /Help & Updates, 1 new updates/ })
  await expect(help).toBeVisible()
  await help.click()
  const menu = page.getByRole('region', { name: "What's New" })
  await expect(menu.locator('a[href^="/updates/pr-"]')).toHaveCount(3)
  await expect(menu.getByRole('link', { name: /A new release to review/ })).toBeVisible()
  await expect.poll(async () => {
    const response = await page.request.get('/api/v1/settings')
    const state = await response.json() as { updates_seen_ids: string[] }
    return state.updates_seen_ids.includes('pr-99887766')
  }).toBe(true)
  await expect(page.getByRole('button', { name: 'Help & Updates', exact: true })).toBeVisible()
})

test('footer stays one aligned row at the minimum sidebar width and accepts keyboard', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('dana.sidebar-width', '224')
    localStorage.setItem('dana.sidebar-collapsed', 'false')
  })
  await enterDana(page)
  const footer = page.locator('[data-slot="sidebar-footer"]')
  const help = footer.getByRole('button', { name: 'Help & Updates', exact: true })
  await expect(help).toBeVisible()
  const widthFits = await footer.evaluate((node) => node.scrollWidth <= node.clientWidth)
  expect(widthFits).toBe(true)
  const yCoordinates = await footer.locator('.grid > *').evaluateAll((elements) =>
    elements.map((element) => Math.round(element.getBoundingClientRect().top)))
  expect(yCoordinates).toHaveLength(7)
  expect(new Set(yCoordinates).size).toBe(1)
  await expect(footer.getByRole('link', { name: 'Trash' })).toBeVisible()
  await expect(footer.getByRole('link', { name: 'Settings' })).toBeVisible()
  await help.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByText('About this build')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(help).toBeFocused()
})

test('Help & Updates works in the mobile sidebar drawer', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await enterDana(page)
  await page.getByRole('button', { name: 'Menu', exact: true }).click()
  await page.getByRole('button', { name: 'Help & Updates', exact: true }).click()
  await expect(page.getByText('About this build')).toBeVisible()
})
