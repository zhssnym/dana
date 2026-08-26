/*
AC-241: given the Settings page, then its Views section lists every native
view of 9.1's page block and every view the viewer has saved, each with its
own mark, its one-line question and a pin switch, and Desk's switch is
disabled beside the note 9.7 fixes for it; and when a pinned view's switch is
turned off, then the sidebar stops listing that view and still does not list
it after a reload, the choice having been written through 4.19 rather than
held in the page.

**What this replaces is three booleans that could only ever describe v1.**
`SettingsPage.tsx` shipped Important, All and Done as named switches under a
note reading "My Day, Tasks, and Planned are always shown", which names three
pages Dana no longer has. RFC 0005 item 9 records why nobody fixed it: the
Settings rewrite was given to no package. Item 6 records that the machinery
was finished anyway, at S7, so every part of this has existed for a day and a
half except the control.

**The list is asserted as a list rather than as names.** 9.7's sentence is
"every view Dana has, native and saved alike", and a client that hardcodes
nine rows satisfies every assertion naming nine views while still being the
thing this criterion exists to stop: a settings page that has to be edited
whenever a view is added. So the native half is asserted over 9.1's page
block whole, and the saved half is asserted with a view this file makes,
which no hardcoded list can contain.

**The saved view this file makes is unpinned**, which is the state item 9
says had no surface that could reach it: "Save as view" writes `pinned: true`
only because a view saved unpinned was a view with no address. An unpinned
view appearing in this list, with a switch that can pin it, is the evidence
that the interim can end.

**The pin write is read back across a reload**, and through the sidebar
rather than through the wire, because the fault this guards is the one every
preference surface can have: a switch that moves, looks right, and stored
nothing. 4.19's column is where it has to land, and a reload is the only
reader that cannot be fooled by the page's own state.

**The file restores the pins it changes.** The runner seeds once and every
spec in this leg reads the same sidebar, so a view left unpinned here would
change what they see; restored through the API rather than through the page,
so the restoration cannot fail for the reason the test is about. Its own
saved view is deleted for the same reason.

Spec: 9.7 (the Views pin list and Desk's note), 9.1 (the page block and its
fixed order), 4.19 (`pinned_views` and `user_views`), RFC 0005 change control
items 6 and 9, DES-153, DES-170, DES-222.
*/
import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  createSavedView,
  DEFAULT_PINS,
  deleteSavedView,
  patchBundle,
  routesV2,
  seedSubs,
  sidebarLink,
  signIn,
  TEST_TIMEOUT_MS,
} from './harness.js'

test.use({ timezoneId: 'UTC', actionTimeout: ACTION_TIMEOUT_MS })
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

/**
 * 9.1's page block, whole, with the question DES-152 gives each page.
 *
 * Every view Dana has natively, not the six that ship pinned: the three that
 * ship unpinned are exactly the rows a person opens this page to find, and a
 * list carrying only what is already in the sidebar would be a list of what
 * you can turn off.
 */
const NATIVE_VIEWS = [
  { name: 'Desk', question: 'Nothing decided about it yet' },
  { name: 'Today', question: 'What I am doing today' },
  { name: 'Scheduled', question: 'Everything with a date' },
  { name: 'Assignments', question: "Who's carrying what" },
  { name: 'Important', question: 'Starred tasks' },
  { name: 'All', question: 'Every task, finished ones included' },
  { name: 'Done', question: 'Everything you have finished' },
  { name: 'Abandoned', question: 'Things you decided not to do' },
  { name: 'Anytime', question: 'No date on it, whenever you get to it' },
] as const

/** 9.7, verbatim: the note that stands where the one locked row is. */
const DESK_NOTE =
  'Desk cannot be unpinned: it is where a task goes when you have not said ' +
  'where, so it has to stay reachable.'

/**
 * A view's pin switch, named for what it does to the view it names.
 *
 * Named rather than positional: 9.7 gives each row "the page's own mark, its
 * one-line question, and a pin switch", so the switch belongs to a named view
 * and a criterion that counted switches could not say which was which.
 */
function pinSwitch(page: Page, view: string): Locator {
  return page.getByRole('switch', { name: `Pin ${view} to the sidebar`, exact: true })
}

test.beforeEach(async ({ page }) => {
  await signIn(page, seedSubs.hassan)
})

test.afterEach(async ({ page }) => {
  await patchBundle(page, { pinned_views: [...DEFAULT_PINS] })
})

