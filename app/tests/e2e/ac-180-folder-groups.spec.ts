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

**The controls are addressed by the names 9.1 now gives them.** This file
matched descriptions when it was written, because that section named the "New
folder" action and named no control for creating, renaming, deleting or moving
a group, saying only that a folder is moved "from its own menu"; the gap was
routed to the Integration Steward on the P8 precedent where eight controls
described but not named were escalated rather than guessed at. The P8R
mid-package change control of 2026-08-13 answered it, on this role's own
escalation, and the owner re-accepted the same day: the four actions are "New
folder group", "Rename group", "Delete group" and "Move to group", a folder
row's menu and a folder group's menu are both "More actions", and a
folder-group dialog's field is "Group name". Every locator below is a fixed
string of that kind. A description matched loosely is a locator that finds the
wrong control on the day a second one resembles it, which is 9.1's own reason
for naming anything. **Three of those four have since moved and the two
paragraphs below say which, when and on whose authority**; the rule did not
move with them.

**One of those four moved at S17b, and S17a is where the move was scheduled.**
The act read "Move to group" until this package, and `lib/object-acts.ts`
records why in terms: it was "Move to group" rather than 9.6's "Move to shelf"
"because that is what AC-180 asserts on the surface that has it today and
because shelves reaching the Library is S17b's row, not this one. When that row
lands, the word changes here and in one place." This is that row. 9.6 fixes the
string, "a member's personal shelf placement is 'Move to shelf' on the row",
and S17b makes the Library's groups the viewer's shelves rather than the bare
`folder_members.label` strings they were, so the act and the thing it moves a
folder onto now carry one name. A group is still that label, the four
operations are still the same four, and every assertion below asserts what it
asserted.

**Two more of those four strings moved, and the S-fold is what moved them
rather than S17b.** "Rename group" and "Delete group" came from the P8R change
control of 2026-08-13, against a 9.1 that has since been replaced whole: the
v2 names table of `docs/spec/09-ui.md` names neither, and its regions clause
reads "the sidebar, one region per shelf named by it", so the section no longer
describes a bare label group at all. What it does describe is 9.10's shelf
contract, and DES-201 declares that contract's words: "Rename shelf" and
"Delete shelf…", a bare verb being the one label a person should never have to
guess the object of. So these two locators were asserting v1 strings that the
fold of item 28 retired and nobody re-read, which is change control item 16's
own shape one table over. This criterion's sentence is untouched: what it
promises is that a group can be renamed and deleted and that the folders and
their tasks survive, and all three are asserted exactly as before.

**One locator moved with the heading, and the whole leg found it rather than a
grep.** Two cases addressed the group by `getByRole('button', { name: GROUP })`, on the
reading that "the label is a control in the sidebar carrying the group's name",
which was true while the whole heading row was one collapse trigger. DES-207
splits that row: "the glyph is the disclosure; the name is the way in", because
a shelf has a page now and the row has to behave like every other row that
names something you can open. So the name is a link where a shelf backs the
label and plain text where none does, and the disclosure is its own control
named for what it does. These two now address that control, which exists in
both cases and still carries the label, so the clause they assert, that the
group is in the sidebar, collapsible, and named for itself, is unchanged. The
S17b port's pre-flight grep looked for the strings it was retiring and this was
not one of them; the leg is what found it, which is the S11 lesson again.

Two controls are still descriptions and are marked where they are used,
because that table reaches neither. A dialog's commit control is named nowhere
in section 9 outside 9.3's "Save" and the "Continue" of a confirmation, and
the entry that clears a folder's label has no string at all, 9.1 calling the
unlabeled folders a place in the list rather than an action.

**The move-to-group entries are matched across the three roles a menu-borne
single choice takes.** 9.1's roles table fixes six elements and this is not one
of them, and its own preamble says a control it does not reach "is reached by
its role in the ordinary sense of the word". A group choice inside a menu is a
menu item in that ordinary sense; where the choice is single-valued and reports
which one is current, `menuitemradio` is the ARIA role for exactly that, and a
listbox rendering of the same choice is `option`. All three are true of it, the
way 9.1 says of its own search input that a search box and a text box are both
true of it. The third was missing and the installed primitive renders it, which
took this case red on an addressing guess rather than on the behaviour it
asserts; the assertion, that choosing a group rewrites `my_label` and that
choosing none clears it to null, is unchanged.

Spec: 9.1 (folder groups and their four operations, their names, the
delete-group confirm, the folder list's order, the roles table and its
preamble), frozen 7.4 (my-membership, which a group is the label of), 4.4,
8.11, AC-023, AC-155.
*/
import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  clickControl,
  createTask,
  csrfToken,
  fillControl,
  regionOf,
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
 * menu" and names "More actions" since the P8R change control of 2026-08-13.
 *
 * Scoped to the row, which is 9.1's sections rule applied where it applies:
 * the row is generated from the folder, so the folder is what identifies it.
 * Four controls now share that name deliberately, being the same control
 * pointed at different objects, and the section's answer to telling them
 * apart is the container rather than a fourth string. So the scope is the
 * assertion here and the name is exact.
 */
function folderMenu(page: Page, folder: string): Locator {
  return sidebar(page)
    .getByRole('listitem')
    .filter({ hasText: folder })
    .getByRole('button', { name: 'More actions', exact: true })
}

