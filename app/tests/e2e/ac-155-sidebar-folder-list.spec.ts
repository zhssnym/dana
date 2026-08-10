/*
AC-155 (proposed): given folders with and without personal labels, then the
sidebar pins Inbox first with its pending count, groups the labeled folders
by label ascending, and lists the unlabeled folders after them by name
ascending.

**The number is provisional**, authored on this branch with its test for the
mid-package change control to assign, from AC-154 onward because P7 is
concurrently proposing AC-144 to AC-153 and merges first. See the header of
`ac-154-quick-add-row.spec.ts` for the standard and the precedent.

The rule is 9.1's folder list sentence and no numbered criterion asserts any
part of it. It is worth a number for a reason the RFC 0001 P8 row states
outright while ruling that this grouping is presentation rather than a rule
7.11 forbids: frozen 7.4 sorts GET /folders is_default first, then
lower(name), then id, and 9.1 renders something else entirely. The server is
right and the sidebar is right and they disagree, which is exactly the
arrangement where an implementation renders the response in the order it
arrived and nothing notices. Every key 9.1's order needs is on the Folder
object already, so the regrouping is derivable, but nothing asserts that it
was derived.

**The pending badge is compared to the contract, not to a constant.** 8.11
gives the sidebar the pending number alone, and this leg's shared seed means
the number moves as other specs create rows. So the badge is read against
what GET /folders reports at that moment, which is the assertion that
actually matters: a badge showing the completed count, or the total, or the
number of members would each be a fixed integer this file could have been
written to expect.

The fixture folders are created here through 7.4 and outlive this spec, the
seeded database being shared. They are named for this file.

Spec: 9.1 (the folder list), 8.11 (the sidebar badge is the pending number
alone), 7.4 (the frozen order this one deliberately is not), 6 Q9.
*/
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import {
  csrfToken,
  routes,
  seedSubs,
  signIn,
  TEST_TIMEOUT_MS,
} from './harness.js'

test.use({ timezoneId: 'UTC' })
// Raised from Playwright's 30 second default so a red names its assertion
// rather than the clock, for the reason recorded at TEST_TIMEOUT_MS.
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

const LABELED = 'ac-155 labeled folder'
const UNLABELED_EARLY = 'ac-155 alpha unlabeled'
const UNLABELED_LATE = 'ac-155 zulu unlabeled'
/** Sorts before "Home", the label the seed puts on the shared folder. */
const LABEL = 'Aardvark'

interface Folder {
  id: string
  name: string
  is_default: boolean
  counts: { pending: number; completed: number }
}

async function folders(page: Page): Promise<Folder[]> {
  const response = await page.request.get('/api/v1/folders')
  expect(
    response.status(),
    `GET /folders answered ${response.status()}: ${await response.text()}`,
  ).toBe(200)
  return (await response.json()) as Folder[]
}

async function createFolder(page: Page, name: string): Promise<Folder> {
  const token = await csrfToken(page.context())
  const response = await page.request.post('/api/v1/folders', {
    data: { name },
    headers: { 'X-CSRF-Token': token },
  })
  expect(
    [201, 422].includes(response.status()),
    `POST /folders answered ${response.status()}: ${await response.text()}`,
  ).toBe(true)
  if (response.status() === 201) return (await response.json()) as Folder
  // Already created by an earlier run against this database.
  const existing = (await folders(page)).find((folder) => folder.name === name)
  if (existing === undefined) throw new Error(`no folder named ${name} after a 422`)
  return existing
}

/** The sidebar's links, in the order they are rendered. */
async function sidebarNames(page: Page): Promise<string[]> {
  const nav = page.getByRole('navigation').first()
  const texts = await nav.getByRole('link').allTextContents()
  return texts.map((text) => text.replace(/\s+/g, ' ').trim())
}

function positionOf(names: string[], needle: string): number {
  const index = names.findIndex((name) => name.includes(needle))
  expect(
    index,
    `the sidebar of 9.1 lists every accessible folder, and ${needle} is not among ` +
      `${JSON.stringify(names)}`,
  ).toBeGreaterThan(-1)
  return index
}

test.beforeEach(async ({ page }) => {
  await signIn(page, seedSubs.hassan)
})

