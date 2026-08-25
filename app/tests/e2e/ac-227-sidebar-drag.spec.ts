/*
AC-227: given the Library's one ordered column, when a folder row is dragged
onto a closed group, then the group is not sprung open, the carried row names
the container it would land in as "Into {group}", and on release the folder is
in that group and still in it after a reload; and when that folder is dragged
back out of every group, then it is in the ungrouped list and still there
after a reload.

Authored at S11 by `11-adversarial-test.md`, which RFC 0004's S11 row assigns
it to, and appended to section 12 with the paragraphs that explain its number
and its scope. It is DES-171 as a criterion: the alphabet is a first
arrangement and a poor permanent one, so the directory is one column a person
rearranges by dragging.

**The number is 227 and not 226.** The S9 close wrote that S11 owed AC-226;
`s13-public`, unmerged and invisible to that session, had already spent it on
the starter workflows. Imran ruled at S12's opening that S13 keeps the number
(RFC 0005 change control item 10) because S13's criterion was written and
asserted while this one was a debt with no text.

**Membership is asserted through 7.4, not off the page, and across a reload.**
That is AC-180's standing reason on the same subject: a sidebar that regroups
its own rendering without writing anything looks correct until the next
reload, and a group is `folder_members.label` and nothing else. So each half
of this criterion reads the label back from the API and then loads the page
again, and the drag is only believed when both agree.

**The sequence is deliberately not asserted, and the reason is not shyness.**
9.1 gives the Library an order that is "the viewer's own, seeded
alphabetically and rearranged by dragging", and no store exists that can hold
one: `patchSettingsBody.sidebar_order` is an array of uuids, and a group in
today's Library is a label with no id, so a directory sequence containing
group entries cannot be written down. The design register carries DES-171 with
persistence marked Lane 2 for the same reason. A criterion asserting an order
nothing persists would be asserting the client's memory of the last five
seconds, and would go green on a client that stored nothing.

**"Into {group}" is read while the pointer is still down.** It is the
proposal rather than the outcome, and DES-171's reason for the `onOver` seam
is exactly that the promise and the outcome can disagree: a list that holds a
gap open for a row going somewhere else is lying about what a release will do.
So this case reads the sentence first, then releases, then reads the write.
A client that moves the folder correctly while proposing something else fails
the half that was the design decision.

**The drag is driven as a real pointer gesture in steps, never as one jump.**
The engine commits a press to a drag only after it has travelled `LIFT_PX`,
and it recomputes its proposal on every move, so a single `mouse.move` to the
destination is a gesture the product never receives from a person and would
measure a code path nobody uses.

Spec: 9.1 (the Library, its one ordered list, the closed-group limit and the
"Into {shelf}" drop), frozen 7.4 (my-membership, which a group is the label
of), 4.4, DES-171, DES-190, AC-180 (the same label written from the menus),
AC-155 (the list's seeded order).
*/
import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  clickControl,
  csrfToken,
  regionOf,
  routes,
  seedSubs,
  sidebar,
  signIn,
  TEST_TIMEOUT_MS,
  waitForApiIdle,
} from './harness.js'

test.use({ timezoneId: 'UTC', actionTimeout: ACTION_TIMEOUT_MS })
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

const GROUP = 'ac-227 group'
const CARRIED = 'ac-227 folder carried'
const SETTLED = 'ac-227 folder settled'
const LOOSE = 'ac-227 folder loose'

interface Membership {
  id: string
  name: string
  my_label: string | null
}

async function memberships(page: Page): Promise<Membership[]> {
  const response = await page.request.get('/api/v1/folders')
  expect(
    response.status(),
    `GET /folders answered ${response.status()}: ${await response.text()}`,
  ).toBe(200)
  return (await response.json()) as Membership[]
}

/** The viewer's label for a folder, read from 7.4 after the write has landed. */
async function labelOf(page: Page, name: string): Promise<string | null> {
  await waitForApiIdle(
    page,
    'the label write has to have been sent and answered before 7.4 is asked what it holds',
  )
  const folder = (await memberships(page)).find((entry) => entry.name === name)
  expect(
    folder,
    `the folder ${JSON.stringify(name)} is one the viewer is a member of`,
  ).toBeDefined()
  return folder?.my_label ?? null
}

