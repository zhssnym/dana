/*
AC-164 (proposed): given the important-only toggle on My Day, then it filters
the rows already fetched and issues no request, and turning it off restores
them without one either.

**The number is provisional**, authored on this branch with its test for the
mid-package change control, from AC-154 onward because P7 is concurrently
proposing AC-144 to AC-153 and merges first. See `ac-154-quick-add-row.spec.ts`.

Q1's closing line is the rule: "The important toggle is a client-side filter
to important = true within already-fetched groups; it changes no query." Two
sections say it and nothing asserts it. It is one of the two places the RFC
0001 P8 row rules that a decision the server never makes belongs to the
client, and that ruling has a named consequence which is what makes the
criterion worth having: a filter applied after a capped response filters what
survived the cap, section 13 item 6's accepted bet reaching the client for
the first time. A client that instead asked the server for important rows
would not be a smaller bet, it would be a second grouping of My Day that no
query defines and that GET /views/my-day offers no parameter for.

**"Changes no query" is asserted by counting requests, which is the only way
it can be.** The rows on screen look the same whether they were filtered
locally or refetched, so the difference is entirely on the wire. A refetch
also loses the pull: an entry-pulled row that is not important would come
back or not depending on a predicate Q1 does not have.

**Both directions are asserted.** Turning the filter off restores rows the
client already had, so an implementation that filters the fetched data
destructively passes the first half and shows an emptied page on the second.

Spec: 6 Q1 (the toggle is a client-side filter and changes no query), 9.4
(the important-only toggle switch), 7.10, section 13 item 6.
*/
import { expect, test } from '@playwright/test'

import {
  createTask,
  routes,
  seedDate,
  seedIds,
  seedSubs,
  signIn,
  taskRow,
  TEST_TIMEOUT_MS,
  watchWire,
} from './harness.js'

test.use({ timezoneId: 'UTC' })
// Raised from Playwright's 30 second default so a red names its assertion
// rather than the clock, for the reason recorded at TEST_TIMEOUT_MS.
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

const PLAIN = 'ac-164 due today and not important'
const STARRED = 'ac-164 due today and important'

test.describe('AC-164 (proposed): the important-only toggle is local', () => {
  test('AC-164: toggling filters the fetched rows and sends nothing', async ({ page }) => {
    const wire = watchWire(page)
    await signIn(page, seedSubs.hassan)

    await createTask(page, {
      title: PLAIN,
      folder_id: seedIds.groceries,
      due_date: seedDate(0),
      assignee_id: seedIds.hassan,
    })
    await createTask(page, {
      title: STARRED,
      folder_id: seedIds.groceries,
      due_date: seedDate(0),
      assignee_id: seedIds.hassan,
      important: true,
    })

    await page.goto(routes.myDay)
    await expect(
      taskRow(page, PLAIN),
      'spec 6 Q1: an unimportant task due today and assigned to the viewer is in the Today ' +
        'group, which is the row the filter has to remove',
    ).toBeVisible()
    await expect(
      taskRow(page, STARRED),
      'spec 6 Q1: the important row is there too, which is the row the filter has to keep',
    ).toBeVisible()

    const before = wire.viewCalls().length
    expect(
      before,
      'the page fetched My Day, so the count below is a comparison rather than two zeros',
    ).toBeGreaterThan(0)

    await page.getByRole('switch', { name: /important/i }).click()

    await expect(
      taskRow(page, PLAIN),
      'spec 6 Q1: the toggle filters to important = true within the already-fetched groups',
    ).toHaveCount(0)
    await expect(
      taskRow(page, STARRED),
      'spec 6 Q1: the important rows stay',
    ).toBeVisible()

    // Give a refetch every chance to appear before the count is read: an
    // assertion that nothing happened is worth only as much as the time it
    // waited.
    await page.waitForTimeout(1_000)
    expect(
      wire.viewCalls().length,
      'spec 6 Q1: "it changes no query". GET /views/my-day offers no parameter for this, so a ' +
        'client that refetched would be asking the server for a grouping section 6 does not ' +
        'define. The rows look the same either way, which is why this is asserted on the wire ' +
        `and not on the page. Requests before: ${before}, after: ${wire.viewCalls().length}`,
    ).toBe(before)
  })

  test('AC-164: toggling back restores the rows without a refetch', async ({ page }) => {
    const wire = watchWire(page)
    await signIn(page, seedSubs.hassan)
    await createTask(page, {
      title: PLAIN,
      folder_id: seedIds.groceries,
      due_date: seedDate(0),
      assignee_id: seedIds.hassan,
    })

    await page.goto(routes.myDay)
    await expect(
      taskRow(page, PLAIN),
      'spec 6 Q1: the row is on My Day before the filter hides it',
    ).toBeVisible()

    const toggle = page.getByRole('switch', { name: /important/i })
    await toggle.click()
    await expect(
      taskRow(page, PLAIN),
      'spec 6 Q1: the filter hid it, which is the state the restoration below is measured from',
    ).toHaveCount(0)

    const before = wire.viewCalls().length
    await toggle.click()

    await expect(
      taskRow(page, PLAIN),
      'spec 6 Q1: the filter is over already-fetched groups, so the rows it hid are still ' +
        'held and come back. A client that filtered its cache destructively passes the first ' +
        'half of this criterion and shows an emptied page here',
    ).toBeVisible()
    await page.waitForTimeout(1_000)
    expect(
      wire.viewCalls().length,
      'spec 6 Q1: no query either way, which is what "already-fetched" means',
    ).toBe(before)
  })
})
