/*
AC-181: given the "New folder" action of 9.1, then it opens a dialog taking a
name and creating the folder; and given 9.6's "Label and color", then it opens
a dialog taking the personal label and the colour together and writing both.

Appended to section 12 by RFC 0002, Accepted 2026-08-13. The sentence above
is that RFC's Append unit transcribed unchanged, and it becomes section 12's
own text when the delta merges.

Two actions section 9 has named since it was written and never said what
happens when they are pressed. "New folder" sits in 9.1's sidebar bullet and
"Label and color" in 9.6's overflow menu, and until this change control the
only thing either owed was to exist. 9.6 now says what the second one takes
and why: "both being the two fields of 7.4's my-membership and neither
meaning anything without the other".

**The pairing is the whole of the second half.** A colour with no label is a
dot in a list with nothing to group it under, and a label with no colour is a
group whose rows are the one thing on that list a person cannot pick out. 7.4
puts them on one row and takes them in one PATCH, so a dialog offering one of
them is a dialog that will write a null over the other, which is a loss
nothing on the page reports.

**Both are asserted through 7.4 as well as on the page.** A dialog that
collects a name and never sends it looks identical to one that works, until
the list is reloaded; the folder is read back through GET /folders and the
membership through the same response's my_label and my_color.

**The colour is asserted to be the one that was chosen, not merely non-null.**
4.4 gives folder_members.color a free-form #RRGGBB check, and 11.4 records
that this value is data on the wire rather than a design token precisely
because a client that mapped it onto its own swatches would paint a folder a
colour its owner did not pick. A dialog writing a default instead of the
choice is that same defect at the point of entry.

**The dialogs' fields have no names in any numbered section.** 9.1 and 9.6
name the two actions and say what the dialogs take without naming a control,
so the name field is addressed as the dialog's only text box and the two
membership fields on 9.6's own words. Routed to the Integration Steward with
the rest of this package's naming gaps.

Spec: 9.1 (the "New folder" action), 9.6 (the header overflow menu and "Label
and color", which takes both fields together), frozen 7.4 (POST /folders and
PATCH my-membership), 4.4 (the colour's check), 11.4 (why the colour is data
and not a token).
*/
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  clickControl,
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

const NEW_FOLDER = 'ac-181 made from the dialog'
const LABELLED_FOLDER = 'ac-181 folder to label'
const LABEL = 'ac-181 personal label'
/** Free-form under 4.4, and not a value any default is likely to be. */
const COLOR = '#7B2D8E'

interface Folder {
  id: string
  name: string
  my_label: string | null
  my_color: string | null
}

async function folders(page: Page): Promise<Folder[]> {
  await waitForApiIdle(
    page,
    'the dialog\'s write has to have been sent and answered before 7.4 is asked what it holds',
  )
  const response = await page.request.get('/api/v1/folders')
  expect(
    response.status(),
    `GET /folders answered ${response.status()}: ${await response.text()}`,
  ).toBe(200)
  return (await response.json()) as Folder[]
}

