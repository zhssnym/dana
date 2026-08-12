/*
AC-180: given the sidebar's folder list, then a folder group can be created by
naming it, renamed, and deleted, and a folder can be moved from one group to
another or out of every group; and given a group deleted, then every folder
that carried it and every task in those folders still exists, in the
ungrouped list.

Appended to section 12 by RFC 0002, Accepted 2026-08-13. The sentence above
is that RFC's Append unit transcribed unchanged, and it becomes section 12's
own text when the delta merges.

The group is not a thing. 9.1 says so outright at the same change control: "A
group is the label of 7.4's my-membership and nothing else, so creating one is
naming it on a folder, and deleting one clears that label from every folder
carrying it." That sentence is why this criterion's second half is the half
that matters. A person deleting something called a folder group has every
reason to fear they are deleting folders, the confirm 9.1 writes says they
are not, and nothing in the schema makes it true: the implementation is four
writes to `folder_members.label`, and one that reached for DELETE /folders
instead would be destroying tasks for every member of every folder in the
group. So the survival of the folders and their tasks is asserted through
section 7 rather than off the page.

**Every operation is asserted through 7.4 as well as on the page.** The label
lives on the viewer's own membership row, which is what makes a group
personal, and AC-023 pins that the server keeps it private. A sidebar that
regrouped its own rendering without writing anything looks correct until the
next reload, and this leg's other sidebar criterion, AC-155, reads only the
order.

**Moving out of every group is asserted separately from moving between two.**
9.1 gives both, and clearing a label is a null where changing one is a
string; a client that sends the empty string instead would put every
ungrouped folder into a group named "" and 4.4 has no opinion about it.

**The controls have no name in any numbered section and are matched by 9.1's
own descriptions.** 9.1 names the "New folder" action and names no control
for creating, renaming, deleting or moving a group, and it says only that a
folder is moved "from its own menu". This file matches those descriptions and
the gap is routed to the Integration Steward with the rest of this package's,
on the P8 precedent where eight controls described but not named were
escalated rather than guessed at.

Spec: 9.1 (folder groups and their four operations, the delete-group confirm,
the folder list's order), frozen 7.4 (my-membership, which a group is the
label of), 4.4, 8.11, AC-023, AC-155.
*/
import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  clickControl,
  createTask,
  csrfToken,
  fillControl,
  routes,
  seedSubs,
  sidebar,
  signIn,
  TEST_TIMEOUT_MS,
  waitForApiIdle,
} from './harness.js'

test.use({ timezoneId: 'UTC', actionTimeout: ACTION_TIMEOUT_MS })
// Raised from Playwright's 30 second default so a red names its assertion
// rather than the clock, for the reason recorded at TEST_TIMEOUT_MS.
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

const FOLDER_A = 'ac-180 folder alpha'
const FOLDER_B = 'ac-180 folder beta'
const TASK_IN_A = 'ac-180 task that must survive the group'
const GROUP = 'ac-180 group'
const RENAMED = 'ac-180 group renamed'
const OTHER_GROUP = 'ac-180 other group'

interface Membership {
  id: string
  name: string
  my_label: string | null
}

/** What 7.4 reports for the viewer's own memberships, which is where a group lives. */
async function memberships(page: Page): Promise<Membership[]> {
  const response = await page.request.get('/api/v1/folders')
  expect(
    response.status(),
    `GET /folders answered ${response.status()}: ${await response.text()}`,
  ).toBe(200)
  return (await response.json()) as Membership[]
}

async function labelOf(page: Page, name: string): Promise<string | null> {
  await waitForApiIdle(
    page,
    'the label write has to have been sent and answered before 7.4 is asked what it holds',
  )
  const folder = (await memberships(page)).find((entry) => entry.name === name)
  expect(folder, `the folder ${JSON.stringify(name)} is one the viewer is a member of`).toBeDefined()
  return folder?.my_label ?? null
}

async function ensureFolder(page: Page, name: string): Promise<string> {
  const existing = (await memberships(page)).find((entry) => entry.name === name)
  if (existing !== undefined) return existing.id
  const token = await csrfToken(page.context())
  const created = await page.request.post('/api/v1/folders', {
    data: { name },
    headers: { 'X-CSRF-Token': token },
  })
  expect(
    created.status(),
    `POST /folders answered ${created.status()}: ${await created.text()}`,
  ).toBe(201)
  return ((await created.json()) as { id: string }).id
}

