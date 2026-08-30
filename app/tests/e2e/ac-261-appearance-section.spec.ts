/*
AC-261: given the Settings page, then it carries an Appearance region offering
the theme, the row density, the clock and where a task opens, which are 9.7's
four; and when a theme and a clock are chosen there, then the application
draws in that theme and writes a timed row's time on that clock, and both are
still in force after a full reload, having been written through 4.19 rather
than held in the page.

**The reload is what makes this a criterion about 4.19 rather than about a
toggle.** A control that changed nothing but its own appearance would pass any
assertion made on the page it lives on. The four fields have been stored since
S7, `shared/bundle.ts` carrying `theme`, `row_density`, `clock` and
`task_open`, and `pages/SettingsPage.tsx` renders Pages, Account and Danger
zone with no control for any of them, which change control item 30 records as
the defect exactly: "the client therefore persists four preferences a person
has no way to set". So the failure this refuses is not the missing control,
which is obvious; it is the control that arrives and writes nowhere.

**Each control is asserted to drive something, because a switch that changes
no row is the same defect one level down.** The theme is read off the document
rather than off the switch: `styles/tokens.css` carries a complete dark
colourway under `[data-theme="dark"]`, authored at DES-205 and reached by
nothing, its own comment saying "it changes nothing today: no code adds that
class". The clock is read off a task's own row, which is where a person meets
it: `lib/time-format.ts` is the one place a time becomes words and every
surface goes through it. Neither assertion can be satisfied by writing the
column alone.

**The clock has two records today and this criterion is why that has to end.**
`lib/time-format.ts` keeps the preference in `localStorage` under
`dana.timeFormat`, and its own header says the account-level version "needs a
column, an endpoint and therefore an RFC". 4.19 is that column and `/settings`
is that endpoint, both live since S7, so the RFC the file is waiting for has
landed. A client that left the localStorage store in place and wrote the
column beside it would hold two records of one fact, which is the shape change
control item 6 refused for the pin list; the reload below is what catches it,
a fresh document reading the bundle rather than the browser's own memory.

**The density's visible half is asserted narrowly and deliberately.** 9.7 names
"row density (comfortable, compact)" and DES-113's fuller reading, a row of two
lines against a row of one, belongs to the v2 task row that S15's log row
records as not ported. So this asserts that the choice is offered, that it is
written, and that it survives a reload, and it does not assert a row shape the
component cannot yet take. That is a narrower promise than DES-113's and it is
the one 9.7 makes.

Spec: 9.7 (the Appearance section and its four controls, and Settings' sections
as named regions), 4.19 (the bundle that stores them), 11.4 (tokens.css as the
one place a colour lives, which is what the theme switches), DES-205 (theme
under Appearance and nowhere else), DES-113, and RFC 0005 change control item
30, which assigns this section to S17b.
*/
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  caseTitle,
  clickControl,
  createFolder,
  createTask,
  deleteFolder,
  patchBundle,
  routesV2,
  seedSubs,
  signIn,
  TEST_TIMEOUT_MS,
} from './harness.js'

test.use({ timezoneId: 'UTC', actionTimeout: ACTION_TIMEOUT_MS })
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

interface Fixture {
  folderId: string
  taskTitle: string
}

/** 9.7's Appearance region, addressed as the named region that section makes it. */
function appearance(page: Page) {
  return page.getByRole('region', { name: 'Appearance' })
}

/**
 * What the document is drawing in, which is where a theme is real.
 *
 * `tokens.css` keys its dark colourway off `[data-theme="dark"]` on the root
 * element, so the attribute is the mechanism as well as the evidence. The
 * global is reached through `globalThis` rather than the ambient `document`,
 * this suite's own idiom, the acceptance tsconfig carrying no DOM lib.
 */
async function themeAttribute(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const view = globalThis as unknown as {
      document: { documentElement: { getAttribute: (name: string) => string | null } }
    }
    return view.document.documentElement.getAttribute('data-theme')
  })
}

