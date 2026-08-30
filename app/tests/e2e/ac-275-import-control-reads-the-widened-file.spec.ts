/*
AC-275: given a workflow file of 7.16 as widened, whose task carries a repeat,
when it is chosen through the sidebar's Import control, then the request
carries the viewer's tz, the folder appears in the Library, and the task is
in it; and given a file that is not a workflow at all, then nothing is sent
and the person is told.

Numbered at S27 by the Adversarial Test Engineer, the second free number
after AC-273 at the row's opening, and appended to section 12 for RFC 0004's
S27 row and its item 44 clause: "the Import control reads the widened 7.16
file S22a lands".

**Why the control and not the endpoint.** AC-272 and AC-273 pin the server:
the widened file imports, and a repeat needs a zone or is refused 422 naming
tz. The control is the half neither can see. `useImportWorkflow` posted to
`/workflows/import` with no tz at all until S27, which means every file the
widening admits and AC-273 requires a zone for was refused by the client's
own omission, while every file from before the widening imported exactly as
before. A criterion that imports through the address passes against that
client; one that chooses the file through the control does not.

**The request is watched for the zone rather than the folder read for the
date**, because the folder's task list is a view read that carries its own
tz, and asserting the anchor there would be asserting the view rather than
the import. AC-273 already reads the anchor off the created task.

**The refusal is local.** 9.1 calls the control "Import (a workflow file)",
and a file that is not one is refused before any request is made, with the
sentence the shell writes for it. The negative case counts the requests,
which is the same instrument AC-156 uses for the debounce.

Spec: 9.1 (the footer's Import), 7.16 as amended by RFC 0005 change control
item 44 B3, 7.6's tz precedent, AC-272, AC-273, RFC 0004's S27 row.
*/
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  deleteFolder,
  routesV2,
  seedSubs,
  shortName,
  sidebar,
  signIn,
  TEST_TIMEOUT_MS,
  waitForApiIdle,
  watchWire,
} from './harness.js'

test.use({ timezoneId: 'America/Edmonton', actionTimeout: ACTION_TIMEOUT_MS })
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

/** The sidebar's hidden file input, which the Import control presses. */
function importInput(page: Page) {
  return sidebar(page).locator('input[type="file"]')
}

async function chooseFile(page: Page, name: string, body: string): Promise<void> {
  await importInput(page).setInputFiles({
    name,
    mimeType: 'application/json',
    buffer: Buffer.from(body, 'utf8'),
  })
}

test.describe('AC-275: the Import control reads the widened file', () => {
  let folderId: string | null = null

  test.beforeEach(async ({ page }) => {
    await signIn(page, seedSubs.hassan)
  })

  test.afterEach(async ({ page }) => {
    if (folderId !== null) await deleteFolder(page, folderId)
    folderId = null
  })

  test('AC-275: a file carrying a repeat imports through the control with the zone', async ({
    page,
  }) => {
    const folderName = shortName('s27imp')
    const taskTitle = shortName('s27rep')
    const wire = watchWire(page)
    await page.goto(routesV2.desk)

    const answered = page.waitForResponse((response) =>
      response.url().includes('/api/v1/workflows/import'),
    )
    await chooseFile(
      page,
      'weekly.dana-workflow.json',
      JSON.stringify({
        dana: 'workflow',
        version: 1,
        name: folderName,
        folders: [
          {
            name: folderName,
            tasks: [{ title: taskTitle, recurrence_rule: 'FREQ=WEEKLY;BYDAY=MO', important: true }],
          },
        ],
      }),
    )
    const response = await answered
    expect(
      response.status(),
      `spec 7.16: the import is accepted; the server answered ${response.status()}: ` +
        (await response.text()),
    ).toBe(201)
    await waitForApiIdle(page, 'the import lands before the Library is read')

    const imports = wire.calls.filter((call) => call.url.includes('/api/v1/workflows/import'))
    expect(
      imports.length,
      'spec 9.1: the Import control sends the file to 7.16, once',
    ).toBe(1)
    expect(
      imports[0]?.url,
      'spec 7.16 as widened and 7.6\'s tz precedent: a file whose task carries a repeat ' +
        'evaluates a date, so the request carries the viewer\'s zone. Without it the server ' +
        'answers 422 naming tz (AC-273), which is what the control did until S27: ' +
        JSON.stringify(imports.map((call) => call.url)),
    ).toContain('tz=America%2FEdmonton')

    await expect(
      sidebar(page).getByRole('link', { name: new RegExp(folderName) }).first(),
      'spec 7.16: the import makes the folder, and 9.1\'s Library lists it',
    ).toBeVisible()
    /* By pattern: the Library row wears its pending count beside the name. */
    const row = sidebar(page).getByRole('link', { name: new RegExp(folderName) }).first()
    const href = await row.getAttribute('href')
    folderId = href?.split('/').pop() ?? null
    await row.click()
    await expect(
      page.getByRole('main').getByText(taskTitle).first(),
      'AC-272: the widened file\'s task arrives with its title, and the repeat is stored ' +
        'against it, which the folder page draws as a row',
    ).toBeVisible()
  })

  test('AC-275: a file that is not a workflow is refused before any request', async ({ page }) => {
    const wire = watchWire(page)
    await page.goto(routesV2.desk)

    await chooseFile(page, 'notes.json', JSON.stringify({ hello: 'world' }))
    await expect(
      page.getByText("That file isn't a workflow Dana can read."),
      'the shell\'s own sentence for a file that is JSON and not 7.16\'s shape: refused ' +
        'here, where the page can say so plainly, rather than sent to be refused with a ' +
        'key name',
    ).toBeVisible()
    expect(
      wire.calls.filter((call) => call.url.includes('/api/v1/workflows/import')).length,
      'nothing was sent: a file the shared schema refuses never reaches the address',
    ).toBe(0)
  })
})
