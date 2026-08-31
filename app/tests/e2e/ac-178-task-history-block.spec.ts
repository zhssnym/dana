/*
AC-178: given a saved task opened for edit, then the surface renders who
created it and when, and who completed it and when where it is complete,
read-only and offering no action; given either of those users deleted, then
that name renders as "Deleted user".

Appended to section 12 by RFC 0002, Accepted 2026-08-13. The sentence above
is that RFC's Append unit transcribed unchanged, and it becomes section 12's
own text when the delta merges.

The block arrives from the designer's prototype, which already renders both
lines and already renders "Deleted user" for a null author; 9.3 adopts it and
section 13 item 27 closes on it. That item recorded since 2026-08-11 that
4.1's "null after deletion, rendered 'Deleted user'" and 8.10's surviving
references had no surface in Dana at all, correctly rather than as an
omission. This is the first surface that reads either column, so it is the
first thing that can be wrong about them.

**"Deleted user" is asserted through a real deletion, not through a fixture
with a null in it.** 8.10 is a transaction with five steps and this criterion
turns on which of them touch `tasks.created_by`: step 4 clears the account's
assignments and removes its memberships, and the surviving references keep
pointing at the scrubbed row. A test that wrote a null into the column would
assert the rendering and not the sentence, and would still pass on the day
8.10 started nulling the reference instead of scrubbing the user.

**The deleted account is one this file provisions and shares into.** Nothing
seeded may be deleted: the harness's rule is that a spec never transitions,
edits or deletes a seeded row, and 8.10 on either seeded user would take the
shared folder every other spec in this leg reads. So the folder is this
file's, the account is this file's, and the task it creates is what survives
it.

**Read-only is asserted as the absence of an action rather than as the
absence of an input.** 9.3 says the block offers no action, and what would go
wrong is a client rendering the two names as links to a person, or the
completion line as the completion control, which is a different control this
package also adds and which AC-179 asserts. So what is read is that no
control at all lives inside the block.

**"And when" is asserted against the stored instant.** The format is the
design's and 9.3 spells none, so what is asserted is that the rendering
carries the day and the year of the created_at the API reports, in the
viewer's own zone. A block naming the person and no time satisfies half the
sentence and is exactly as useless as a block naming the time and no person.

**Reworked onto the v2 surfaces on 2026-08-24 (RFC 0005).** Nothing this
criterion asserts moves; where the task is opened from does. The rows this
file creates are undated, so their home is Q2's page, which is Anytime at
/app/anytime now that /app/tasks redirects; Done keeps its own path.

**Reworked onto 9.3's v2 card at S15 (items 15 and 19), and this file was on
neither of the two greps item 15's enumeration was built from.** It never
writes "More options" and it uses none of the four harness helpers, so both
sweeps missed it; what it does is open the form by clicking a row, scope to
the dialog, and dismiss it by a control named Cancel or Close. All three of
those are the v1 form's apparatus, and the whole subject of the criterion is
a block 9.3 puts on the card, so it belongs to this package as squarely as
any of the seven. The correction is recorded in RFC 0005 change control item
25 with the other two the enumeration missed.

**What moved and what did not.** The block stays: 9.3's v2 carries it in
terms, "the completion control and the history read stay: the footer renders
the task's own events from 4.13, created, completed, and the rest, actor and
viewer-local time, 'Deleted user' fallback unchanged". So every assertion
below is the one it made before, against the same two lines and the same
fallback. What moved is the scope, from "the dialog" to the task surface
addressed by what 9.3 says is in it, and the dismissal, which is escape now
that the card's footer offers no close of its own. The criterion's own
sentence lost the word "form" for 9.1's name for the thing, which section 12
records.

Spec: 9.3 (the read-only history read the v2 footer renders), 9.1 (the v2
routes table and the task surface's role), frozen 7.2's
TaskDetail (created_by, created_at, completed_by, completed_at), 4.1 (the
display_name note), 8.10 (the deletion and its surviving references), 5.1
(the completion that fills the second line), section 13 item 27.
*/
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  createTask,
  csrfToken,
  routesV2,
  seedIds,
  seedSubs,
  signIn,
  taskSurface,
  TEST_TIMEOUT_MS,
  transition,
 openTaskRow } from './harness.js'

test.use({ timezoneId: 'UTC', locale: 'en-US', actionTimeout: ACTION_TIMEOUT_MS })
// Raised from Playwright's 30 second default so a red names its assertion
// rather than the clock, for the reason recorded at TEST_TIMEOUT_MS.
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

const SHARED_FOLDER = 'ac-178 folder the deleted user wrote in'
const DOOMED_SUB = 'ac-178-doomed'
const DOOMED_EMAIL = 'ac-178-doomed@example.com'
const DOOMED_NAME = 'Doomed'
const BY_DOOMED = 'ac-178 written by an account since deleted'
const MINE = 'ac-178 written and completed by the viewer'

/** What frozen 7.2 reports for a task, which the block is asserted against. */
interface Detail {
  created_at: string
  completed_at: string | null
}