/**
 * A group's own menu in the sidebar, the fourth control answering to "More
 * actions" and reached inside the region its object names.
 *
 * 9.1's sections table gives the sidebar "one per personal label group, named
 * by that label", so a label group is a named region and a control inside one
 * is addressed as that control within that region. That is the same rule the
 * folder page's header and sharing panel are reached by, and it is what makes
 * the shared name unambiguous without a fourth string.
 */
function groupMenu(page: Page, label: string): Locator {
  return regionOf(page, label).getByRole('button', { name: 'More actions', exact: true })
}

/**
 * One destination inside the "Move to shelf" submenu.
 *
 * Three roles because a menu-borne single choice is all three in the ordinary
 * sense 9.1's roles table sends an unlisted control to, and because the
 * criterion is about what choosing one writes rather than about which of them
 * an implementation renders. See this file's header.
 */
function moveDestination(page: Page, name: string | RegExp): Locator {
  return page
    .getByRole('menuitemradio', { name })
    .or(page.getByRole('menuitem', { name }))
    .or(page.getByRole('option', { name }))
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
      page.getByRole('menuitem', { name: 'New folder group', exact: true }),
      'spec 9.1: "a group is created by naming it", which is an action on a folder because a ' +
        'group is the label of that folder\'s membership and nothing else. The action is named ' +
        '"New folder group" by that section\'s names table since 2026-08-13',
    )
    await fillControl(
      page.getByRole('dialog').getByLabel(/^\s*Group name\s*$/i),
      GROUP,
      'spec 9.1: creating a group is naming it, and that section names the field "Group name". ' +
        'The dialog names its field and not itself, a dialog being announced by its own title',
    )
    await clickControl(
      page.getByRole('dialog').getByRole('button', { name: /save|create|continue/i }).first(),
      'spec 9.1: the name is committed. A description rather than a name, this being one of ' +
        "the two controls this file still matches loosely: section 9 names a dialog's commit " +
        'control nowhere outside 9.3\'s "Save" and a confirmation\'s "Continue"',
    )

    expect(
      await labelOf(page, FOLDER_A),
      'spec 9.1 and frozen 7.4: a group is the label of my-membership, so creating one writes ' +
        'that label. A sidebar that regrouped its own rendering without writing anything looks ' +
        'correct until the next reload, and AC-155 reads only the order',
    ).toBe(GROUP)
    await expect(
      sidebar(page).getByRole('button', { name: `Show the folders on ${GROUP}`, exact: true }),
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
      sidebar(page).getByRole('button', { name: `Show the folders on ${GROUP}`, exact: true }),
      'spec 9.1: the group is a collapsible control carrying its own label, and it is in the ' +
        'sidebar before it is renamed',
    ).toBeVisible()
    await clickControl(
      groupMenu(page, GROUP).first(),
      'spec 9.1: a group is renamed, so the group carries a control that renames it',
    )
    await clickControl(
      page.getByRole('menuitem', { name: 'Rename shelf', exact: true }),
      'spec 9.10: the shelf\'s overflow carries its contract, whose rename reads "Rename ' +
        'shelf" in the declaration DES-201 makes of it, a bare verb being the one label a ' +
        'person should never have to guess the object of',
    )
    await fillControl(
      page.getByRole('dialog').getByLabel(/^\s*Group name\s*$/i),
      RENAMED,
      'spec 9.1: renaming a group is naming it again, through the same "Group name" field',
    )
    await clickControl(
      page.getByRole('dialog').getByRole('button', { name: /save|rename|continue/i }).first(),
      'spec 9.1: the new name is committed. A description for the reason given at the case above',
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
      page.getByRole('menuitem', { name: 'Move to shelf', exact: true }),
      'spec 9.1: the folder\'s own menu carries the move, named "Move to shelf" by that ' +
        "section's names table",
    )
    await clickControl(
      moveDestination(page, OTHER_GROUP),
      `spec 9.1: the move offers the other groups, and ${OTHER_GROUP} is one this account ` +
        'carries. Matched across the three roles a menu-borne single choice takes, per this ' +
        "file's header: 9.1's roles table does not reach this control and sends it to its role " +
        'in the ordinary sense, which menuitemradio, menuitem and option are each true of',
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
      page.getByRole('menuitem', { name: 'Move to shelf', exact: true }),
      'spec 9.1: the folder\'s own menu carries the move',
    )
    await clickControl(
      moveDestination(page, /ungrouped|no group|none/i),
      'spec 9.1: a folder can move out of every group, the unlabeled folders being a place in ' +
        'that list rather than the absence of one. The second of the two controls this file ' +
        'still matches by description: that section names the four group actions and names no ' +
        'string for the entry that clears the label',
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
      page.getByRole('menuitem', { name: 'Delete shelf…', exact: true }),
      'spec 9.10: the shelf\'s overflow carries its contract, whose destructive act is ' +
        '"Delete shelf…", the ellipsis being 9.1\'s own since S24 because the act opens a ' +
        'confirmation (RFC 0005 change control item 44, A1). 9.1 v2 names no "Delete group" ' +
        'at all, and its regions clause reads ' +
        '"the sidebar, one region per shelf named by it", so a bare label group is not a ' +
        'thing that section still describes',
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