/**
 * A folder with a known label, made through section 7 and never off the page.
 *
 * The fixtures this criterion needs are a group holding one folder, a loose
 * folder to carry into it, and a second loose folder to carry back out to.
 * Every one of them is this viewer's own row, per the harness rule that a spec
 * never transitions or edits a seed row.
 */
async function ensureFolder(page: Page, name: string, label: string | null): Promise<string> {
  const token = await csrfToken(page.context())
  const existing = (await memberships(page)).find((entry) => entry.name === name)
  const id =
    existing?.id ??
    (await (async (): Promise<string> => {
      const created = await page.request.post('/api/v1/folders', {
        data: { name },
        headers: { 'X-CSRF-Token': token },
      })
      expect(
        created.status(),
        `POST /folders answered ${created.status()}: ${await created.text()}`,
      ).toBe(201)
      return ((await created.json()) as { id: string }).id
    })())

  const membership = await page.request.patch(`/api/v1/folders/${id}/my-membership`, {
    data: { label },
    headers: { 'X-CSRF-Token': token },
  })
  expect(
    membership.status(),
    `PATCH /folders/:id/my-membership answered ${membership.status()}: ` +
      `${await membership.text()}`,
  ).toBe(200)
  return id
}

/** A folder's row in the Library, addressed by the folder that generates it. */
function folderRow(page: Page, name: string): Locator {
  return sidebar(page).getByRole('listitem').filter({ hasText: name }).first()
}

/** The collapsible control carrying a group's name, which is what opens it. */
function groupControl(page: Page, label: string): Locator {
  return sidebar(page).getByRole('button', { name: label, exact: true })
}

/**
 * Carry one element onto another as a person would: press, travel in steps,
 * and stop with the pointer inside the destination, still held down.
 *
 * Left held down on purpose. Both cases read the proposal off the page before
 * they release, which is the only moment it exists.
 */
async function carryOnto(page: Page, from: Locator, onto: Locator): Promise<void> {
  /*
  The gesture a person makes with a list longer than the window: grab the row
  you can see, carry it toward where the destination is, let the scroller
  follow the pointer until the destination arrives under it, and rest there.

  Only the grabbed row is scrolled into view first, because scrolling the
  destination into view scrolls the grab off it when the two do not fit the
  window together, which after a hundred and fifty specs' folders they do
  not; a drag driven from a remembered position presses the wrong row. The
  destination is never pre-scrolled at all. Its live position is re-read
  every pass, the waypoint clamped into the window so the pointer can go
  there, and a clamped waypoint lands inside the engine's edge band, which
  is what makes the list travel. The loop rests when the destination's true
  centre and the pointer agree, and its bound is the scroller's own speed:
  sixteen pixels a frame, so a long sidebar takes seconds, not the timeout.
  Each pass moves in small steps because the engine, which listens to moves,
  must see travel rather than a teleport.
  */
  await from.scrollIntoViewIfNeeded()
  const start = await from.boundingBox()
  expect(start, 'the row being carried is on the page and has a box to grab').not.toBeNull()
  if (start === null) return
  const viewport = page.viewportSize()
  expect(viewport, 'the page has a viewport to clamp waypoints into').not.toBeNull()
  if (viewport === null) return

  const fromX = start.x + start.width / 2
  const fromY = start.y + start.height / 2
  await page.mouse.move(fromX, fromY)
  await page.mouse.down()

  let atX = fromX
  let atY = fromY
  // Rested means on screen unclamped AND no longer moving between passes:
  // a destination inside the edge band keeps travelling until the scroll
  // saturates, and releasing on a row still in motion is releasing beside it.
  let previousY = Number.POSITIVE_INFINITY
  for (let pass = 0; pass < 40; pass += 1) {
    const now = await onto.boundingBox()
    expect(now, 'the destination exists somewhere in the list').not.toBeNull()
    if (now === null) return
    const trueX = now.x + now.width / 2
    const trueY = now.y + now.height / 2
    const clampedY = Math.min(Math.max(trueY, 40), viewport.height - 40)
    for (let step = 1; step <= 4; step += 1) {
      await page.mouse.move(
        atX + ((trueX - atX) * step) / 4,
        atY + ((clampedY - atY) * step) / 4,
      )
    }
    atX = trueX
    atY = clampedY
    if (Math.abs(trueY - clampedY) < 1 && Math.abs(trueY - previousY) < 2) break
    previousY = trueY
    await page.waitForTimeout(150)
  }
  // A last small wander where the destination settled, so the engine's
  // latest answer is about the point the release will land on.
  for (const nudge of [1, -1, 0]) {
    await page.mouse.move(atX + nudge, atY + nudge)
  }
}