async function ensureFolder(page: Page, name: string): Promise<string> {
  const existing = (await folders(page)).find((folder) => folder.name === name)
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

test.beforeEach(async ({ page }) => {
  await signIn(page, seedSubs.hassan)
})

test.describe('AC-181: the two folder dialogs', () => {
  test('AC-181: "New folder" opens a dialog that takes a name and creates the folder', async ({
    page,
  }) => {
    await page.goto(routes.myDay)
    await clickControl(
      sidebar(page).getByRole('button', { name: 'New folder', exact: true }),
      'spec 9.1: the sidebar carries a "New folder" action, named by that section itself',
    )

    const dialog = page.getByRole('dialog')
    await expect(
      dialog,
      'spec 9.1 as RFC 0002 amends it: the action opens a dialog. Until this change control ' +
        'the only thing it owed was to exist, so what it opens is what this criterion adds',
    ).toBeVisible()
    const name = dialog.getByRole('textbox')
    await expect(
      name,
      'spec 9.1: the dialog takes a name, and a name is the one field a new folder has. ' +
        'Asserted as the only text box because that is what "taking a name" means and because ' +
        'no numbered section names the control',
    ).toHaveCount(1)
    await fillControl(name, NEW_FOLDER, 'spec 9.1: the dialog takes a name')
    await clickControl(
      dialog.getByRole('button', { name: /create|save|continue|add/i }).first(),
      'spec 9.1: and creates the folder, so the dialog commits',
    )

    const created = (await folders(page)).find((folder) => folder.name === NEW_FOLDER)
    expect(
      created,
      'spec 9.1 and frozen 7.4: "creating the folder" is POST /folders, so the folder exists ' +
        'on the server. A dialog that collects a name and never sends it looks identical to ' +
        'one that works until the list is reloaded',
    ).toBeDefined()
    await expect(
      sidebar(page).getByRole('link', { name: new RegExp(NEW_FOLDER) }),
      'spec 9.1: and the sidebar lists every accessible folder, so the new one is in it, which ' +
        'is 8.3 refetching after an own mutation',
    ).toBeVisible()
  })

  test('AC-181: "Label and color" takes both together and writes both', async ({ page }) => {
    // This file's own folder and never the seeded shared one. AC-155 reads
    // the label the seed puts on Groceries, "Home", to assert that label
    // groups sort ahead of the unlabeled folders, so writing over it here
    // would fail a passing criterion in another file and look like a client
    // defect. The harness's standing rule is that a spec creates its own rows.
    const target = await ensureFolder(page, LABELLED_FOLDER)
    await page.goto(routes.folder(target))
    await clickControl(
      regionOf(page, 'Folder header').getByRole('button', {
        name: 'More actions',
        exact: true,
      }),
      'spec 9.6 and 9.1: the folder header is a named region carrying the overflow menu, and ' +
        'reaching that menu as the first match on the page would be addressing by position, ' +
        'which is what naming the region removed',
    )
    await clickControl(
      page.getByRole('menuitem', { name: /label and colou?r/i }),
      'spec 9.6: the header overflow carries "Label and color", personal to the viewer',
    )

    const dialog = page.getByRole('dialog')
    await expect(
      dialog,
      'spec 9.6: "\\"Label and color\\" opens a dialog taking the folder\'s personal label and ' +
        'its colour together"',
    ).toBeVisible()

    const label = dialog.getByLabel(/label/i)
    const colour = dialog.getByLabel(/colou?r/i)
    await expect(
      label,
      'spec 9.6: the dialog takes the personal label, which is one of the two fields of 7.4\'s ' +
        'my-membership',
    ).toHaveCount(1)
    await expect(
      colour,
      'spec 9.6: and the colour, together, "neither meaning anything without the other". A ' +
        'colour with no label is a dot with nothing to group it under, and a label with no ' +
        'colour is a group whose rows cannot be picked out',
    ).toHaveCount(1)

    await fillControl(label, LABEL, 'spec 9.6: the dialog takes the personal label')
    await fillControl(colour, COLOR, 'spec 9.6: and the colour')
    await clickControl(
      dialog.getByRole('button', { name: /save|continue|apply/i }).first(),
      'spec 9.6: and writes both',
    )

    const folder = (await folders(page)).find((entry) => entry.id === target)
    expect(
      folder?.my_label,
      'spec 9.6 and frozen 7.4: the dialog writes the label onto my-membership. 7.4 takes the ' +
        'two in one PATCH, so a dialog offering one of them writes a null over the other, ' +
        'which is a loss nothing on the page reports',
    ).toBe(LABEL)
    expect(
      folder?.my_color?.toUpperCase(),
      'spec 9.6 and 4.4: and the colour that was chosen, not a default. 11.4 records that this ' +
        'value is data on the wire rather than a design token precisely because a client ' +
        'mapping it onto its own swatches would paint a folder a colour its owner did not pick',
    ).toBe(COLOR)
  })
})
