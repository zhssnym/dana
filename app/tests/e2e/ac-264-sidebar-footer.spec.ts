/*
AC-264: given the sidebar, then its footer carries the account row and nothing
else — no "New folder", no "New shelf", no "Import", no "Trash", no "People"
and no "Settings" standing beside it — and the three acts of making are one
"New" control on the Library's heading, which offers "New folder", "New shelf"
and "New task" and opens the surface each of them names.

**This criterion is amended rather than deleted, and the amendment is the
owner's own ruling of 2026-08-30**, at the polish round: "leave more real
estate to the Library in the sidebar, and move Import and People and Settings
and Trash to when you click on the profile! and leave only New shelf and New
folder and New task side by side or just put them into a '+' icon just like
Imran said, somewhere around easy to find in the sidebar! my goal is that
there is more space for the Library so people can see a big picture of what's
going on in their app."

What it asserted before was 9.1's older composition, and each clause of that
is now false on purpose:

- "one primary New folder action" in the footer — the act survives, its place
  does not, and it is the first item of the Library's "+".
- "a row of two acts of making, New shelf and Import, each keeping its label
  at every width" — DES-216's narrowing asymmetry was arithmetic about fitting
  words into 224 pixels, and a menu has no width to run out of. The clause has
  no subject left, which is why the narrow-width case is gone rather than
  rewritten: a criterion has to assert something a client could get wrong, and
  there is nothing here to get wrong any more.
- "then Trash, People and Settings as links" — the three are menu items in the
  account menu, where AC-242 asserts their order and presses each one to see
  that it arrives. That is deliberately not duplicated here; what this
  criterion owes is that they are **gone from the footer**, which is the half
  AC-242 cannot see.

**So the shape of the case inverts, and that is the point.** The old case
asserted presence, because a port could drop a control. This one asserts
absence, because the failure it now guards against is the opposite one: a
footer that grows a row back, or a session that moves a control and leaves the
old one behind, gives the Library its room back and then takes it away again
without anybody noticing. Absence is asserted **by role and name within the
footer's own landmark**, never by counting rows, so a footer that rearranges
itself honestly stays green.

**The "+" is asserted to open its three and to make one of them.** A menu of
three labels is three labels until one of them is pressed, so "New folder" is
pressed and the dialog AC-181 owns has to open. The other two are asserted to
be offered; AC-313 presses New shelf through the same control and 9.3's form
is AC-093's, so pressing all three here would be three criteria wearing one
number.

Spec: 9.1 (the footer, which is now the avatar menu alone; the Library's "New"
control and the three acts it begins), 7.16 (POST /workflows/import, reached
from the account menu and asserted by AC-242), DES-209, DES-216 (spent), and
the parity audit's sidebar-footer row.
*/
import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  clickControl,
  effectiveOpacity,
  routesV2,
  seedSubs,
  sidebar,
  signIn,
  TEST_TIMEOUT_MS,
} from './harness.js'

test.use({ timezoneId: 'UTC', actionTimeout: ACTION_TIMEOUT_MS })
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

/** 9.1's names table, since the polish round of 2026-08-30. */
const LIBRARY_NEW = 'New'

/** The three the "+" offers, in the order 9.1 names them. */
const ACTS = ['New folder', 'New shelf', 'New task'] as const

/**
 * The six controls the footer used to carry above the account row.
 *
 * Named as strings rather than derived, because what this asserts is that no
 * control answering to any of these names is left standing in the footer, and
 * a list computed from the client would be the client marking its own paper.
 */
const MOVED = ['New folder', 'New shelf', 'Import', 'Trash', 'People', 'Settings'] as const

function control(page: Page, name: string): Locator {
  return sidebar(page)
    .getByRole('button', { name, exact: true })
    .or(sidebar(page).getByRole('link', { name, exact: true }))
    .first()
}