async function detailOf(page: Page, id: string): Promise<Detail> {
  const response = await page.request.get(`/api/v1/tasks/${id}`)
  expect(
    response.status(),
    `GET /tasks/${id} answered ${response.status()}: ${await response.text()}`,
  ).toBe(200)
  return (await response.json()) as Detail
}

/**
 * The day and the year of an instant as the viewer's pinned locale and zone
 * render them, which is what "and when" can be held to while 9.3 spells no
 * format.
 */
function dayAndYear(instant: string): { day: string; year: string } {
  const at = new Date(instant)
  return {
    day: String(at.getUTCDate()),
    year: String(at.getUTCFullYear()),
  }
}

/**
 * Opens a task's form from the page it is on, which is how edit mode is
 * reached.
 *
 * 9.5 gives the rule, "click on any row opens the task", and this criterion
 * needs it on Done as well as on Tasks: a completed task's row is on Done,
 * and a client where that row does not open cannot render the completion half
 * of 9.3's history block anywhere at all. Section 9 does not restate the rule
 * in its Done bullet, which is a silence this file reads the general way and
 * has raised with the Integration Steward rather than resolved.
 */
async function openTheCard(page: Page, title: string): Promise<void> {
  await openTaskRow(page, title,
    'spec 9.4: a click on any row opens that task, and 9.3 makes create and edit one artifact',
  )
  await expect(
    taskSurface(page),
    "spec 9.1's v2 roles table: the task surface is a dialog when opened as one, 9.3 making " +
      'it one artifact over a page. A completed task is opened from Done, that being where ' +
      'its row is, and 9.4 opens a row "whatever the task\'s status", so a client whose Done ' +
      'rows do not open has no surface for the completion this block renders',
  ).toBeVisible()
}

/**
 * Closes the open surface.
 *
 * Escape rather than a control: 9.3's v2 card carries a completion control, a
 * star and "More actions" in its footer and no dismiss of its own, so there
 * is no named control to press and a criterion may not invent one. Escape
 * closing a modal surface is the platform behaviour every dialog in this
 * client already has.
 */
async function closeTheCard(page: Page): Promise<void> {
  await page.keyboard.press('Escape')
  await expect(
    taskSurface(page),
    'the surface closes on escape, so what follows reads the page beneath it',
  ).toHaveCount(0)
}

