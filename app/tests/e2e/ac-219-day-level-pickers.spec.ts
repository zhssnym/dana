/*
AC-219: given the due picker, then it offers no time-of-day control; given
the reminder picker on a dated task, then it offers a time on that day.

Appended to section 12 by RFC 0005, Accepted 2026-08-24, and transcribed
unchanged. It is DES-178 as a criterion: a due date is a day, the due-time
deferred rather than dropped, and the reminder is where a clock time lives
(4.8's time_of_day mode, whose server half AC-212 already pins). Red until
S11 lands the v2 pickers.

**Both halves are asserted on one dated task**, a fresh one this case
creates, because the pair is the point: the same surface that refuses a time
on the due chip must offer one on the reminder chip, and a client that
strips time everywhere or offers it everywhere each fail exactly one half.

**"No time-of-day control" is asserted as no time input inside the open due
picker.** 9.3's v2 table says the pickers offer no time of day; what a
criterion can hold is that the opened picker contains no control a person
could put a clock time into: no spinbutton or textbox named for hours or
minutes, no input whose type is time.

Spec: 9.3 (the v2 chip table: due date "a day; the pickers offer no time of
day", reminder "one picker, a time on that day, writing 4.8's time_of_day
mode"), 4.8 (the mode), DES-178, AC-212 (the server half).
*/
import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  caseTitle,
  clickControl,
  createTask,
  seedDate,
  seedIds,
  seedSubs,
  signIn,
  TEST_TIMEOUT_MS,
} from './harness.js'

test.use({ timezoneId: 'UTC', actionTimeout: ACTION_TIMEOUT_MS })
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

/** Any control inside `surface` that takes a clock time. */
function timeControls(surface: Locator): Locator {
  return surface
    .locator('input[type="time"]')
    .or(surface.getByRole('spinbutton', { name: /hour|minute/i }))
    .or(surface.getByRole('textbox', { name: /time/i }))
    .or(surface.getByRole('combobox', { name: /time/i }))
}

async function openTaskSurface(page: Page, title: string): Promise<void> {
  await clickControl(
    page.getByRole('main').getByText(title).first(),
    'spec 9.3: a row opens its task; the surface under test is the task\'s own',
  )
}

test.describe('AC-219: day-level due, clocked reminder', () => {
  test('AC-219: the due picker offers no time of day', async ({ page }) => {
    const title = caseTitle('Dated errand, due half')
    await signIn(page, seedSubs.hassan)
    await createTask(page, {
      title,
      folder_id: seedIds.groceries,
      due_date: seedDate(1),
    })
    await page.goto(`/app/folders/${seedIds.groceries}`)
    await openTaskSurface(page, title)

    await clickControl(
      page.getByRole('button', { name: /due/i }).first(),
      'spec 9.3: the due date chip opens its picker in place. The v1 surface is the ' +
        'red this shows until S11 lands the v2 card',
    )
    const picker = page.getByRole('dialog').last()
    await expect(
      picker.getByRole('grid').or(picker.getByRole('gridcell').first()),
      'spec 9.3: the due picker opens on a day grid, a due date being a day (DES-178)',
    ).toBeVisible()
    await expect(
      timeControls(picker),
      'spec 9.3: "the pickers offer no time of day" on the due chip; a stored v1 ' +
        'due_time is displayed and clearable, never settable, so no control here takes ' +
        'a clock time',
    ).toHaveCount(0)
  })

  test('AC-219: the reminder picker on a dated task offers a time on that day', async ({
    page,
  }) => {
    const title = caseTitle('Dated errand, reminder half')
    await signIn(page, seedSubs.hassan)
    await createTask(page, {
      title,
      folder_id: seedIds.groceries,
      due_date: seedDate(1),
    })
    await page.goto(`/app/folders/${seedIds.groceries}`)
    await openTaskSurface(page, title)

    await clickControl(
      page.getByRole('button', { name: /reminder/i }).first(),
      'spec 9.3: the reminder chip opens its picker; the task is dated, so the picker ' +
        'is offered rather than the "Set a due date first" helper',
    )
    const picker = page.getByRole('dialog').last()
    await expect(
      timeControls(picker).first(),
      'spec 9.3: the reminder is "one picker, a time on that day, writing 4.8\'s ' +
        'time_of_day mode", so a control taking a clock time is here; AC-212 pins what ' +
        'the write stores and the 11.7 pass does with it',
    ).toBeVisible()
  })
})
