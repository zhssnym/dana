/*
AC-254: given a folder page whose conversation is in the side panel, then the
page's own body is narrower by about the panel's width than the same body with
the panel closed, the panel taking room rather than covering it; and when the
panel is closed again, then the body returns to the width it had.

**Covering and taking room look identical in a screenshot and differ by one
number.** That is why this criterion measures a width and why the audit could
not settle it by reading: `pages/FolderPage.tsx` mounts the conversation and
the sharing panel as overlay sheets, and an overlay sheet and a panel that
reserves the edge both render a panel of the same size in the same place. What
separates them is what happens to the page underneath, and DES-186 is explicit
about why it matters: "a panel sitting over the page hides the row the task
came from, which is the one thing a side-by-side view exists to keep. If
covering were acceptable, the dialog would already be the better answer."

**Three measurements and not two, because a page can narrow for the wrong
reason.** The body is read closed, open, and closed again. A client that
narrowed on open and never recovered would satisfy a two-point assertion and
would be broken in the way that matters most, since the panel is closed for
almost all of a page's life. The return is asserted to the same number the
page started at rather than to "wider than open", which a partial recovery
would also pass.

**The reduction is asserted against the panel's own measured width rather than
against a constant.** `prototype-v2/src/components/right-edge.tsx` publishes
the width as a number in a store precisely so nothing has to agree on a
constant, and its header records why the elegant version was abandoned: a CSS
custom property that "resolved to 360px on the very element whose padding
resolved to 0px", and "a layout that cannot be explained cannot be relied on".
So the criterion reads the panel, reads the body, and asserts the relation,
which holds whatever width the panel is given and survives a later resize.

**The tolerance is wide on purpose and still cannot be satisfied by covering.**
A gap, a border and a scrollbar all sit between the two numbers, so the
assertion is that the body lost most of the panel's width rather than exactly
all of it. Covering loses none of it, which is nowhere near the floor below.

**The conversation is the panel this reads, and DES-154 is why it is the right
one.** DES-186 settled the mechanism for the task surface and it "was settled
for one panel and forgotten for the other": Imran, 2026-08-23, "the page is
not adjusting when chat is appear as a right sidebar". So the conversation
panel is the one that carries the recorded complaint, and 9.6 gives it two
homes with the switch on the surface itself.

Spec: 9.6 (the conversation's two homes, "a closed section at the page's foot,
or the side panel, switched from the surface itself"), DES-154, DES-186, and
the parity audit's right-edge row.
*/
import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  caseTitle,
  clickControl,
  createFolder,
  createTask,
  deleteFolder,
  routesV2,
  seedSubs,
  signIn,
  TEST_TIMEOUT_MS,
} from './harness.js'

test.use({ timezoneId: 'UTC', actionTimeout: ACTION_TIMEOUT_MS })
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

interface Fixture {
  folderId: string
  folderName: string
}

/** The page's own body, which is what a panel either narrows or covers. */
function body(page: Page): Locator {
  return page.getByRole('main')
}

async function widthOf(locator: Locator, why: string): Promise<number> {
  const box = await locator.boundingBox()
  expect(box, why).not.toBeNull()
  return box === null ? 0 : Math.round(box.width)
}

/**
 * The conversation's panel home, reached by 9.6's own switch.
 *
 * The control is on the surface itself, so the case opens the conversation and
 * then moves it, which is the path a person takes and the one the section
 * describes.
 */
async function openConversationPanel(page: Page): Promise<Locator> {
  /* 9.6's own path, and the reason the case takes it rather than a shortcut:
     "the folder's conversation has two homes, a closed section at the page's
     foot or the side panel, switched from the surface itself". So the foot
     section is opened and the switch inside it is pressed, which is what a
     person does and the only way the control is reachable. */
  await clickControl(
    page.getByRole('button', { name: /^Conversation/ }).first(),
    'spec 9.6: the conversation\'s foot home is a collapsed section carrying its own name',
  )
  await clickControl(
    page.getByRole('button', { name: 'Move to side panel', exact: true }),
    'spec 9.6: the home is switched from the surface itself',
  )

  const panel = page.getByRole('dialog').filter({ hasText: 'Conversation' }).first()
  await expect(
    panel,
    'spec 9.6: the side panel is the conversation\'s second home',
  ).toBeVisible()
  return panel
}

test.describe('AC-254: the right-edge panel takes room', () => {
  let fixture: Fixture

  test.beforeEach(async ({ page }) => {
    await signIn(page, seedSubs.hassan)
    const folderName = caseTitle('ac-254 folder')
    const folder = await createFolder(page, folderName)
    await createTask(page, { title: caseTitle('ac-254 task'), folder_id: folder.id })
    fixture = { folderId: folder.id, folderName }
  })

  test.afterEach(async ({ page }) => {
    await deleteFolder(page, fixture.folderId)
  })

  test('AC-254: opening the panel narrows the page and closing it restores the width', async ({
    page,
  }) => {
    await page.goto(routesV2.folder(fixture.folderId))

    const closedWidth = await widthOf(
      body(page),
      'the folder page has a body to measure before anything is opened',
    )
    expect(
      closedWidth,
      'a page that measured nothing would make every comparison below vacuous',
    ).toBeGreaterThan(0)

    const panel = await openConversationPanel(page)
    const panelWidth = await widthOf(panel, 'the open panel has a width of its own')
    expect(
      panelWidth,
      'DES-186: the panel has a published width, which is the number the shell reserves',
    ).toBeGreaterThan(0)

    const openWidth = await widthOf(body(page), 'the body is still on the page with the panel open')

    expect(
      openWidth,
      'DES-154 and DES-186: "a panel that takes room from the page rather than covering it". ' +
        'pages/FolderPage.tsx mounts the conversation as an overlay sheet, so the body keeps ' +
        'its whole width and the panel is drawn on top of it, which is the defect Imran ' +
        'reported on 2026-08-23: "the page is not adjusting when chat is appear as a right ' +
        'sidebar"',
    ).toBeLessThan(closedWidth)

    expect(
      closedWidth - openWidth,
      'the body loses most of the panel\'s width. The tolerance is wide because a gap, a ' +
        'border and a scrollbar sit between the two numbers; covering loses none of it and ' +
        'is nowhere near this floor',
    ).toBeGreaterThanOrEqual(Math.round(panelWidth * 0.6))

    await clickControl(
      panel
        .getByRole('button', { name: /Close/i })
        .first(),
      'spec 9.6: the conversation returns to its other home from the same surface',
    )
    await expect(panel).toBeHidden()

    expect(
      await widthOf(body(page), 'the body is measured a third time, with the panel closed again'),
      'the page is closed for almost all of its life, so a client that narrowed on open and ' +
        'never recovered would be broken in the way that matters most. This asserts the ' +
        'number the page started at rather than merely "wider than open", which a partial ' +
        'recovery would also pass',
    ).toBe(closedWidth)
  })
})
