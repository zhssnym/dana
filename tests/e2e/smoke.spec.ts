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
    // An account that has not answered gets "How did you hear about Dana?" once.
    const skip = page.getByRole('dialog', { name: 'How did you hear about Dana?' }).getByRole('button', { name: 'Skip' })
    await skip.waitFor({ timeout: 5_000 }).then(() => skip.click(), () => undefined)
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


test('tooltip: Work actions use the same styled hint as the sidebar', async ({ page }) => {
  await signIn(page)
  await page.goto(`/app/folders/${seedIds.groceries}`)

  const skip = page.getByRole('dialog', { name: 'How did you hear about Dana?' }).getByRole('button', { name: 'Skip' })
  await skip.waitFor({ timeout: 5_000 }).then(() => skip.click(), () => undefined)

  const filter = page.getByRole('button', { name: 'Filter tasks' })
  await expect(filter).toBeVisible()
  await filter.hover()
  await expect(filter).not.toHaveAttribute('title', /.+/)
  const filterTip = page.locator('[data-slot="tooltip-content"]').filter({ hasText: 'Filter tasks' })
  await expect(filterTip).toBeVisible()
  await expect(filterTip).toHaveClass(/bg-foreground/)

  const settings = page.getByRole('link', { name: 'Settings', exact: true }).last()
  await settings.hover()
  const settingsTip = page.locator('[data-slot="tooltip-content"]').filter({ hasText: 'Settings' })
  await expect(settingsTip).toBeVisible()
  await expect(settingsTip).toHaveClass(/bg-foreground/)
})


test('calendar: day plus shows Add a new task hint and still creates a draft', async ({ page }) => {
  await signIn(page)
  await page.goto(`/app/folders/${seedIds.groceries}`)

  const skip = page.getByRole('dialog', { name: 'How did you hear about Dana?' }).getByRole('button', { name: 'Skip' })
  await skip.waitFor({ timeout: 5_000 }).then(() => skip.click(), () => undefined)

  await page.getByRole('button', { name: /^Work view:/ }).click()
  await page.getByRole('menuitemradio', { name: 'Calendar' }).click()

  const calendar = page.getByRole('grid', { name: 'Work calendar' })
  await expect(calendar).toBeVisible()
  const day = calendar.getByRole('gridcell').first()
  const create = day.getByRole('button', { name: /^New task on / })
  await expect(create).toBeVisible()
  await expect(create).not.toHaveAttribute('title', /.+/)

  // The plus is decorative and lets pointer events pass through to the day action.
  // Move onto its visual position, not just the center of the cell.
  const plus = day.locator('svg[aria-hidden="true"]').first()
  const bounds = await plus.boundingBox()
  expect(bounds).not.toBeNull()
  await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2)
  const hint = page.locator('[data-slot="tooltip-content"]').filter({ hasText: 'Add a new task' })
  await expect(hint).toBeVisible()
  await expect(hint).toHaveClass(/bg-foreground/)

  await page.mouse.click(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2)
  await expect(day.getByRole('textbox', { name: /^New task on / })).toBeVisible()
})


test('navigation: a root Work tab and standalone places always show a breadcrumb', async ({ page }) => {
  await signIn(page)
  await page.goto('/app/today')
  const skip = page.getByRole('dialog', { name: 'How did you hear about Dana?' }).getByRole('button', { name: 'Skip' })
  await skip.waitFor({ timeout: 5_000 }).then(() => skip.click(), () => undefined)

  const breadcrumb = page.getByRole('navigation', { name: 'Breadcrumb' })
  await expect(breadcrumb).toBeVisible()
  await expect(breadcrumb.getByText('Today', { exact: true })).toBeVisible()
  await expect(breadcrumb.locator('[aria-current="page"]')).toHaveText('Today')

  await page.goto(`/app/folders/${seedIds.groceries}`)
  await expect(breadcrumb).toBeVisible()
  await expect(breadcrumb.getByText('Groceries', { exact: true })).toBeVisible()
  await expect(breadcrumb.getByRole('link', { name: 'Groceries' })).toHaveCount(0)
  await expect(breadcrumb.locator('[aria-current="page"]')).toHaveText('Work')

  await page.goto('/app/settings/archived-work')
  await expect(breadcrumb.getByRole('link', { name: 'Settings' })).toBeVisible()
  await expect(breadcrumb.locator('[aria-current="page"]')).toHaveText('Archived work')
  await breadcrumb.getByRole('link', { name: 'Settings' }).click()
  await expect(page).toHaveURL(/\/app\/settings$/)
  await expect(breadcrumb.locator('[aria-current="page"]')).toHaveText('Settings')
})