test.beforeEach(async ({ page }) => {
  await signIn(page, seedSubs.hassan)
})

test.describe('AC-227: the Library is one column, rearranged by dragging', () => {
  test('AC-227: a folder carried onto a closed group joins it, and the group stays closed', async ({
    page,
  }) => {
    await ensureFolder(page, SETTLED, GROUP)
    await ensureFolder(page, CARRIED, null)
    await page.goto(routes.myDay)

    const group = groupControl(page, GROUP)
    await expect(
      group,
      'spec 9.1: a group is a collapsible block headed by its name, and it is in the ' +
        'Library before anything is dragged onto it',
    ).toBeVisible()

    // Closed first, because the limit under test is about a closed group.
    // DES-171 refuses to spring one open mid-drag: opening it would move every
    // row below it after the engine had measured where they sit.
    if (await folderRow(page, SETTLED).isVisible()) {
      await clickControl(group, 'the group is collapsed, so that the drag meets a closed one')
    }
    await expect(
      folderRow(page, SETTLED),
      'the group is closed before the drag begins: its own folder is not rendered',
    ).toBeHidden()

    await carryOnto(page, folderRow(page, CARRIED), group)

    await expect(
      page.getByText(`Into ${GROUP}`, { exact: true }),
      'spec 9.1: "the drop reads \\"Into {shelf}\\"". DES-171: the list stops proposing a ' +
        'slot of its own the moment the pointer is inside a container, because a list ' +
        'holding a gap open for a row that is going elsewhere lies about the release',
    ).toBeVisible()
    await expect(
      folderRow(page, SETTLED),
      'spec 9.1: "a group being closed is never sprung open by a drag hovering it". ' +
        'DES-171 gives the reason: opening it would move every row below it after the ' +
        'engine had measured where they sit, so the closed group takes the drop and says ' +
        'so in words instead',
    ).toBeHidden()

    await page.mouse.up()

    expect(
      await labelOf(page, CARRIED),
      'spec 9.1 and frozen 7.4: a group is the label of my-membership and nothing else, so ' +
        'landing in one writes that label. AC-180 asserts the same write from the menus',
    ).toBe(GROUP)

    await page.reload()
    expect(
      await labelOf(page, CARRIED),
      'the arrangement is the viewer\'s own and outlives the gesture: a sidebar that ' +
        'regrouped its own rendering without writing anything looks correct until here',
    ).toBe(GROUP)
  })

  test('AC-227: a folder carried out of every group returns to the ungrouped list', async ({
    page,
  }) => {
    await ensureFolder(page, CARRIED, GROUP)
    await ensureFolder(page, SETTLED, GROUP)
    await ensureFolder(page, LOOSE, null)
    await page.goto(routes.myDay)

    const group = groupControl(page, GROUP)
    // Open, because the row being carried out is inside it. The closed-group
    // limit belongs to the case above; this one is the way back.
    if (!(await folderRow(page, CARRIED).isVisible())) {
      await clickControl(group, 'the group is opened so the folder inside it can be grabbed')
    }
    await expect(
      regionOf(page, GROUP).getByText(CARRIED, { exact: false }),
      'spec 9.1: the sidebar has one region per label group, and the folder is in it',
    ).toBeVisible()

    await carryOnto(page, folderRow(page, CARRIED), folderRow(page, LOOSE))
    await page.mouse.up()

    expect(
      await labelOf(page, CARRIED),
      'spec 9.1: "dragging out of a group needs no target of its own: inside the directory ' +
        'but inside no group already means unsectioned" (DES-171). Clearing a label is a ' +
        'null and not an empty string, which 4.4 would accept as a group named ""',
    ).toBeNull()

    await page.reload()
    expect(
      await labelOf(page, CARRIED),
      'the way out survives the reload, on AC-180\'s reasoning for the same write',
    ).toBeNull()
    await expect(
      regionOf(page, GROUP).getByText(CARRIED, { exact: false }),
      'and the row is no longer drawn inside the group it left',
    ).toHaveCount(0)
  })
})
