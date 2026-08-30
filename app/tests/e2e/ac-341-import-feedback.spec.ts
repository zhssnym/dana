/*
AC-341: given a workflow file chosen through the sidebar's Import, then a
toast says what was made and how many tasks it holds, the imported folder
opens, and a file naming a folder the Library already has arrives as
"<name> (imported)" rather than as a second folder of the same name.

Authored 2026-08-30 at the polish round (settings F3): a successful import
was the one act in the app that said nothing, and it made a second "Desk".

Spec: 9.1 (Import), 7.16 (the workflow file).
*/
import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

import {
  caseTitle,
  routesV2,
  seedSubs,
  sidebar,
  signIn,
  TEST_TIMEOUT_MS,
  waitForApiIdle,
} from './harness.js'

test.describe.configure({ timeout: TEST_TIMEOUT_MS })

/*
A Library row's link carries the folder's open count inside its own name
("Reading 3"), so the name is matched with the count optional rather than
exactly; `sidebarLink` is exact and is right for the page rows, which have
no count. Anchored at both ends, because "X" is a prefix of "X (imported)".
*/
function libraryLink(page: Page, name: string): Locator {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return sidebar(page).getByRole('link', { name: new RegExp(`^${escaped}( \\d+)?$`) })
}

test('AC-341: an import says what it made, opens it, and never doubles a name', async ({ page }) => {
  await signIn(page, seedSubs.hassan)
  await page.goto(routesV2.today)
  const name = caseTitle('AC-341 Imported')
  const file = (folderName: string) =>
    Buffer.from(
      JSON.stringify({
        dana: 'workflow',
        version: 1,
        name: folderName,
        folders: [{ name: folderName, tasks: [{ title: 'Call mum' }, { title: 'Water the plants' }] }],
      }),
    )
  const input = sidebar(page).locator('input[type="file"]')

  await input.setInputFiles({ name: 'first.dana-workflow.json', mimeType: 'application/json', buffer: file(name) })
  await expect(page.getByText(`Imported "${name}" with 2 tasks`), 'settings F3: the import says what it made').toBeVisible()
  await expect(page, 'settings F3: and opens it').toHaveURL(/\/app\/folders\//)
  await waitForApiIdle(page, 'the folder has loaded')
  await expect(libraryLink(page, name), 'the folder is in the Library once').toHaveCount(1)

  await input.setInputFiles({ name: 'second.dana-workflow.json', mimeType: 'application/json', buffer: file(name) })
  await expect(
    page.getByText(`Imported "${name} (imported)" with 2 tasks`),
    'settings F3: a name the Library already has is suffixed rather than doubled',
  ).toBeVisible()
  await waitForApiIdle(page, 'the second folder has loaded')
  await expect(libraryLink(page, name), 'the original is still the only one by that name').toHaveCount(1)
  await expect(libraryLink(page, `${name} (imported)`)).toHaveCount(1)
})