test('calendar: Upcoming expands overlapping ranges and opens a previously hidden Task', async ({ page }) => {
  await signIn(page)
  await page.goto('/app/scheduled')

  const skip = page.getByRole('dialog', { name: 'How did you hear about Dana?' }).getByRole('button', { name: 'Skip' })
  await skip.waitFor({ timeout: 5_000 }).then(() => skip.click(), () => undefined)

  const showCalendar = page.getByRole('button', { name: 'Show as calendar' })
  if (await showCalendar.isVisible()) await showCalendar.click()
  await page.getByRole('radiogroup', { name: 'Calendar zoom' }).getByRole('radio', { name: 'Month' }).click()

  const calendar = page.getByRole('grid', { name: 'Upcoming calendar' })
  const midMonth = calendar.locator('[data-date$="-15"]').first()
  await expect(midMonth).toBeVisible()
  const date = await midMonth.getAttribute('data-date')
  expect(date).not.toBeNull()
  const month = date!.slice(0, 7)

  // Three ranges covering the same week, with no need for extra single-day rows.
  const csrf = (await page.context().cookies()).find((cookie) => cookie.name === 'dana_csrf')?.value
  expect(csrf).toBeTruthy()
  const ids: string[] = []
  for (let index = 0; index < 3; index += 1) {
    const response = await page.request.post('/api/v1/tasks', {
      headers: { 'X-CSRF-Token': csrf! },
      data: {
        folder_id: seedIds.groceries,
        title: `Calendar expansion regression ${String(index + 1)}`,
        start_date: `${month}-12`,
        due_date: `${month}-18`,
      },
    })
    expect(response.status(), await response.text()).toBe(201)
    const task = (await response.json()) as { id: string }
    ids.push(task.id)
  }

  // A full reload also verifies server persistence rather than client-only rows.
  await page.reload()
  const listToggle = page.getByRole('button', { name: 'Show as calendar' })
  if (await listToggle.isVisible()) await listToggle.click()
  await page.getByRole('radiogroup', { name: 'Calendar zoom' }).getByRole('radio', { name: 'Month' }).click()

  const day = page.getByRole('grid', { name: 'Upcoming calendar' }).locator(`[data-date="${date!}"]`)
  const weekRow = day.locator('xpath=../..')
  const visibleRangeCount = async (): Promise<number> => {
    const visible = await Promise.all(ids.map(async (id) =>
      weekRow.locator(`button[data-task-id="${id}"]`).count()))
    return visible.filter((count) => count > 0).length
  }
  await expect(day.getByRole('button', { name: /^\+\d+ more$/ })).toBeVisible()
  expect(await visibleRangeCount()).toBe(2)

  await day.getByRole('button', { name: /^\+\d+ more$/ }).click()
  await expect.poll(visibleRangeCount).toBe(3)
  await expect(day.getByRole('button', { name: /^\+\d+ more$/ })).toHaveCount(0)

  const opened = weekRow.locator(`button[data-task-id="${ids[2]}"]`)
  await opened.click()
  await expect(page).toHaveURL(new RegExp(`/app/tasks/${ids[2]}$`))
  await expect(page.getByRole('textbox', { name: 'title' })).toHaveValue('Calendar expansion regression 3')
})


