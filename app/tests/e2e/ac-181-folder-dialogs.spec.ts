/*
AC-181: given the "New folder" action of 9.1, then it opens a dialog taking a
name and creating the folder.

Appended to section 12 by RFC 0002, Accepted 2026-08-13, as a sentence of two
halves; the sentence above is the one RFC 0005 change control item 14
replaced it with, accepted as recommended by Imran on 2026-08-25, and it is
section 12's own text now.

**The second half retired with the dialog it named.** The criterion asserted
9.6's "Label and color", the dialog that took 7.4's my_label and my_color
together, and the 9.6 that RFC 0005 replaces it with retires the dialog in
terms: the folder's icon and colour are the shared identity, set from the
mark; a member's personal shelf placement is "Move to shelf" on the row; and
4.4's per-member color column is written by no v2 surface, existing values
unused, the column frozen and staying. A criterion asserting a surface the
specification removes in terms is a criterion whose text is false in that
clause, so the clause went to the owner as a Replace unit rather than being
reinterpreted here, and the case that asserted the pairing is deleted with
it. What the pairing protected, that a member's grouping and its colour move
together, has no v2 surface to be asserted against.

**"New folder" earns the surviving sentence unchanged.** The action moved
from 9.1's sidebar bullet to the footer's four actions, named in the v2
names table, and what it owes is what it always owed: a dialog taking a
name, and the folder existing on the server afterwards. The folder is read
back through GET /folders because a dialog that collects a name and never
sends it looks identical to one that works, until the list is reloaded. The
name field is addressed as the dialog's only text box, no numbered section
naming the control.

**It moved a third time at the polish round of 2026-08-30 and the sentence
still does not move**, which is the whole point of a criterion written about
an act rather than about a place. The owner emptied the sidebar footer to
give the Library its room, and the three acts of making became one "New"
control on the Library's heading. So the case reaches the act through that
menu instead of through a footer button; everything after the first press is
byte-for-byte what it was, because nothing about what "New folder" owes has
changed. AC-264 is the criterion that owns where the control lives.

Spec: 9.1 (the "New folder" act, at the Library's "New" control since
2026-08-30), 9.6 (the shared identity that retired "Label and color"), frozen
7.4 (POST /folders), RFC 0005 change control item 14 (the Replace and its
acceptance).
*/
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  clickControl,
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

const NEW_FOLDER = 'ac-181 made from the dialog'

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

test.beforeEach(async ({ page }) => {
  await signIn(page, seedSubs.hassan)
})

test.describe('AC-181: the "New folder" dialog', () => {
  test('AC-181: "New folder" opens a dialog that takes a name and creates the folder', async ({
    page,
  }) => {
    await page.goto(routes.myDay)
    await clickControl(
      sidebar(page).getByRole('button', { name: 'New', exact: true }),
      'spec 9.1: the Library heading carries the "New" control, which is where the three ' +
        'acts of making went when the owner emptied the footer on 2026-08-30',
    )
    await clickControl(
      page.getByRole('menuitem', { name: 'New folder', exact: true }),
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

  // The "Label and color" case stood here until RFC 0005 change control
  // item 14. The v2 9.6 retires the dialog in terms, so the case went with
  // the criterion clause that asserted it; the header records the Replace
  // and its acceptance.
})