/**
 * The sidebar's footer.
 *
 * `contentinfo` is not it: the footer of a navigation landmark is not the
 * page's, and the primitive draws a plain `div`. So it is reached through the
 * one control this criterion asserts is in it — the account row — and read as
 * that control's own parent chain, which is what "beside it" means. A test
 * asserting absence has to be scoped to somewhere, and the alternative,
 * asserting absence from the whole sidebar, would fail the day a folder is
 * named "Trash".
 */
function footer(page: Page): Locator {
  return sidebar(page).locator('[data-slot="sidebar-footer"]')
}

test.describe("AC-264: the sidebar footer is the account row, and the acts are the Library's", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, seedSubs.hassan)
    await page.goto(routesV2.desk)
  })

  test('AC-264: the footer carries the account row and none of the six that moved', async ({
    page,
  }) => {
    const account = footer(page).getByRole('button', { name: 'Account', exact: true })
    await expect(
      account,
      'spec 9.1: the footer is the avatar menu, named "Account" by that section\'s names ' +
        'table. It is what the footer is for and the one thing in it that is not a door to ' +
        'somewhere else',
    ).toBeVisible()

    for (const name of MOVED) {
      await expect(
        footer(page).getByRole('button', { name, exact: true }),
        `spec 9.1 as the owner amended it on 2026-08-30: "${name}" left the footer so that ` +
          'the Library could have its room. A control that moved and did not go is the ' +
          'failure this case exists for',
      ).toHaveCount(0)
      await expect(
        footer(page).getByRole('link', { name, exact: true }),
        `and "${name}" is not a footer link either: three of the six were links, and a ` +
          'button-only assertion would have missed exactly those three',
      ).toHaveCount(0)
    }
  })

  test('AC-264: the Library heading carries "New", offering the three acts of making', async ({
    page,
  }) => {
    const plus = control(page, LIBRARY_NEW)
    await expect(
      plus,
      'spec 9.1: the Library block carries a "New" control. The owner asked for "a \'+\' ' +
        'icon just like Imran said, somewhere around easy to find in the sidebar", and the ' +
        "prototype's own affordance sits on this heading",
    ).toBeVisible()

    /*
    Drawn at rest rather than on hover, and read through the harness's
    `effectiveOpacity` rather than as `toBeVisible`.

    That matters here and nowhere else in this file: Playwright calls an
    element visible when it has a box and is not `visibility: hidden`, and the
    prototype's own heading control has a box at `opacity-0`. So the assertion
    every other case makes would pass against exactly the control this one is
    written to refuse — which is the fault that helper was added to the
    harness for, at this same round. Nothing is hovered before the read, which
    is what makes it about the rest state; 9.11's "a row whose only controls
    appear on hover is a row with nothing to press" is the ruling behind it,
    and a touchscreen has no hover to give.
    */
    expect(
      await effectiveOpacity(plus),
      "spec 9.1: the control rests visible; a '+' a person has to find by hovering is not " +
        'easy to find, which is the half of the owner\'s instruction a revealed control fails',
    ).toBeGreaterThan(0.5)

    await clickControl(plus, 'spec 9.1: it opens')
    for (const name of ACTS) {
      await expect(
        page.getByRole('menuitem', { name, exact: true }),
        `spec 9.1: the "New" control begins New folder, New shelf and New task, and ` +
          `"${name}" is one of the three`,
      ).toBeVisible()
    }
  })

  test('AC-264: "New folder" in that menu opens the dialog that makes one', async ({
    page,
  }) => {
    await clickControl(control(page, LIBRARY_NEW), 'spec 9.1: the "New" control opens')
    await clickControl(
      page.getByRole('menuitem', { name: 'New folder', exact: true }),
      'spec 9.1: the first of the three acts of making',
    )
    await expect(
      page.getByRole('dialog', { name: 'New folder' }),
      "spec 9.1 and AC-181: the act is the same act it was in the footer, so it opens the " +
        'same dialog. A menu of three labels is three labels until one of them is pressed',
    ).toBeVisible()
  })
})
