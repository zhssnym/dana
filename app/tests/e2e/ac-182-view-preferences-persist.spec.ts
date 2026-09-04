/*
AC-182: given the sidebar collapsed to its rail or resized, and given the task
form resized, then each state survives a reload of the page, and the sidebar
collapsed to its rail still reaches every page and every folder 9.1 puts in
it.

Appended to section 12 by RFC 0002, Accepted 2026-08-13. The sentence above
is that RFC's Append unit transcribed unchanged, and it becomes section 12's
own text when the delta merges.

Three affordances that arrive with the components being adopted and that no
section named before this change control. The RFC's alternatives section
records why they are specified rather than deferred: they are built into the
code being ported, so deferring them means either removing working code or
shipping behaviour no section names, and protocol section 1 makes an
unrecorded deviation a defect even where the code works. 9.1 and 9.3 each
gained one sentence, and each says the same thing: the width is the viewer's
and persisted client-side, and the section fixes what the surface holds
rather than how wide it is.

**Persistence is asserted across a reload and not across a navigation.** A
client holding the preference in React state satisfies every assertion made
while the page is alive, and that is the whole of what "persisted
client-side" rules out. The reload is a full document load, so what survives
it survives in storage.

**The rail is asserted to still reach everything.** This is the half that
matters and the half a rail gets wrong: 9.1 says the width and the collapsed
state "change nothing about what the sidebar holds", so a rail that drops the
folder list, or that drops the folders inside label groups, has changed what
the sidebar holds while satisfying any assertion about its width. The pages
and the folders are asserted as links there, which is what AC-175 asserts
them to be when the sidebar is open.

**The resize handles are addressed by role and by nothing else.** A control
that splits two resizable panes is a separator, which is what that role is
for, and neither 9.1 nor 9.3 names one. The rail's own control has no name
either and is matched by description. Both gaps go to the Integration Steward
with the rest of this package's.

**Reworked onto the v2 surfaces on 2026-08-24 (RFC 0005).** Neither width nor
the rail moves; what the rail has to still reach does. "Every page 9.1 puts
in it" is now DES-152's page block, Desk, Today, Scheduled, Assignments,
Important and All, plus whichever unpinned views the pin list has pinned, so
the list this file walks is that one and the state is made by writing pins
rather than the three v1 flags. After the first write those flags no longer
reach this surface, which is why setting them here would be asserting
whichever of the two records happened to be live.

Spec: 9.1 (the sidebar's width and rail as view preferences, the page block,
the Library, and the v2 routes table), 9.3 (the form's width, on the
sidebar's rule), 9.7 (the pin list, so that the whole block is present),
4.19 (pinned_views), 10.6.
*/
import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  clickControl,
  DEFAULT_PINS,
  floatingAddButton,
  linkTo,
  patchBundle,
  routesV2,
  seedIds,
  seedSubs,
  sidebar,
  signIn,
  taskSurface,
  TEST_TIMEOUT_MS,
  V2_PAGE_NAMES,
} from './harness.js'

test.use({ timezoneId: 'UTC', actionTimeout: ACTION_TIMEOUT_MS })
// Raised from Playwright's 30 second default so a red names its assertion
// rather than the clock, for the reason recorded at TEST_TIMEOUT_MS.
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

/** 9.1's page block as this account pins it, which the rail must still reach. */
const PAGES = [...V2_PAGE_NAMES, 'Done'] as const

/*
Where each of them goes, which the names alone did not need until issue #98.
The rail draws the viewer's default folder beside the page block, 4.3 names
that folder Desk, and 9.1's page block opens with a page called Desk: two
links of one name, told apart by the folder's pending badge while the sidebar
is open and by nothing at all once it is a rail. So the entries below are
addressed by 9.1's routes table as well as by name; see `linkTo` in the
harness for why that is reading the section rather than reaching around it.

The `satisfies` is the guard on the map: a page added to V2_PAGE_NAMES and not
to this list fails the compiler rather than this case.
*/
const PAGE_PATHS = {
  Desk: routesV2.desk,
  Today: routesV2.today,
  Scheduled: routesV2.scheduled,
  Assignments: routesV2.assignments,
  Important: routesV2.important,
  All: routesV2.all,
  Done: routesV2.done,
} as const satisfies Record<(typeof PAGES)[number], string>

/**
 * The control that collapses the sidebar to its icon rail. 9.1 names the
 * state and no control, so this is a description match, escalated with the
 * rest of this package's naming gaps.
 */