/**
 * A folder row's own menu in the sidebar, which 9.1 describes as "its own
 * menu" and does not name.
 *
 * Scoped to the row, which is 9.1's sections rule applied where it applies:
 * the row is generated from the folder, so the folder is what identifies it.
 * The control inside it is matched on the words section 9 uses for an
 * overflow menu elsewhere, "More actions" being the name it gives the two it
 * does name. This is a description match pending a name and is part of this
 * package's escalation, exactly as eight controls were before the P8 change
 * control named them.
 */
function folderMenu(page: Page, folder: string): Locator {
  return sidebar(page)
    .getByRole('listitem')
    .filter({ hasText: folder })
    .getByRole('button', { name: /more|manage|action|option/i })
}

/**
 * A group's own menu in the sidebar, matched on 9.1's own word for the thing
 * it acts on. The collapsible control carries the label exactly (9.1's
 * sections rule), so a name that merely contains the label is the other one.
 * Description match, escalated with the rest.
 */
function groupMenu(page: Page, label: string): Locator {
  return sidebar(page).getByRole('button', { name: new RegExp(`group|${label}\\s+\\S`, 'i') })
}

test.beforeEach(async ({ page }) => {
  await signIn(page, seedSubs.hassan)
})

test.describe('AC-180: folder groups are the personal label and nothing else', () => {
  test('AC-180: a group is created by naming it on a folder', async ({ page }) => {
    await ensureFolder(page, FOLDER_A)
    await page.goto(routes.myDay)

    await clickControl(
      folderMenu(page, FOLDER_A).first(),
      "spec 9.1: a folder is moved between groups from its own menu, so the row carries one",
    )
    await clickControl(
      page.getByRole('menuitem', { name: /group/i }),
      'spec 9.1: "a group is created by naming it", which is an action on a folder because a ' +
        'group is the label of that folder\'s membership and nothing else',
    )
    await fillControl(
      page.getByRole('dialog').getByRole('textbox').first(),
      GROUP,
      'spec 9.1: creating a group is naming it',
    )
    await clickControl(
      page.getByRole('dialog').getByRole('button', { name: /save|create|continue/i }).first(),
      'spec 9.1: the name is committed',
    )

    expect(
      await labelOf(page, FOLDER_A),
      'spec 9.1 and frozen 7.4: a group is the label of my-membership, so creating one writes ' +
        'that label. A sidebar that regrouped its own rendering without writing anything looks ' +
        'correct until the next reload, and AC-155 reads only the order',
    ).toBe(GROUP)
    await expect(
      sidebar(page).getByRole('button', { name: GROUP, exact: true }),
      'spec 9.1: per-member label groups are collapsible, so the label is a control in the ' +
        'sidebar carrying the group\'s name',
    ).toBeVisible()
  })

  test('AC-180: a group is renamed', async ({ page }) => {
    const id = await ensureFolder(page, FOLDER_A)
    const token = await csrfToken(page.context())
    await page.request.patch(`/api/v1/folders/${id}/my-membership`, {
      data: { label: GROUP, color: '#4477CC' },
      headers: { 'X-CSRF-Token': token },
    })
    await page.goto(routes.myDay)

    await expect(
      sidebar(page).getByRole('button', { name: GROUP, exact: true }),
      'spec 9.1: the group is a collapsible control carrying its own label, and it is in the ' +
        'sidebar before it is renamed',
    ).toBeVisible()
    await clickControl(
      groupMenu(page, GROUP).first(),
      'spec 9.1: a group is renamed, so the group carries a control that renames it',
    )
    await clickControl(
      page.getByRole('menuitem', { name: /rename/i }),
      'spec 9.1: a group is renamed',
    )
    await fillControl(
      page.getByRole('dialog').getByRole('textbox').first(),
      RENAMED,
      'spec 9.1: renaming a group is naming it again',
    )
    await clickControl(
      page.getByRole('dialog').getByRole('button', { name: /save|rename|continue/i }).first(),
      'spec 9.1: the new name is committed',
    )

    expect(
      await labelOf(page, FOLDER_A),
      'spec 9.1 and frozen 7.4: renaming a group rewrites the label on every membership ' +
        'carrying it, there being nothing else a group is',
    ).toBe(RENAMED)
  })

  test('AC-180: a folder moves between groups and out of every group', async ({ page }) => {
    const id = await ensureFolder(page, FOLDER_B)
    // The destination has to exist, a group being the label some folder
    // carries and nothing else, so a third folder carries it.
    const destination = await ensureFolder(page, `${FOLDER_B} destination`)
    const token = await csrfToken(page.context())
    await page.request.patch(`/api/v1/folders/${id}/my-membership`, {
      data: { label: GROUP, color: '#33AA55' },
      headers: { 'X-CSRF-Token': token },
    })
    await page.request.patch(`/api/v1/folders/${destination}/my-membership`, {
      data: { label: OTHER_GROUP, color: '#AA5533' },
      headers: { 'X-CSRF-Token': token },
    })
    await page.goto(routes.myDay)

    await clickControl(
      folderMenu(page, FOLDER_B).first(),
      'spec 9.1: "a folder is moved between groups from its own menu"',
    )
    await clickControl(
      page.getByRole('menuitem', { name: /move/i }),
      'spec 9.1: the folder\'s own menu carries the move',
    )
    await clickControl(
      page.getByRole('menuitem', { name: OTHER_GROUP }).or(
        page.getByRole('option', { name: OTHER_GROUP }),
      ),
      `spec 9.1: the move offers the other groups, and ${OTHER_GROUP} is one this account ` +
        'carries',
    )
    expect(
      await labelOf(page, FOLDER_B),
      'spec 9.1: moving a folder between groups is rewriting its own label and nothing else',
    ).toBe(OTHER_GROUP)

    await clickControl(
      folderMenu(page, FOLDER_B).first(),
      'spec 9.1: the folder\'s own menu again, for the move out',
    )
    await clickControl(
      page.getByRole('menuitem', { name: /move/i }),
      'spec 9.1: the folder\'s own menu carries the move',
    )
    await clickControl(
      page.getByRole('menuitem', { name: /ungrouped|no group|none/i }).or(
        page.getByRole('option', { name: /ungrouped|no group|none/i }),
      ),
      'spec 9.1: a folder can move out of every group, the unlabeled folders being a place in ' +
        'that list rather than the absence of one',
    )
    expect(
      await labelOf(page, FOLDER_B),
      'spec 9.1 and 4.4: moving out of every group clears the label to null. An empty string ' +
        'would put this folder in a group named "" and 4.4 has no opinion about it, which is a ' +
        'row that renders as a nameless group nobody can leave',
    ).toBeNull()
  })

  test('AC-180: deleting a group keeps every folder and every task in it', async ({ page }) => {
    const id = await ensureFolder(page, FOLDER_A)
    const token = await csrfToken(page.context())
    await page.request.patch(`/api/v1/folders/${id}/my-membership`, {
      data: { label: GROUP, color: '#4477CC' },
      headers: { 'X-CSRF-Token': token },
    })
    await createTask(page, { title: TASK_IN_A, folder_id: id })
    await page.goto(routes.myDay)

    await clickControl(
      groupMenu(page, GROUP).first(),
      'spec 9.1: a group is deleted, so the group carries a control that deletes it',
    )
    await clickControl(
      page.getByRole('menuitem', { name: /delete/i }),
      'spec 9.1: a group is deleted',
    )
    await expect(
      page.getByText(/Delete folder group\? \d+ folders keep their tasks and move to the ungrouped list\./),
      'spec 9.1: "Deleting a group deletes no folder and no task: confirm \\"Delete folder ' +
        'group? {N} folders keep their tasks and move to the ungrouped list.\\"" A person ' +
        'deleting something called a folder group has every reason to fear they are deleting ' +
        'folders, and this sentence is the only thing that tells them otherwise',
    ).toBeVisible()
    await clickControl(
      page.getByRole('button', { name: 'Continue', exact: true }),
      'spec 9.1: every confirmation offers Continue and Cancel',
    )

    expect(
      await labelOf(page, FOLDER_A),
      'spec 9.1: "deleting one clears that label from every folder carrying it", so the folder ' +
        'is ungrouped and still the viewer\'s',
    ).toBeNull()

    const folder = await page.request.get(`/api/v1/folders/${id}`)
    expect(
      folder.status(),
      'spec 9.1: deleting a group deletes no folder. Asserted through 7.4 rather than off the ' +
        'page, because the implementation of this operation is writes to folder_members.label ' +
        'and one that reached for DELETE /folders instead would destroy tasks for every member',
    ).toBe(200)
    const search = await page.request.get(
      `/api/v1/search?q=${encodeURIComponent(TASK_IN_A)}&tz=UTC`,
    )
    expect(
      ((await search.json()) as { rows: { title: string }[] }).rows.filter(
        (row) => row.title === TASK_IN_A,
      ).length,
      'spec 9.1: and no task. 8.8 cascades a folder deletion to its tasks, so a group deletion ' +
        'that reached the folder would take this row with it and the sidebar would look exactly ' +
        'the same afterwards',
    ).toBe(1)
  })
})