test('calendar: Upcoming resizes Start and Due dates with task edge grips', async ({ page }) => {
  await signIn(page)
  await page.goto('/app/scheduled')

  const skip = page.getByRole('dialog', { name: 'How did you hear about Dana?' }).getByRole('button', { name: 'Skip' })
  await skip.waitFor({ timeout: 5_000 }).then(() => skip.click(), () => undefined)

  const showCalendar = page.getByRole('button', { name: 'Show as calendar' })
  if (await showCalendar.isVisible()) await showCalendar.click()
  await page.getByRole('radiogroup', { name: 'Calendar zoom' }).getByRole('radio', { name: 'Month' }).click()

  // The preceding test creates busy ranges this month. Use the following month
  // so this test proves the edge controls without relying on expansion.
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  let calendar = page.getByRole('grid', { name: 'Upcoming calendar' })
  const midMonth = calendar.locator('[data-date$="-15"]').first()
  await expect(midMonth).toBeVisible()
  const week = midMonth.locator('xpath=../..')
  const dates = await week.locator('[role="gridcell"][data-date]').evaluateAll((cells) =>
    cells.map((cell) => cell.getAttribute('data-date') ?? ''),
  )
  expect(dates).toHaveLength(7)
  const startDate = dates[1]!
  const originalDue = dates[3]!
  const extendedDue = dates[5]!

  const csrf = (await page.context().cookies()).find((cookie) => cookie.name === 'dana_csrf')?.value
  expect(csrf).toBeTruthy()
  const create = async (title: string, start_date: string | null, due_date: string): Promise<string> => {
    const response = await page.request.post('/api/v1/tasks', {
      headers: { 'X-CSRF-Token': csrf! },
      data: { title, folder_id: seedIds.groceries, start_date, due_date },
    })
    expect(response.status(), await response.text()).toBe(201)
    return ((await response.json()) as { id: string }).id
  }

  const dueOnly = await create('Upcoming drag Start edge', null, originalDue)
  const ranged = await create('Upcoming drag Due edge', startDate, originalDue)
  await page.reload()
  const toggle = page.getByRole('button', { name: 'Show as calendar' })
  if (await toggle.isVisible()) await toggle.click()
  await page.getByRole('radiogroup', { name: 'Calendar zoom' }).getByRole('radio', { name: 'Month' }).click()
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  calendar = page.getByRole('grid', { name: 'Upcoming calendar' })

  const dragGripToDay = async (grip: ReturnType<typeof calendar.locator>, date: string): Promise<void> => {
    await expect(grip).toBeVisible()
    const from = await grip.boundingBox()
    const target = await calendar.locator('[role="gridcell"][data-date="' + date + '"]').boundingBox()
    expect(from).not.toBeNull()
    expect(target).not.toBeNull()
    await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2)
    await page.mouse.down()
    await page.mouse.move(target!.x + target!.width / 2, target!.y + target!.height / 2, { steps: 12 })
    await page.mouse.up()
  }
  const savedDates = async (id: string): Promise<{ start_date: string | null; due_date: string | null }> => {
    const response = await page.request.get('/api/v1/tasks/' + id)
    expect(response.status()).toBe(200)
    const task = (await response.json()) as { start_date: string | null; due_date: string | null }
    return { start_date: task.start_date, due_date: task.due_date }
  }

  // A due-only task can gain Start by pulling its left edge, without opening the task.
  const chip = calendar.locator('button[data-task-id="' + dueOnly + '"]')
  await dragGripToDay(chip.locator('[data-calendar-resize="start"]'), startDate)
  await expect.poll(() => savedDates(dueOnly)).toEqual({ start_date: startDate, due_date: originalDue })
  await expect(page).toHaveURL(/\/app\/scheduled$/)

  // A multi-day range can extend its Due from the right grip; its Start stays put.
  const range = calendar.locator('button[data-task-id="' + ranged + '"]').locator('xpath=..')
  await dragGripToDay(range.locator('[data-calendar-resize="due"]'), extendedDue)
  await expect.poll(() => savedDates(ranged)).toEqual({ start_date: startDate, due_date: extendedDue })
  await expect(page).toHaveURL(/\/app\/scheduled$/)
})


test('feedback: beta reminder collapses without hiding feedback and stays collapsed after reload', async ({ page }) => {
  await signIn(page)
  await page.goto('/app/today')
  const skip = page.getByRole('dialog', { name: 'How did you hear about Dana?' }).getByRole('button', { name: 'Skip' })
  await skip.waitFor({ timeout: 5_000 }).then(() => skip.click(), () => undefined)

  const sidebar = page.getByRole('navigation', { name: 'Pages' })
  await expect(sidebar.getByText('Help shape Dana')).toBeVisible()
  await expect(sidebar.getByRole('button', { name: 'Send feedback' })).toHaveCount(0)

  await sidebar.getByRole('button', { name: 'Share feedback' }).click()
  const feedback = page.getByRole('dialog', { name: 'Send feedback' })
  await expect(feedback).toBeVisible()
  await feedback.getByRole('button', { name: 'Close' }).click()

  await sidebar.getByRole('button', { name: 'Collapse feedback reminder' }).click()
  await expect(sidebar.getByRole('button', { name: 'Feedback', exact: true })).toBeVisible()
  await expect(sidebar.getByText('Help shape Dana')).toHaveCount(0)
  await expect.poll(async () => {
    const response = await page.request.get('/api/v1/settings')
    return ((await response.json()) as { feedback_reminder_dismissed: boolean }).feedback_reminder_dismissed
  }).toBe(true)

  await page.reload()
  await expect(sidebar.getByRole('button', { name: 'Feedback', exact: true })).toBeVisible()
  await expect(sidebar.getByText('Help shape Dana')).toHaveCount(0)
  await sidebar.getByRole('button', { name: 'Feedback', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Send feedback' })).toBeVisible()
})