function railControl(page: Page): Locator {
  return sidebar(page)
    .getByRole('button', { name: /sidebar|rail|collapse|expand/i })
    .or(page.getByRole('button', { name: /toggle sidebar/i }))
}

/**
 * A resize handle. A control that splits two resizable panes is a separator,
 * which is what that role is for, and neither 9.1 nor 9.3 names one.
 */
function resizeHandle(scope: Locator | Page): Locator {
  return scope.getByRole('separator')
}

/** The width the browser painted for an element, in whole pixels. */
async function widthOf(locator: Locator): Promise<number> {
  const box = await locator.boundingBox()
  expect(box, 'the element is on the page and has a box').not.toBeNull()
  return Math.round(box?.width ?? 0)
}

test.beforeEach(async ({ page }) => {
  await signIn(page, seedSubs.hassan)
  // So that the whole page block and the Library are present, which is what
  // the rail case asserts the rail still reaches. Done is pinned on top of
  // the six that ship pinned, because a rail that drops an entry is likeliest
  // to drop the one the pin list added.
  await patchBundle(page, { pinned_views: [...DEFAULT_PINS, 'done'] })
})

test.describe('AC-182: the sidebar rail and the two widths', () => {
  test('AC-182: the rail survives a reload', async ({ page }) => {
    await page.goto(routesV2.desk)
    const open = await widthOf(sidebar(page))

    await clickControl(
      railControl(page).first(),
      'spec 9.1: "whether it is collapsed to an icon rail" is the viewer\'s, so there is a ' +
        'control that collapses it',
    )
    const railed = await widthOf(sidebar(page))
    expect(
      railed,
      'spec 9.1: an icon rail is narrower than the sidebar it collapses, which is what a rail is',
    ).toBeLessThan(open)

    await page.reload()
    expect(
      await widthOf(sidebar(page)),
      'spec 9.1: the collapsed state is "the viewer\'s, persisted client-side". A client ' +
        'holding it in React state satisfies every assertion made while the page is alive, and ' +
        'that is the whole of what persistence rules out, so the assertion is made across a ' +
        'full document load',
    ).toBe(railed)
  })

  test('AC-182: the rail reaches every page, the folder the viewer stands in, and the open folders', async ({
    page,
  }) => {
    /* Reworked at the polish round of 2026-08-30. The case used to assert
       every folder in the rail, reasoning from a 9.1 sentence ("the collapsed
       state changes nothing about what the sidebar holds") that RFC 0005's
       rewrite of the section removed; the prototype's own rail draws no
       folder list at all, and the amended 9.1 says the rail holds the page
       set, the folder the viewer is standing in, and the folders the tab
       strip holds open. On Desk with nothing else open, the rail owes the
       page set and Desk (which is the default folder's page), and it
       owes Groceries — neither selected nor open — no row at all, which is
       the assertion that makes the rule discriminate. */
    await page.goto(routesV2.desk)
    await clickControl(
      railControl(page).first(),
      'spec 9.1: the sidebar collapses to an icon rail',
    )

    const nav = sidebar(page)
    for (const name of PAGES) {
      await expect(
        linkTo(nav, name, PAGE_PATHS[name], { exact: true }),
        `spec 9.1: the rail keeps the page set, so ${name} is still an entry of it`,
      ).toHaveCount(1)
    }
    await expect(
      linkTo(nav, new RegExp('Desk'), routesV2.folder(seedIds.hassanDesk)),
      "spec 9.1: the viewer stands on Desk, which is the default folder's page, so the rail " +
        'owes that folder its row. Addressed by the routes table as well as the name, the ' +
        'rail holding a page entry called Desk too and the badge that tells them apart when ' +
        'the sidebar is open being gone when it is a rail',
    ).toHaveCount(1)
    await expect(
      nav.getByRole('link', { name: new RegExp('Groceries') }),
      'spec 9.1: a folder neither selected nor open is not in the rail; a rail drawing the ' +
        'whole Library is the old rule, and this absence is what tells the two apart',
    ).toHaveCount(0)
  })

  test('AC-182: a resized sidebar survives a reload', async ({ page }) => {
    await page.goto(routesV2.desk)
    const before = await widthOf(sidebar(page))

    const handle = resizeHandle(page)
    await expect(
      handle,
      'spec 9.1: "the sidebar\'s width ... [is] the viewer\'s, persisted client-side", so ' +
        'there is a handle that sets it. A control splitting two resizable panes is a ' +
        'separator, which is what that role is for',
    ).not.toHaveCount(0)
    const box = await handle.first().boundingBox()
    expect(box, 'the handle is on the page and has a box').not.toBeNull()
    if (box === null) throw new Error('unreachable: asserted above')
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 + 90, box.y + box.height / 2, { steps: 12 })
    await page.mouse.up()

    const after = await widthOf(sidebar(page))
    expect(
      after,
      'spec 9.1: the handle sets the width, so dragging it changes what the sidebar measures',
    ).not.toBe(before)

    await page.reload()
    expect(
      await widthOf(sidebar(page)),
      'spec 9.1: and the width is persisted client-side, so it survives a full document load. ' +
        'This section fixes the contents and their order and fixes no width, which is exactly ' +
        'why the width a person chose is theirs to keep',
    ).toBe(after)
  })

  /*
  **This case has outlived the sentence it was written against, and that is
  recorded rather than resolved (S15, RFC 0005 change control item 25).**

  v1's 9.3 carried "The form's width is the viewer's, persisted client-side,
  on the sidebar's rule in 9.1", which is the sentence the criterion's own
  clause quotes and the two assertions below read. The v2 replacement drops it
  entirely: it fixes one width for the pickers ("one shape at one width") and
  says of the surface only that "the side panel makes the page narrower rather
  than covering it". So section 9 has gone quiet on this, which is protocol
  section 6's silence trigger and the shape F-4 reached the Steward as, not a
  design that changed its mind: the parity target still persists a width,
  `prototype-v2`'s task-surface remembering a panel width under DES-138.

  Two dispositions are open and item 25 carries both without recommending
  between them, because they turn on what the owner wants asserted: either 9.3
  regains a width sentence and this case stands as written, or the case goes
  the way item 14's counts-carrying folder-delete case went and AC-182 keeps
  its three sidebar arms. It is left standing and passing in the meantime,
  which is the state that assumes least; deleting coverage on a guess is the
  one move that cannot be undone by a ruling.
  */
  test('AC-182: a resized task surface survives a reload', async ({ page }) => {
    await page.goto(routesV2.today)
    await clickControl(
      floatingAddButton(page),
      'spec 9.1: the floating add button is a capture point, and Today is one of the three ' +
        'pages that section leaves it on',
    )

    const form = taskSurface(page)
    await expect(
      form,
      "spec 9.1's v2 roles table: the task surface is a dialog when opened as one",
    ).toBeVisible()
    const before = await widthOf(form)

    const handle = resizeHandle(form)
    await expect(
      handle,
      'spec 9.3: "The form\'s width is the viewer\'s, persisted client-side, on the sidebar\'s ' +
        'rule in 9.1", so the form carries a handle of its own',
    ).not.toHaveCount(0)
    const box = await handle.first().boundingBox()
    expect(box, 'the handle is on the page and has a box').not.toBeNull()
    if (box === null) throw new Error('unreachable: asserted above')
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 - 90, box.y + box.height / 2, { steps: 12 })
    await page.mouse.up()

    const after = await widthOf(form)
    expect(after, 'spec 9.3: the handle sets the width').not.toBe(before)

    await page.reload()
    await clickControl(
      floatingAddButton(page),
      'spec 9.1: the form is opened again after the reload, the width being a preference of ' +
        'the surface rather than of the task',
    )
    expect(
      await widthOf(taskSurface(page)),
      'spec 9.3: the width is persisted client-side, so the form opens at the width the viewer ' +
        'left it at. 9.3 fixes what the form holds and in what order and fixes no width',
    ).toBe(after)
  })

  test('AC-182: the preferences are the viewer\'s and not the page\'s', async ({ page }) => {
    // 9.1 says the rail changes nothing about what the sidebar holds, and it
    // is one sidebar across every route, so a preference stored per page is
    // a preference that vanishes on the first navigation.
    await page.goto(routesV2.desk)
    await clickControl(
      railControl(page).first(),
      'spec 9.1: the sidebar collapses to an icon rail',
    )
    const railed = await widthOf(sidebar(page))

    await page.goto(routesV2.folder(seedIds.groceries))
    expect(
      await widthOf(sidebar(page)),
      'spec 9.1: the sidebar is the application\'s only chrome and there is one of it, so a ' +
        'preference that resets on a navigation is a preference the viewer does not have',
    ).toBe(railed)
  })
})