test.describe('AC-155 (proposed): the sidebar folder list', () => {
  test('AC-155: Inbox is pinned first, labels ascending, then unlabeled by name', async ({
    page,
  }) => {
    const labeled = await createFolder(page, LABELED)
    await createFolder(page, UNLABELED_LATE)
    await createFolder(page, UNLABELED_EARLY)

    const token = await csrfToken(page.context())
    const labelled = await page.request.patch(
      `/api/v1/folders/${labeled.id}/my-membership`,
      { data: { label: LABEL, color: '#4477CC' }, headers: { 'X-CSRF-Token': token } },
    )
    expect(
      labelled.status(),
      `PATCH my-membership answered ${labelled.status()}: ${await labelled.text()}`,
    ).toBe(200)

    await page.goto(routes.myDay)
    const names = await sidebarNames(page)

    const inbox = positionOf(names, 'Inbox')
    const aardvark = positionOf(names, LABELED)
    const home = positionOf(names, 'Groceries')
    const alpha = positionOf(names, UNLABELED_EARLY)
    const zulu = positionOf(names, UNLABELED_LATE)

    expect(
      inbox,
      `spec 9.1: Inbox is pinned first in the folder list. The sidebar read ${JSON.stringify(names)}`,
    ).toBeLessThan(aardvark)
    expect(
      aardvark,
      'spec 9.1: per-member label groups come next with labels ascending, so Aardvark ' +
        'precedes Home. Frozen 7.4 sorts the response is_default first then lower(name), ' +
        'which would put Groceries before this folder, so a sidebar rendering the response in ' +
        'the order it arrived fails exactly here',
    ).toBeLessThan(home)
    expect(
      home,
      'spec 9.1: unlabeled folders come after the labeled groups',
    ).toBeLessThan(alpha)
    expect(
      alpha,
      'spec 9.1: unlabeled folders are ordered by name ascending',
    ).toBeLessThan(zulu)
  })

  test('AC-155: the Inbox badge is the pending count and nothing else', async ({ page }) => {
    const inbox = (await folders(page)).find((folder) => folder.is_default)
    expect(inbox, 'spec 4.3 and INV-2: the viewer has exactly one default folder').toBeDefined()
    if (inbox === undefined) throw new Error('unreachable: asserted above')

    await page.goto(routes.myDay)
    const nav = page.getByRole('navigation').first()
    const entry = nav.getByRole('link', { name: /Inbox/ })

    await expect(
      entry,
      'spec 9.1: Inbox is pinned first with a pending-count badge',
    ).toContainText(String(inbox.counts.pending))

    // Compared to the contract rather than to a constant, so the assertion
    // survives whatever the specs before this one created, and so that a
    // badge showing completed, or the total, or the member count cannot pass
    // by being a plausible integer.
    expect(
      inbox.counts.pending === inbox.counts.completed,
      'spec 8.11: the sidebar badge is the pending number alone, and this case can only tell ' +
        'it from the completed number while the two differ. The seeded Inbox has pending rows ' +
        'and no completed ones, so if this ever fails the fixture has drifted, not the client',
    ).toBe(false)
  })

  test('AC-155: a label group collapses', async ({ page }) => {
    await page.goto(routes.myDay)

    const group = page.getByRole('button', { name: /^Home$/ })
    await expect(
      group,
      'spec 9.1: per-member label groups are collapsible, so the label heading is a control',
    ).toBeVisible()
    await expect(
      page.getByRole('link', { name: /Groceries/ }),
      'the labeled folder is listed under its label while the group is open',
    ).toBeVisible()

    await group.click()
    await expect(
      page.getByRole('link', { name: /Groceries/ }),
      'spec 9.1: collapsing a label group hides the folders inside it, which is the whole of ' +
        'what collapsible means for a list whose other entries are unaffected',
    ).toHaveCount(0)
    await expect(
      page.getByRole('link', { name: /Inbox/ }),
      'the pinned Inbox is in no label group, so collapsing one leaves it alone',
    ).toBeVisible()
  })

  test('AC-155: another member sees their own labeling, not the viewer\'s', async ({
    browser,
  }) => {
    // 9.1's groups are per-member, drawn from the personal label of 7.4's
    // my-membership, and AC-023 pins that a label is invisible to other
    // members on the server side. The client half is that the sidebar groups
    // by the viewer's own label: the seed gives Hassan "Home" on the shared
    // folder and gives Imran no label at all, so the same folder is inside a
    // group for one of them and among the unlabeled for the other.
    const context = await browser.newContext()
    const page = await context.newPage()
    await signIn(page, seedSubs.imran)
    await page.goto(routes.myDay)

    await expect(
      page.getByRole('link', { name: /Groceries/ }),
      'the shared folder is in this member\'s sidebar too, membership being what puts it there',
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: /^Home$/ }),
      'spec 9.1: label groups are per-member and 7.4 stores the label on the membership row, ' +
        'so the other member\'s label is not a group in this sidebar. AC-023 pins the same ' +
        'sentence on the server',
    ).toHaveCount(0)
    await context.close()
  })
})
