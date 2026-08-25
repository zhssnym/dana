/*
AC-167: given the window bar filter's important switch on Today, then it
filters the rows already fetched and issues no request, and turning it off
restores them without one either.

Numbered by the Integration Steward at P8's mid-package change control on
2026-08-11, so the sentence above is section 12's own text now, transcribed
unchanged. This file proposed AC-164 and carries AC-167: package P7 had by then
assigned AC-164 in the other tree, and renumbering a criterion another branch
has already assigned is the one move that would make appending unsafe. The
gap this leaves at 164 in this range is deliberate and section 12 records
why.

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

**Reworked onto the v2 surfaces on 2026-08-24 (RFC 0005), and one clause
escalated.** 9.1's route table moves the page this criterion is about off
/app, where Desk now is, to /app/today. Q1 is unchanged, its heading keeping
the v1 name in parentheses because acceptance criteria cite it, so every
assertion below is the one it always was and only the address moved.

What changed is where the switch lives. The criterion said "the important-only
toggle on My Day", and 9.4 says the opposite in terms: "the important-only
narrowing is the window bar filter's important switch; the page's header
carries no control of its own for it, because two controls for one variable
forty pixels apart is how the two disagree." So the control the criterion
named is one v2 deletes. It was raised as a Replace unit in RFC 0005's change
control item 8 and accepted by Imran on 2026-08-24, repointing the criterion
at the control that survived rather than retiring it.

Repointed rather than retired because nothing else asserts what this file
measures. AC-222 reads that a filter belongs to its page and its session,
which is a different sentence: it says where a filter's state lives, not what
setting one costs on the wire. Q1's closing line is the rule here, that the
narrowing is client-side over already-fetched groups and changes no query,
and it would be asserted by nobody if this criterion had been dropped.

**So this file is red on purpose until S10 builds the filter.** The window bar
itself landed with S9; the filter control that hangs on its right end is
S10's, so the first act of each case below fails until then, naming the
control it reached for. That is a criterion stating the contract and waiting
for the code.

Spec: 6 Q1 (the narrowing is a client-side filter and changes no query), 9.1
(the window bar, the filter control and its important switch), 9.4 (the page
header carrying no control of its own for it), 7.10, section 13 item 6,
AC-222 (the filter's own criterion).
*/
import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  caseTitle,
  clickControl,
  createTask,
  routesV2,
  seedDate,
  seedIds,
  seedSubs,
  signIn,
  taskRow,
  TEST_TIMEOUT_MS,
  watchWire,
} from './harness.js'

test.use({ timezoneId: 'UTC', actionTimeout: ACTION_TIMEOUT_MS })
// Raised from Playwright's 30 second default so a red names its assertion
// rather than the clock, for the reason recorded at TEST_TIMEOUT_MS.
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

/**
 * Bases rather than titles, and named for this file rather than for the
 * number it proposed. Both cases create the unimportant row and the run
 * seeds once, so a shared title left two rows and the second case resolved
 * its row to both.
 */
const PLAIN_BASE = 'ac-167 due today and not important'
const STARRED_BASE = 'ac-167 due today and important'

/**
 * The filter's important switch, reached the way 9.1 puts it: the window
 * bar's right end holds the filter control, named "Filter" by that section's
 * names table, and the switch is inside it.
 *
 * Opened per call rather than held across a toggle, because section 9 fixes
 * that the filter is one control with the same meaning on every place-page
 * and fixes nothing about whether its surface stays open after a change. A
 * case that assumed either would be asserting the implementation.
 */
async function importantSwitch(page: Page): Promise<Locator> {
  await clickControl(
    page.getByRole('button', { name: 'Filter', exact: true }),
    'spec 9.1: the window bar\'s right end holds the filter control, named "Filter" by that ' +
      "section's names table. v2 moved the important-only narrowing here from the page's own " +
      'header, two controls for one variable forty pixels apart being how the two disagree',
  )
  return page.getByRole('switch', { name: /important/i })
}

test.describe('AC-167: the important-only toggle is local', () => {
  test('AC-167: toggling filters the fetched rows and sends nothing', async ({ page }) => {
    const PLAIN = caseTitle(PLAIN_BASE)
    const STARRED = caseTitle(STARRED_BASE)
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

    await page.goto(routesV2.today)
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

    await clickControl(
      await importantSwitch(page),
      "spec 9.1: the filter's important switch is what narrows Today to starred rows",
    )

    await expect(
      taskRow(page, PLAIN),
      'spec 6 Q1: the switch filters to important = true within the already-fetched groups',
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

  test('AC-167: toggling back restores the rows without a refetch', async ({ page }) => {
    const PLAIN = caseTitle(PLAIN_BASE)
    const wire = watchWire(page)
    await signIn(page, seedSubs.hassan)
    await createTask(page, {
      title: PLAIN,
      folder_id: seedIds.groceries,
      due_date: seedDate(0),
      assignee_id: seedIds.hassan,
    })

    await page.goto(routesV2.today)
    await expect(
      taskRow(page, PLAIN),
      'spec 6 Q1: the row is on Today before the filter hides it',
    ).toBeVisible()

    await clickControl(
      await importantSwitch(page),
      "spec 9.1: the filter's important switch is what narrows Today to starred rows",
    )
    await expect(
      taskRow(page, PLAIN),
      'spec 6 Q1: the filter hid it, which is the state the restoration below is measured from',
    ).toHaveCount(0)

    const before = wire.viewCalls().length
    await clickControl(
      await importantSwitch(page),
      "spec 9.1: the same switch, turned back off",
    )

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
