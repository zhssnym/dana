/*
AC-156 (proposed): given the search overlay of 9.9, then both shortcuts open
it, the input debounces at 300 ms, results render grouped under Pending,
Abandoned and Completed, enter opens the first result, and the footer carries
its copy.

**The number is provisional**, authored on this branch with its test for the
mid-package change control, from AC-154 onward because P7 is concurrently
proposing AC-144 to AC-153 and merges first. See `ac-154-quick-add-row.spec.ts`.

9.9 is nine lines and every one of them states a rule; section 12 asserts
none of them, and AC-057, AC-127, AC-128 and AC-131 between them cover the
predicate, the paging, the length limits and the escaping on the server and
stop at the wire. The overlay is where a person meets all of that.

**The debounce is the half worth the number.** 300 ms is a number the
specification states, which is the standard the P4 batch was admitted under,
and it is a rate limit in disguise: 10.4 allows a user 30 searches a minute,
so a client issuing one request per keystroke spends that budget in one
word and answers the person a 429 for typing. It is asserted by counting the
requests a burst of typing produced, which is what a debounce is, rather
than by timing anything, which would be asserting the implementation's
timer.

**Grouping is asserted with all three statuses present at once**, because
the grouping and the ordering are the same rule read two ways: Q8 sorts by
status_rank over all three ranks, so a client that renders the server's
order without headings looks correct until two rows of different statuses
sit next to each other.

Spec: 9.9 (the overlay), 9.1 (the shortcuts and the top-bar control), 6 Q8
(the predicate, the three ranks, the page size), 10.4.
*/
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  clickControl,
  createTask,
  fieldValue,
  fillControl,
  formField,
  routes,
  seedIds,
  seedSubs,
  signIn,
  TEST_TIMEOUT_MS,
  transition,
  watchWire,
} from './harness.js'

test.use({ timezoneId: 'UTC', actionTimeout: ACTION_TIMEOUT_MS })
// Raised from Playwright's 30 second default so a red names its assertion
// rather than the clock, for the reason recorded at TEST_TIMEOUT_MS.
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

const TOKEN = 'ac156token'
const PENDING = `${TOKEN} pending row`
const ABANDONED = `${TOKEN} abandoned row`
const COMPLETED = `${TOKEN} completed row`

/** The overlay's input, which is the only text entry it puts on the page. */
function searchInput(page: Page) {
  return page.getByRole('searchbox').or(page.getByRole('textbox')).first()
}

test.beforeEach(async ({ page }) => {
  await signIn(page, seedSubs.hassan)
})

test.describe('AC-156 (proposed): the search overlay', () => {
  test('AC-156: both shortcuts of 9.1 open the overlay', async ({ page }) => {
    await page.goto(routes.myDay)

    await page.keyboard.press('Control+k')
    await expect(
      searchInput(page),
      'spec 9.1: the global search control has the keyboard shortcut Ctrl+K, and 9.9 says the ' +
        'overlay is opened by the top-bar control or the shortcut',
    ).toBeFocused()
    await page.keyboard.press('Escape')

    await page.keyboard.press('/')
    await expect(
      searchInput(page),
      'spec 9.1 gives the search control two shortcuts, Ctrl+K or /, and an implementation ' +
        'wiring one of them satisfies every reading of 9.9 that does not count them',
    ).toBeFocused()
    await page.keyboard.press('Escape')

    await clickControl(
      page.getByRole('button', { name: /search/i }),
      'spec 9.1: the top bar carries a global search control, which 9.9 says opens the overlay',
    )
    await expect(
      searchInput(page),
      'spec 9.1: the top-bar control opens it too, which is the path for a person who does ' +
        'not know either shortcut',
    ).toBeFocused()
  })

  test('AC-156: typing a word issues one search, not one per keystroke', async ({ page }) => {
    const wire = watchWire(page)
    await page.goto(routes.myDay)
    await page.keyboard.press('Control+k')

    // Typed with no delay between characters, which is what a debounce is
    // for and what a person does.
    await searchInput(page).pressSequentially('plumber', { delay: 0 })
    await page.waitForTimeout(1_000)

    const searches = wire.calls.filter((call) => call.url.includes('/api/v1/search'))
    expect(
      searches.length,
      'spec 9.9: the input debounces at 300 ms, so seven characters typed together are one ' +
        `search and not seven. The client issued ${searches.length}: ` +
        `${JSON.stringify(searches.map((call) => call.url))}. 10.4 allows 30 searches a ` +
        'minute, so a request per keystroke spends the budget in one word and answers the ' +
        'person a 429 for typing',
    ).toBeLessThanOrEqual(2)
    expect(
      searches.length,
      'a debounce that never fires is not a debounce: the word was typed and one search has ' +
        'to have gone',
    ).toBeGreaterThan(0)
  })

  test('AC-156: results group under the three status headings and the footer is present', async ({
    page,
  }) => {
    await createTask(page, { title: PENDING, folder_id: seedIds.groceries })
    const abandoned = await createTask(page, {
      title: ABANDONED,
      folder_id: seedIds.groceries,
    })
    const completed = await createTask(page, {
      title: COMPLETED,
      folder_id: seedIds.groceries,
    })
    await transition(page, abandoned.id, 'abandon', 'UTC')
    await transition(page, completed.id, 'complete', 'UTC')

    await page.goto(routes.myDay)
    await page.keyboard.press('Control+k')
    await fillControl(
      searchInput(page),
      TOKEN,
      'spec 9.9: the overlay carries the input its results are typed into',
    )

    for (const [heading, row] of [
      ['Pending', PENDING],
      ['Abandoned', ABANDONED],
      ['Completed', COMPLETED],
    ] as const) {
      await expect(
        page.getByRole('heading', { name: heading }),
        `spec 9.9: results are grouped under Pending, Abandoned and Completed headings, and ` +
          `6 Q8 admits all three statuses. Without the headings the page is Q8's status_rank ` +
          'order with nothing saying what changed between two adjacent rows',
      ).toBeVisible()
      await expect(
        page.getByText(row),
        `the ${heading} group has the row that belongs in it`,
      ).toBeVisible()
    }

    await expect(
      page.getByText('Showing matches from every folder you can access.'),
      'spec 9.9: the overlay carries this footer, and copy in section 9 is normative. It is ' +
        'the one thing on the page that tells a person the scope they are searching, which is ' +
        '6 Q8\'s ACCESSIBLE(V) and not the folder they were looking at',
    ).toBeVisible()
  })

  test('AC-156: enter opens the first result', async ({ page }) => {
    await createTask(page, { title: PENDING, folder_id: seedIds.groceries })

    await page.goto(routes.myDay)
    await page.keyboard.press('Control+k')
    await fillControl(
      searchInput(page),
      TOKEN,
      'spec 9.9: the overlay carries the input its results are typed into',
    )
    await expect(
      page.getByText(PENDING),
      'spec 9.9: the results are on screen before enter is pressed, so what enter opens is a ' +
        'result rather than nothing',
    ).toBeVisible()
    await page.keyboard.press('Enter')

    // Q8 sorts by status_rank first, so the pending row is the first result
    // whatever else the token matches, which is what makes "the first" a
    // thing this file can name in advance.
    expect(
      await fieldValue(formField(page, 'title')),
      'spec 9.9: enter opens the first result, and 6 Q8 ranks pending first. Enter opening ' +
        'nothing, or opening whichever row the pointer last touched, is the same page to look ' +
        'at and a different application to use',
    ).toBe(PENDING)
  })
})
