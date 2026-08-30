/*
AC-333: given a folder in which a task was added and a person invited, when
"..." > History is opened, then each row reads as a sentence naming who did
what ("<name> added “<task>”", "<name> invited <email>"), and the window
bar's "Edited N ago" line is a line rather than a second door to the record.

Authored 2026-08-30 at the polish round (pagehead F4, folderpage F3): the
sheet read "Edited edited the page" seven times, said nothing about tasks or
invites, and a popover on the activity line showed the same rows truncated.

Spec: 9.6 (History), 7.12 (the folder read), 4.13.
*/
import { expect, test } from '@playwright/test'

import {
  caseTitle,
  clickControl,
  createFolder,
  createTask,
  csrfToken,
  routesV2,
  seedSubs,
  signIn,
  TEST_TIMEOUT_MS,
} from './harness.js'

test.describe.configure({ timeout: TEST_TIMEOUT_MS })

test('AC-333: the folder\'s history reads as sentences and covers tasks and invites', async ({
  page,
}) => {
  await signIn(page, seedSubs.hassan)
  const folder = await createFolder(page, caseTitle('AC-333 history'))
  const title = caseTitle('Book the van')
  await createTask(page, { title, folder_id: folder.id })
  const email = `ac-333-${Date.now()}@example.com`
  const token = await csrfToken(page.context())
  const invited = await page.request.post('/api/v1/invites', {
    data: { email, folder_id: folder.id },
    headers: { 'X-CSRF-Token': token },
  })
  expect(invited.status(), `POST /invites answered ${invited.status()}: ${await invited.text()}`).toBe(201)

  await page.goto(routesV2.folder(folder.id))
  await clickControl(
    page.getByRole('main').getByRole('button', { name: 'More actions', exact: true }).first(),
    'spec 9.1: the window bar\'s overflow',
  )
  await clickControl(page.getByRole('menuitem', { name: 'History', exact: true }), 'spec 9.6: History')
  const sheet = page.getByRole('dialog', { name: 'History' })
  await expect(sheet).toBeVisible()
  await expect(
    sheet.getByText(`Hassan added “${title}”`),
    'folderpage F3: a task made in the folder is a line of its history, as a sentence',
  ).toBeVisible()
  await expect(
    sheet.getByText(`Hassan invited ${email}`),
    'folderpage F3: an invite is a line of the folder\'s history',
  ).toBeVisible()
  await expect(
    sheet.getByText('Hassan created the folder'),
    'pagehead F4: the folder\'s own events name it by kind, with the actor in the sentence',
  ).toBeVisible()
  await expect(sheet.getByText(/Edited edited/), 'the doubled verb is gone').toHaveCount(0)
  await page.keyboard.press('Escape')

  await expect(
    page.getByRole('button', { name: /^(Edited|Created|Renamed) / }),
    'pagehead F4: the activity line is a line; History is the one door to the record',
  ).toHaveCount(0)
})
