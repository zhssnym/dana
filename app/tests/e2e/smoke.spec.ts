/*
The browser smoke test: the whole of the Playwright leg since the owner cut it
from eight spec files to one (2026-09-23), trading exhaustive browser coverage
for a leg that is short and dependable.

It checks the built client against the real server and seed: sign in, capture a
task, open a folder, edit a Task's Labels, and keep collaboration surfaces on
the workspace tab that owns them. Finer cases belong in vitest.

The runner seeds once per run (playwright.config.ts), so a task this spec
creates carries a per-run suffix and never collides with a previous run's rows
if the database was not reseeded. The Label case removes its assignment again.
*/
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import { seedIds } from '../../db/seed.js'

test.use({ timezoneId: 'UTC', actionTimeout: 15_000 })
test.describe.configure({ timeout: 120_000 })

/** 11.10's session source for this leg: the development login, seed account. */
async function signIn(page: Page): Promise<void> {
  const response = await page.request.post('/api/v1/auth/dev-login', {
    data: { sub: 'seed-google-sub-hassan', sample: false },
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

test('smoke: collaboration state follows its workspace tab', async ({ page }) => {
  await signIn(page)
  await page.goto(`/app/folders/${seedIds.groceries}`)

  const tabs = page.getByRole('tablist', { name: 'Open tabs' })
  await expect(tabs).toBeVisible()

  await test.step('Team is sidebar-first, resizable, and full focus stays in the current tab', async () => {
    await page.getByRole('button', { name: 'Team', exact: true }).click()
    const team = page.getByRole('region', { name: 'Sharing panel' })
    await expect(team).toBeVisible()
    await expect(page.getByRole('separator', { name: 'Resize Team' })).toBeVisible()
    await team.getByRole('button', { name: 'Imran', exact: true }).click()
    await expect(team.getByRole('heading', { name: 'Imran', exact: true })).toBeVisible()
    await expect(page).toHaveURL(new RegExp(`member=${seedIds.imran}`))

    await team.getByRole('button', { name: 'Open full page', exact: true }).click()
    await expect(page).toHaveURL(/team=full/)
    await expect(tabs.getByRole('tab', { name: /Groceries · Team/ })).toBeVisible()
    await expect(team.getByRole('button', { name: 'Open in side panel', exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Go back', exact: true }).click()
    await expect(page).not.toHaveURL(/team=full/)
    await expect(team.getByRole('button', { name: 'Open full page', exact: true })).toBeVisible()
    await expect(team.getByRole('heading', { name: 'Imran', exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Go forward', exact: true }).click()
    await expect(page).toHaveURL(/team=full/)
    await expect(tabs.getByRole('tab', { name: /Groceries · Team/ })).toBeVisible()
    await team.getByRole('button', { name: 'Open in side panel', exact: true }).click()
    await expect(page).not.toHaveURL(/team=full/)

    await page.getByRole('button', { name: 'Open tab' }).click()
    await page.getByRole('textbox', { name: 'Search Dana to open a tab' }).fill('Today')
    await page.getByRole('option', { name: /Today/ }).first().click()
    await expect(page).toHaveURL(/\/app\/today$/)
    await expect(page.getByRole('region', { name: 'Sharing panel' })).toHaveCount(0)

    await page.getByRole('tab', { name: /Groceries/ }).click()
    await expect(page).toHaveURL(new RegExp(`/app/folders/${seedIds.groceries}.*member=${seedIds.imran}`))
    await expect(page.getByRole('region', { name: 'Sharing panel' }).getByRole('heading', { name: 'Imran', exact: true })).toBeVisible()
  })

  await test.step('Discussion is sidebar-first and browser history round-trips focused presentation', async () => {
    await page.getByRole('button', { name: 'Discussion', exact: true }).click()
    const dock = page.locator('[data-chat-dock]')
    await expect(dock).toBeVisible()
    await expect(page.locator('[data-discussion-context-bar]')).toHaveCount(0)

    await dock.getByRole('button', { name: 'Resolved', exact: true }).click()
    await expect(dock.getByRole('button', { name: 'Resolved', exact: true })).toHaveAttribute('aria-pressed', 'true')

    const stripRight = await tabs.locator('..').evaluate((element) => element.getBoundingClientRect().right)
    const viewportWidth = page.viewportSize()?.width ?? 1280
    expect(Math.abs(viewportWidth - stripRight)).toBeLessThan(2)

    await page.getByRole('button', { name: 'Open tab' }).click()
    await page.getByRole('textbox', { name: 'Search Dana to open a tab' }).fill('Today')
    await page.getByRole('option', { name: /Today/ }).first().click()
    await expect(page).toHaveURL(/\/app\/today$/)
    await expect(dock).toHaveCount(0)

    const discussionTab = tabs.getByRole('tab').filter({ hasText: /Groceries/ }).first()
    await discussionTab.click()
    await expect(dock).toBeVisible()
    await expect(dock.getByRole('button', { name: 'Resolved', exact: true })).toHaveAttribute('aria-pressed', 'true')

    await dock.getByRole('button', { name: 'Open full screen', exact: true }).click()
    const context = page.locator('[data-discussion-context-bar]')
    await expect(context).toBeVisible()
    await expect(context.getByRole('heading', { name: 'Discussion', exact: true })).toBeVisible()
    await expect(tabs.getByRole('tab', { name: /Groceries · Discussion/ })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Resolved', exact: true })).toHaveAttribute('aria-pressed', 'true')

    await page.getByRole('button', { name: 'Go back', exact: true }).click()
    await expect(context).toHaveCount(0)
    await expect(dock).toBeVisible()
    await expect(dock.getByRole('button', { name: 'Resolved', exact: true })).toHaveAttribute('aria-pressed', 'true')

    await page.getByRole('button', { name: 'Go forward', exact: true }).click()
    await expect(context).toBeVisible()
    await expect(tabs.getByRole('tab', { name: /Groceries · Discussion/ })).toBeVisible()

    await context.getByRole('button', { name: 'Open in side panel', exact: true }).click()
    await expect(context).toHaveCount(0)
    await expect(dock).toBeVisible()
    await expect(dock.getByRole('button', { name: 'Resolved', exact: true })).toHaveAttribute('aria-pressed', 'true')

    await dock.getByRole('button', { name: 'Open full screen', exact: true }).click()
    await expect(context).toBeVisible()
    const back = context.getByRole('button', { name: /^Back to / }).first()
    await expect(back).toBeVisible()
    await back.click()
    await expect(context).toHaveCount(0)
    await expect(dock).toBeVisible()
    await expect(page).toHaveURL(new RegExp(`/app/folders/${seedIds.groceries}`))
  })
})

test('smoke: task page completion toggle and Labels', async ({ page }) => {
  await signIn(page)
  await page.goto('/app')
  await page.getByRole('navigation').getByRole('link', { name: /Groceries/ }).first().click()
  await taskRow(page, 'Buy milk').first().click()

  await test.step('the title state mark completes and reopens the task', async () => {
    const taskId = new URL(page.url()).pathname.split('/').at(-1)
    expect(taskId).toBeTruthy()
    const taskHeader = page.getByRole('textbox', { name: 'title' }).locator('..').locator('..').locator('..')
    const complete = taskHeader.getByRole('checkbox', { name: 'Complete task', exact: true })
    await expect(complete).toBeVisible()
    const completing = page.waitForResponse(
      (response) => response.request().method() === 'POST' && response.url().includes(`/tasks/${taskId}/complete`),
    )
    await complete.click()
    expect((await completing).status()).toBe(200)
    await expect(taskHeader.getByRole('checkbox', { name: 'Mark as not done', exact: true })).toBeVisible()
    await page.reload()
    const reopen = taskHeader.getByRole('checkbox', { name: 'Mark as not done', exact: true })
    await expect(reopen).toBeVisible()
    const reopening = page.waitForResponse(
      (response) => response.request().method() === 'POST' && response.url().includes(`/tasks/${taskId}/uncomplete`),
    )
    await reopen.click()
    expect((await reopening).status()).toBe(200)
    await expect(taskHeader.getByRole('checkbox', { name: 'Complete task', exact: true })).toBeVisible()
  })

  const label = `Browser label ${Date.now()}`
  await page.getByRole('button', { name: 'Labels: Add labels' }).click()
  await page.getByRole('button', { name: 'Create label' }).click()
  await page.getByRole('textbox', { name: 'Label name' }).fill(label)
  await page.getByRole('button', { name: 'Save label' }).click()
  await expect(page.getByRole('button', { name: `Labels: ${label}` })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('button', { name: `Labels: ${label}` })).toBeVisible()
  await page.getByRole('button', { name: `Labels: ${label}` }).click()
  await page.getByRole('button', { name: `Remove label ${label}` }).click()
  await expect(page.getByRole('button', { name: 'Labels: Add labels' })).toBeVisible()
})