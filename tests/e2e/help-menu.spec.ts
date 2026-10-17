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

test('Help opens in a new tab; feedback stays in Dana', async ({ page }) => {
  await enterDana(page)
  const help = page.getByRole('button', { name: 'Help', exact: true })
  await expect(help).toBeVisible()
  await help.click()
  await expect(page.getByText('About this build')).toBeVisible()
  await expect(page.getByText('Version (build)')).toBeVisible()
  await expect(page.getByText('Client built')).toBeVisible()

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

})

test('footer stays one aligned row at the minimum sidebar width and accepts keyboard', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('dana.sidebar-width', '224')
    localStorage.setItem('dana.sidebar-collapsed', 'false')
  })
  await enterDana(page)
  const footer = page.locator('[data-slot="sidebar-footer"]')
  const help = footer.getByRole('button', { name: 'Help', exact: true })
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

test('Help works in the mobile sidebar drawer', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await enterDana(page)
  await page.getByRole('button', { name: 'Menu', exact: true }).click()
  await page.getByRole('button', { name: 'Help', exact: true }).click()
  await expect(page.getByText('About this build')).toBeVisible()
})
