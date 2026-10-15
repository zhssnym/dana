import { randomUUID } from 'node:crypto'

import { expect, test } from '@playwright/test'

import { seedIds } from '../../db/seed.js'

test('a profile keeps Overview and opens a native Doc tab', async ({ page }) => {
  const login = await page.request.post('/api/v1/auth/dev-login', {
    data: { sub: 'seed-google-sub-hassan' },
  })
  expect(login.status()).toBe(200)
  await page.goto(`/app/folders/${seedIds.groceries}?member=${seedIds.imran}&team=full`)
  await expect(page.getByRole('heading', { name: 'Imran' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Overview' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Responsibilities' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Contribution activity' })).toBeVisible()
  await page.getByRole('button', { name: 'Add tab' }).click()
  await page.getByRole('menuitem', { name: 'Doc' }).click()
  await expect(page.getByRole('tab', { name: 'Untitled' })).toBeVisible()
  await expect(page.locator('.dana-writing-canvas')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Doc visibility: Project members' })).toBeVisible()
  const rootId = new URL(page.url()).searchParams.get('profile_tab')
  expect(rootId).toBeTruthy()
  const original = await page.request.get(`/api/v1/folders/${rootId}/page`)
  expect(original.status()).toBe(200)
  const document = await original.json() as { revision: string; items: {
    kind: 'block' | 'task'; id: string; section_block_id: string | null; list_parent_block_id: string | null
  }[] }
  const childId = randomUUID()
  const blockId = randomUUID()
  const csrf = (await page.context().cookies()).find((cookie) => cookie.name === 'dana_csrf')?.value
  expect(csrf).toBeTruthy()
  const created = await page.request.post(`/api/v1/folders/${rootId}/page/actions`, {
    headers: { 'X-CSRF-Token': csrf! },
    data: {
      action: 'document_transaction', mutation_id: randomUUID(), base_revision: document.revision,
      operations: [
        { op: 'create_page', id: childId, block_id: blockId, title: 'Child writing' },
        { op: 'set_outline', items: [
          ...document.items.map((item) => ({ ...item })),
          { kind: 'block', id: blockId, section_block_id: null, list_parent_block_id: null },
        ] },
      ],
    },
  })
  expect(created.status()).toBe(200)
  await page.reload()
  await page.locator(`[data-canvas-page-id="${childId}"]`).click()
  await expect(page).toHaveURL(new RegExp(`profile_page=${childId}`))
  await expect(page.getByRole('button', { name: 'Back to Untitled' })).toBeVisible()
  await page.screenshot({ path: 'test-results/profile-doc-desktop.png', fullPage: true })
})