test.describe('AC-261: Settings carries Appearance', () => {
  let fixture: Fixture

  test.beforeEach(async ({ page }) => {
    await signIn(page, seedSubs.hassan)
    const folder = await createFolder(page, caseTitle('ac-255 folder'))
    const taskTitle = caseTitle('ac-255 timed')
    /* A task with a due time, which is the row a clock is read off. 9.7's
       clock decides how a time is written and never which times exist. */
    await createTask(page, {
      title: taskTitle,
      folder_id: folder.id,
      due_date: '2026-12-01',
      due_time: '17:30',
    })
    fixture = { folderId: folder.id, taskTitle }
  })

  test.afterEach(async ({ page }) => {
    /* The bundle is the account's and outlives the case, so the four fields
       go back to what a fresh account carries rather than to whatever the
       last assertion left. */
    await patchBundle(page, {
      theme: 'system',
      row_density: 'comfortable',
      clock: '12h',
      task_open: 'dialog',
    })
    await deleteFolder(page, fixture.folderId)
  })

  test('AC-261: the region offers 9.7\'s four controls', async ({ page }) => {
    await page.goto(routesV2.settings)

    await expect(
      appearance(page),
      'spec 9.7: "Appearance, the theme control (system, light, dark); row density ' +
        '(comfortable, compact); the clock (12-hour, 24-hour); where a task opens (dialog, ' +
        'panel, tab)". SettingsPage.tsx renders Pages, Account and Danger zone and its own ' +
        'header says these are unbuilt',
    ).toBeVisible()

    /* 'Row height' since S27: 9.7 names the preference row density and the
       prototype's control, lifted whole, names itself by what a row has
       (RFC 0005 change control item 55). */
    for (const name of ['Theme', 'Row height', 'Clock', 'Where a task opens']) {
      await expect(
        appearance(page).getByRole('group', { name }).or(
          appearance(page).getByRole('radiogroup', { name }),
        ).first(),
        `spec 9.7 names ${name} among Appearance's four, and 9.1's addressing rule makes a ` +
          'control reachable by its role and its name within the region that holds it',
      ).toBeVisible()
    }
  })

  test('AC-261: a chosen theme draws the application and survives a reload', async ({ page }) => {
    await page.goto(routesV2.settings)

    await clickControl(
      appearance(page).getByRole('radio', { name: 'Dark', exact: true }),
      'spec 9.7 and DES-205: three states rather than a switch, and the theme lives here',
    )

    await expect
      .poll(
        () => themeAttribute(page),
        {
          message:
            'spec 11.4 and styles/tokens.css: a complete dark colourway sits under ' +
            '[data-theme="dark"], authored at DES-205, and that file\'s own comment says ' +
            '"it changes nothing today: no code adds that class". A control that switches ' +
            'to nothing is a control that lies',
        },
      )
      .toBe('dark')

    /* Polled rather than read once, and the distinction is the mechanism
       rather than flakiness: a fresh document paints 4.19's default while the
       bundle read is in flight and takes the stored value when it answers, so
       the honest question is "does it end up dark" rather than "is it dark on
       the first frame". A control that stored nothing never reaches it. */
    await page.reload()
    await expect
      .poll(() => themeAttribute(page), {
        message:
          'spec 4.19: the choice is written to the bundle, so a fresh document reads it ' +
          'back. A control holding the value in page state passes the assertion above and ' +
          'fails this one',
      })
      .toBe('dark')

    /* And it is the application's, not the Settings page's: the theme follows
       the person onto every page, which is what one document attribute means. */
    await page.goto(routesV2.today)
    await expect
      .poll(() => themeAttribute(page), {
        message:
          'DES-205 puts the theme under Appearance because it is "about how Dana draws", ' +
          'which is every page rather than the one carrying the control',
      })
      .toBe('dark')
  })

  test('AC-261: a chosen clock writes a row\'s time and survives a reload', async ({ page }) => {
    await page.goto(routesV2.folder(fixture.folderId))
    const row = page.getByRole('listitem').filter({ hasText: fixture.taskTitle }).first()
    await expect(row).toBeVisible()

    await expect(
      row,
      'lib/time-format.ts: 12-hour is the default, ruled 2026-08-18, and this is the one ' +
        'place a time becomes words',
    ).toContainText('5:30 PM')

    await page.goto(routesV2.settings)
    await clickControl(
      appearance(page).getByRole('radio', { name: '24-hour', exact: true }),
      'spec 9.7: the clock is 12-hour or 24-hour, and the setting decides how a time is ' +
        'written, never which times can be reached',
    )

    await page.goto(routesV2.folder(fixture.folderId))
    await expect(
      page.getByRole('listitem').filter({ hasText: fixture.taskTitle }).first(),
      'the clock is read off the row, which is where a person meets it, rather than off the ' +
        'control that set it',
    ).toContainText('17:30')

    await page.reload()
    await expect(
      page.getByRole('listitem').filter({ hasText: fixture.taskTitle }).first(),
      'spec 4.19: lib/time-format.ts keeps this in localStorage under dana.timeFormat and its ' +
        'header says an account-level version "needs a column, an endpoint and therefore an ' +
        'RFC". 4.19 is that column and /settings is that endpoint, both live since S7, so two ' +
        'records of one fact is the failure this reload catches',
    ).toContainText('17:30')
  })

  test('AC-261: a chosen density survives a reload', async ({ page }) => {
    await page.goto(routesV2.settings)

    await clickControl(
      appearance(page).getByRole('radio', { name: 'One line', exact: true }),
      "spec 9.7: row density is comfortable or compact, drawn in the prototype's words as " +
        'Two lines and One line since S27',
    )

    await page.reload()
    await expect(
      appearance(page).getByRole('radio', { name: 'One line', exact: true }),
      'spec 4.19: the density is a column of the bundle, so the control reads its own value ' +
        'back after a reload rather than resetting to the default. DES-113\'s fuller reading, ' +
        'two lines against one, belongs to the v2 task row S15 records as not ported, and is ' +
        'deliberately not asserted here',
    ).toBeChecked()
  })
})
