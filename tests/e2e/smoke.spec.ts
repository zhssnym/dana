/*
The browser smoke test: sign in, create a task, open a folder. It checks the
core path only. Finer cases belong in vitest.
*/
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import { seedIds } from '../../db/seed.js'

test.use({ timezoneId: 'UTC', actionTimeout: 15_000 })
test.describe.configure({ timeout: 120_000 })

/** 11.10's session source for this leg: the development login, seed account. */
async function signIn(page: Page): Promise<void> {
  const response = await page.request.post('/api/v1/auth/dev-login', {
    data: { sub: 'seed-google-sub-hassan' },
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

  const words = `left at once ${Date.now()}`
  await test.step('writing typed just before leaving the page is saved', async () => {
    // The autosave waits 450 ms; leaving inside that wait must still send it.
    // Work's thread ends in its one last line; "# " there opens a heading at the page's end.
    await page.getByRole('textbox', { name: 'Add a task', exact: true }).click()
    await page.keyboard.type('# ')
    await page.keyboard.type(words)
    await expect(page.locator('.dana-writing-canvas').first()).toContainText(words)
    await page.getByRole('navigation').getByRole('link', { name: /Today/ }).first().click()
    await expect
      .poll(async () => {
        const response = await page.request.get(`/api/v1/folders/${seedIds.groceries}/page`)
        return (await response.text()).includes(words)
      })
      .toBe(true)
  })

  await test.step('a task typed in Work\'s last line is stored in the last Section', async () => {
    // AC-1509: the heading written above ends the page, so it is the Section the Task lands in.
    await page.goto(`/app/folders/${seedIds.groceries}`)
    const line = page.getByRole('textbox', { name: 'Add a task', exact: true })
    const task = `last line ${Date.now()}`
    await line.fill(task)
    await line.press('Enter')
    await expect(taskRow(page, task).first()).toBeVisible()
    await expect(line).toBeFocused()
    // Read back from the server: the stored Task, and the Section it is placed in.
    await expect
      .poll(async () => {
        const search = (await (await page.request.get(`/api/v1/search?q=${encodeURIComponent(task)}&tz=UTC`)).json()) as { rows: { id: string; title: string }[] }
        const id = search.rows.find((row) => row.title === task)?.id
        const document = (await (await page.request.get(`/api/v1/folders/${seedIds.groceries}/page`)).json()) as {
          task_placements: { id: string; section_block_id: string | null }[]
          blocks: { id: string; kind: string; text: string | null }[]
        }
        const heading = document.blocks.find((block) => block.kind === 'section' && block.text === words)
        const placed = document.task_placements.find((placement) => placement.id === id)
        return { stored: placed !== undefined, section: heading !== undefined && placed?.section_block_id === heading.id }
      })
      .toEqual({ stored: true, section: true })
  })
})
