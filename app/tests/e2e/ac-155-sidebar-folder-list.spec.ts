/*
AC-155: given folders with and without personal labels, then the
sidebar pins Desk first with its pending count, groups the labeled folders
by label ascending, and lists the unlabeled folders after them by name
ascending.

Numbered by the Integration Steward at P8's mid-package change control on
2026-08-11, so the sentence above is section 12's own text now; it is
transcribed unchanged, the AC-125 to AC-130, AC-133 to AC-140 and AC-142
precedent for a batch authored on the branch and numbered additively so
nothing already written moves.

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
  ACTION_TIMEOUT_MS,
  clickControl,
  csrfToken,
  linkTo,
  routes,
  seedSubs,
  signIn,
  TEST_TIMEOUT_MS,
} from './harness.js'

test.use({ timezoneId: 'UTC', actionTimeout: ACTION_TIMEOUT_MS })
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

test.describe('AC-155: the sidebar folder list', () => {
  test('AC-155: Desk is pinned first, labels ascending, then unlabeled by name', async ({
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
    /*
    The folder list is waited for before the order is read off it.

    `allTextContents()` waits for nothing: it reports whichever frame it caught.
    The page block above the folders is rendered from 9.1's route table and is
    there on the first paint, but the folder list is the `GET /folders` read of
    7.4 and the shell falls back to an empty one while that is in flight
    (`folders ?? []` in `shell/app-sidebar.tsx`), so a read taken straight after
    a navigation can hold the pages and none of the folders. Measured
    2026-08-25 against a `GET /folders` delayed by 1500 ms: the read returned
    the ten page and footer links, with Desk at index -1, and every ordering
    assertion below then failed for a reason that has nothing to do with order.
    Green on a quiet machine and red on a loaded one, which is what made it a
    race rather than a defect.

    This waits for the arrival and then asserts the order on one snapshot.
    Nothing is weakened: `positionOf` asserted presence and still does, this
    poll fails the case with the names it read if a folder never arrives, and
    the four ordering assertions are unchanged. What it removes is the frame
    that was never the subject of the criterion.
    */
    await expect
      .poll(() => sidebarNames(page), {
        message:
          'spec 9.1: the sidebar lists every accessible folder, and 7.4 is the read it ' +
          'draws them from, so the order is asserted once that read has landed rather ' +
          'than on whichever frame the navigation happened to leave behind',
      })
      .toEqual(
        expect.arrayContaining(
          [LABELED, 'Groceries', UNLABELED_EARLY, UNLABELED_LATE, 'Desk'].map((name) =>
            expect.stringContaining(name),
          ),
        ),
      )
    const names = await sidebarNames(page)

    const desk = positionOf(names, 'Desk')
    const aardvark = positionOf(names, LABELED)
    const home = positionOf(names, 'Groceries')
    const alpha = positionOf(names, UNLABELED_EARLY)
    const zulu = positionOf(names, UNLABELED_LATE)

    expect(
      desk,
      `spec 9.1: Desk is pinned first in the folder list. The sidebar read ${JSON.stringify(names)}`,
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

  test('AC-155: the Desk badge is the pending count and nothing else', async ({ page }) => {
    const desk = (await folders(page)).find((folder) => folder.is_default)
    expect(desk, 'spec 4.3 and INV-2: the viewer has exactly one default folder').toBeDefined()
    if (desk === undefined) throw new Error('unreachable: asserted above')

    await page.goto(routes.myDay)
    const nav = page.getByRole('navigation').first()
    // The folder row and not the page entry of the same name: see `linkTo`.
    const entry = linkTo(nav, /Desk/, routes.folder(desk.id))

    await expect(
      entry,
      'spec 9.1: Desk is pinned first with a pending-count badge',
    ).toContainText(String(desk.counts.pending))

    // Compared to the contract rather than to a constant, so the assertion
    // survives whatever the specs before this one created, and so that a
    // badge showing completed, or the total, or the member count cannot pass
    // by being a plausible integer.
    expect(
      desk.counts.pending === desk.counts.completed,
      'spec 8.11: the sidebar badge is the pending number alone, and this case can only tell ' +
        'it from the completed number while the two differ. The seeded Desk has pending rows ' +
        'and no completed ones, so if this ever fails the fixture has drifted, not the client',
    ).toBe(false)
  })

  test('AC-155: a label group collapses', async ({ page }) => {
    const desk = (await folders(page)).find((folder) => folder.is_default)
    expect(desk, 'spec 4.3 and INV-2: the viewer has exactly one default folder').toBeDefined()
    if (desk === undefined) throw new Error('unreachable: asserted above')
    await page.goto(routes.myDay)

    /*
    The disclosure control, which carried the label itself until S17b.

    DES-207 splits that heading row: "the glyph is the disclosure; the name is
    the way in", because a shelf has a page now (9.10) and the row has to
    behave like every other row that names something you can open. So the name
    is a link where a shelf backs the label and the fold is a control of its
    own. 9.1's clause is unchanged and so is this case: "per-member label
    groups are collapsible" is about the fold rather than about which element
    carries it.
    */
    const group = page.getByRole('button', { name: 'Show the folders on Home', exact: true })
    await expect(
      group,
      'spec 9.1: per-member label groups are collapsible, so the heading carries a control ' +
        'that folds the group',
    ).toBeVisible()
    await expect(
      page.getByRole('link', { name: /Groceries/ }),
      'the labeled folder is listed under its label while the group is open',
    ).toBeVisible()

    await clickControl(
      group,
      'spec 9.1: per-member label groups are collapsible, so the label is a control',
    )
    await expect(
      page.getByRole('link', { name: /Groceries/ }),
      'spec 9.1: collapsing a label group hides the folders inside it, which is the whole of ' +
        'what collapsible means for a list whose other entries are unaffected',
    ).toHaveCount(0)
    await expect(
      linkTo(page.getByRole('navigation').first(), /Desk/, routes.folder(desk.id)),
      'the pinned Desk is in no label group, so collapsing one leaves it alone. The row and ' +
        'not the page entry that shares its name, which is what `linkTo` separates',
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
    /* The same control the case above addresses, asserted absent here. It has
       to be the same locator or this assertion stops discriminating: a name
       nothing on the page ever carries is absent from every sidebar, and the
       claim is that this group is not in *this* one. */
    await expect(
      page.getByRole('button', { name: 'Show the folders on Home', exact: true }),
      'spec 9.1: label groups are per-member and 7.4 stores the label on the membership row, ' +
        'so the other member\'s label is not a group in this sidebar. AC-023 pins the same ' +
        'sentence on the server',
    ).toHaveCount(0)
    await context.close()
  })
})