test.describe('AC-241: Settings is a pin list', () => {
  test('AC-241: every native view is a row with its question and a pin switch', async ({
    page,
  }) => {
    await page.goto(routesV2.settings)

    const views = page.getByRole('region', { name: 'Views' })
    await expect(
      views,
      'spec 9.7: Settings carries a named region per section and the first is Views. 9.1\'s ' +
        'sections rule makes each a landmark, which is how a criterion addresses a control ' +
        'as that control within that region',
    ).toBeVisible()

    for (const view of NATIVE_VIEWS) {
      await expect(
        pinSwitch(page, view.name),
        `spec 9.7: "every view Dana has, native and saved alike, each with ... a pin ` +
          `switch". ${view.name} is one of 9.1's nine, and a list carrying only the six ` +
          'that ship pinned is a list of what you can turn off rather than of what you have',
      ).toBeVisible()

      await expect(
        views.getByText(view.question, { exact: true }),
        `spec 9.7: each row carries "its one-line question", and DES-152 gives ${view.name} ` +
          `${JSON.stringify(view.question)}. The sidebar and this list draw one page, so a ` +
          'second description of it written here would be the thing the pin list exists to ' +
          'stop',
      ).toBeVisible()
    }
  })

  test('AC-241: Desk is locked, and the note says why', async ({ page }) => {
    await page.goto(routesV2.settings)

    await expect(
      pinSwitch(page, 'Desk'),
      'spec 9.7: Desk carries a switch like every other row, so the list has no special ' +
        'case in it',
    ).toBeVisible()
    await expect(
      pinSwitch(page, 'Desk'),
      'spec 9.7: "Desk locked". A row rendered without a switch, or with one that answers ' +
        'to a press, both fail the same sentence: Desk is where a task goes when nobody ' +
        'chose, so a person who could hide it would go on filling it with no way back',
    ).toBeDisabled()
    await expect(
      pinSwitch(page, 'Desk'),
      'and locked pinned rather than locked off',
    ).toBeChecked()

    await expect(
      page.getByText(DESK_NOTE),
      'spec 9.7, verbatim: the note is normative copy and stands beside the one locked row ' +
        'rather than as a list of names somebody has to keep in step with the page set',
    ).toBeVisible()
  })

  test('AC-241: a view the viewer saved is in the list too', async ({ page }) => {
    /*
    Unique per case, and **not** through `caseTitle`, which cannot be used
    for a saved view at all: 4.19 caps a view's name at 40 characters and
    that helper's uniqueness tag is a 41-character test id, so every name it
    builds is refused with 422 before the case starts. The tail of the same
    id carries the same two properties the helper documents, stable across
    runs and distinct between any two cases, and leaves room for a name.
    */
    const name = `ac-241 view ${test.info().testId.slice(-12)}`
    // Unpinned, which is the state item 9 says nothing could reach: this list
    // is the surface that ends that interim, so the fixture is the interim.
    const view = await createSavedView(page, name, { page: 'scheduled' }, false)
    try {
      await page.goto(routesV2.settings)

      await expect(
        pinSwitch(page, name),
        'spec 9.7: "every view Dana has, native and saved alike". A client rendering nine ' +
          'hardcoded rows passes every assertion naming a native view and fails here, which ' +
          'is the difference between a list of views and a list of the views v2 shipped with',
      ).toBeVisible()
      await expect(
        pinSwitch(page, name),
        'spec 4.19: the fixture was saved unpinned, so the switch shows it unpinned. RFC ' +
          '0005 item 9: a view saved unpinned had no surface that could ever reach it, and ' +
          'this is that surface',
      ).not.toBeChecked()
    } finally {
      await deleteSavedView(page, view.id)
    }
  })

  test('AC-241: unpinning writes through 4.19 and survives a reload', async ({ page }) => {
    await page.goto(routesV2.settings)
    await expect(
      pinSwitch(page, 'Important'),
      'spec 9.7: Important ships pinned, which is the state this case turns off',
    ).toBeChecked()

    await pinSwitch(page, 'Important').click()
    await expect(
      pinSwitch(page, 'Important'),
      'the switch took the press, which is the half a client can satisfy while storing ' +
        'nothing',
    ).not.toBeChecked()

    await page.goto(routesV2.desk)
    await expect(
      sidebarLink(page, 'Important'),
      "spec 9.7 and 9.1: turning a view off is what takes its entry out of the sidebar's " +
        'page block',
    ).toHaveCount(0)

    // The reader that cannot be fooled by the page's own state.
    await page.reload()
    await expect(
      sidebarLink(page, 'Important'),
      'spec 4.19: the pin list is a stored column, so the choice outlives the page that ' +
        'made it. A switch that moves, looks right and stored nothing passes every ' +
        'assertion above this line',
    ).toHaveCount(0)

    await page.goto(routesV2.settings)
    await expect(
      pinSwitch(page, 'Important'),
      'and the control reads the same record back, so the page and the sidebar are one ' +
        'answer rather than two',
    ).not.toBeChecked()
  })

  test('AC-241: pinning an unpinned view puts it in the sidebar', async ({ page }) => {
    await page.goto(routesV2.desk)
    await expect(
      sidebarLink(page, 'Done'),
      'spec 9.7: "Done, Abandoned and Anytime ship unpinned", which is the state this case ' +
        'reverses',
    ).toHaveCount(0)

    await page.goto(routesV2.settings)
    await pinSwitch(page, 'Done').click()

    await page.goto(routesV2.desk)
    await expect(
      sidebarLink(page, 'Done'),
      'spec 9.7 and 9.1: a pinned view is an entry in the page block. That the switch works ' +
        'in both directions is what makes it a preference rather than a one-way door',
    ).toBeVisible()
  })
})