test.describe('AC-178: the task form\'s read-only history block', () => {
  test('AC-178: it names who created the task and when', async ({ page }) => {
    await signIn(page, seedSubs.hassan)
    const task = await createTask(page, { title: MINE, folder_id: seedIds.groceries })
    const detail = await detailOf(page, task.id)
    const created = dayAndYear(detail.created_at)

    await page.goto(routesV2.anytime)
    await openTheCard(page, MINE)

    const form = taskSurface(page)
    await expect(
      form,
      "spec 9.3: the block renders the task's creation, who and when, from the created_by and " +
        'created_at of frozen 7.2\'s TaskDetail. The seeded viewer created this row, so it is ' +
        'their display name the block owes',
    ).toContainText('Hassan')
    await expect(
      form,
      'spec 9.3: and when. The format is the design\'s and this section spells none, so what is ' +
        `held to is that the day (${created.day}) and the year (${created.year}) of the stored ` +
        'created_at are rendered. A block naming the person and no time answers half the ' +
        'sentence',
    ).toContainText(new RegExp(`${created.day}\\b[\\s\\S]{0,24}${created.year}|${created.year}[\\s\\S]{0,24}\\b${created.day}\\b`))
  })

  test('AC-178: it names who completed the task and when, once it is complete', async ({
    page,
  }) => {
    await signIn(page, seedSubs.hassan)
    const title = `${MINE} two`
    const task = await createTask(page, { title, folder_id: seedIds.groceries })

    await page.goto(routesV2.anytime)
    await openTheCard(page, title)
    await expect(
      taskSurface(page),
      "spec 9.3: the block renders the completion only when the task has one, so an open task " +
        'shows no completion line. Without this the assertion below passes against a block that ' +
        'always claims a completion',
    ).not.toContainText(/completed/i)

    await closeTheCard(page)
    await transition(page, task.id, 'complete', 'UTC')
    const detail = await detailOf(page, task.id)
    expect(detail.completed_at, 'spec 5.1: completing stamps completed_at').not.toBeNull()
    const done = dayAndYear(detail.completed_at ?? '')

    await page.goto(routesV2.done)
    await openTheCard(page, title)
    const form = taskSurface(page)
    await expect(
      form,
      "spec 9.3 and 5.1: the block renders who completed it, from frozen 7.2's completed_by, " +
        'which AC-036 pins to the actor',
    ).toContainText('Hassan')
    await expect(
      form,
      `spec 9.3: and when, so the day (${done.day}) and the year (${done.year}) of the stored ` +
        'completed_at are rendered',
    ).toContainText(new RegExp(`${done.day}\\b[\\s\\S]{0,24}${done.year}|${done.year}[\\s\\S]{0,24}\\b${done.day}\\b`))
  })

  test('AC-178: a deleted author renders as "Deleted user"', async ({ browser }) => {
    // The folder, the account and the task are all this file's. Nothing
    // seeded may be deleted, and 8.10 on either seeded user would take the
    // shared folder every other spec in this leg reads.
    const ownerContext = await browser.newContext()
    const owner = await ownerContext.newPage()
    await signIn(owner, seedSubs.hassan)

    let token = await csrfToken(ownerContext)
    const list = await owner.request.get('/api/v1/folders')
    const found = ((await list.json()) as { id: string; name: string }[]).find(
      (folder) => folder.name === SHARED_FOLDER,
    )
    let folderId = found?.id
    if (folderId === undefined) {
      const created = await owner.request.post('/api/v1/folders', {
        data: { name: SHARED_FOLDER },
        headers: { 'X-CSRF-Token': token },
      })
      expect(
        created.status(),
        `POST /folders answered ${created.status()}: ${await created.text()}`,
      ).toBe(201)
      folderId = ((await created.json()) as { id: string }).id
    }
    const invited = await owner.request.post('/api/v1/invites', {
      data: { email: DOOMED_EMAIL, folder_id: folderId },
      headers: { 'X-CSRF-Token': token },
    })
    expect(
      [200, 201, 409].includes(invited.status()),
      `POST /invites answered ${invited.status()}: ${await invited.text()}`,
    ).toBe(true)

    // The invited account signs in, joins, writes the row that will outlive
    // it, and deletes itself through 8.10's own endpoint.
    const doomedContext = await browser.newContext()
    const doomed = await doomedContext.newPage()
    await signIn(doomed, DOOMED_SUB, DOOMED_NAME, DOOMED_EMAIL)
    const pending = await doomed.request.get('/api/v1/invites/pending')
    expect(
      pending.status(),
      `GET /invites/pending answered ${pending.status()}: ${await pending.text()}`,
    ).toBe(200)
    const mine = (
      (await pending.json()) as { id: string; folder_name: string | null }[]
    ).filter((invite) => invite.folder_name === SHARED_FOLDER)
    expect(
      mine.length,
      'spec 6 Q12 and 7.5: the invited address holds the invite this case just sent',
    ).toBeGreaterThan(0)
    const invite = mine[0]
    if (invite === undefined) throw new Error('unreachable: length asserted above')

    const doomedToken = await csrfToken(doomedContext)
    const accepted = await doomed.request.post(`/api/v1/invites/${invite.id}/accept`, {
      headers: { 'X-CSRF-Token': doomedToken },
    })
    expect(
      accepted.status(),
      `POST /invites/:id/accept answered ${accepted.status()}: ${await accepted.text()}`,
    ).toBe(200)

    await createTask(doomed, { title: BY_DOOMED, folder_id: folderId })

    const deleted = await doomed.request.delete('/api/v1/me', {
      data: { confirm: 'DELETE' },
      headers: { 'X-CSRF-Token': doomedToken },
    })
    expect(
      deleted.status(),
      `DELETE /me answered ${deleted.status()}: ${await deleted.text()}. 8.10 is what puts a ` +
        'surviving reference on a scrubbed row, and a fixture that wrote a null into the ' +
        'column instead would assert the rendering rather than the sentence',
    ).toBe(204)
    await doomedContext.close()

    // The surviving member opens the row the deleted account wrote.
    token = await csrfToken(ownerContext)
    await owner.goto(routesV2.folder(folderId))
    await openTheCard(owner, BY_DOOMED)
    const form = taskSurface(owner)
    await expect(
      form,
      'spec 4.1 and 8.10: an author whose account has been deleted renders "Deleted user". ' +
        '4.1 gives display_name the note "null after deletion, rendered \'Deleted user\'" and ' +
        '8.10 says tasks.created_by keeps pointing at the scrubbed row; section 13 item 27 ' +
        'recorded that no surface in Dana read either column until this block',
    ).toContainText('Deleted user')
    await expect(
      form,
      "spec 8.10: and the deleted account's own name is gone from it, the scrub being what the " +
        'rendering stands in for',
    ).not.toContainText(DOOMED_NAME)
    await ownerContext.close()
  })

  test('AC-178: the block is read-only and offers no action', async ({ page }) => {
    await signIn(page, seedSubs.hassan)
    const title = `${MINE} three`
    await createTask(page, { title, folder_id: seedIds.groceries })

    await page.goto(routesV2.anytime)
    await openTheCard(page, title)

    // The block is found by the name it renders and read for controls. 9.3
    // says it offers no action, and what would go wrong is a client rendering
    // either name as a link to a person, or the completion line as the
    // completion control AC-179 asserts, which is a different control.
    const block = taskSurface(page)
      .getByRole('listitem')
      .or(taskSurface(page).getByRole('paragraph'))
      .filter({ hasText: 'Hassan' })
    await expect(
      block,
      'spec 9.3: the history block renders the creation, so there is a block naming the creator',
    ).not.toHaveCount(0)
    await expect(
      block.getByRole('button').or(block.getByRole('link')).or(block.getByRole('checkbox')),
      'spec 9.3: the block "is read-only and offers no action". A client that made either name ' +
        'a link to a person, or the completion line the completion control, would render every ' +
        'string this criterion asks for and do something this section forbids',
    ).toHaveCount(0)
  })
})
