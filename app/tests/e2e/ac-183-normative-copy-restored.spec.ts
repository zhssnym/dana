/*
AC-183: given each of section 9's normative strings that the designer's
prototype omitted, split or reworded, then the built client renders each as
one text run, character for character as its section writes it: 9.1's
failed-read line and 404 line, 9.3's steps cap notice, 9.4's abandon confirm,
9.6's leave, remove-member and delete-folder confirms, and 9.8's
already-connected refusal and remove-connection confirm.

Appended to section 12 by RFC 0002, Accepted 2026-08-13. The sentence above
is that RFC's Append unit transcribed unchanged, and it becomes section 12's
own text when the delta merges.

**This is a regression criterion and the RFC says so.** Its nine strings are
exactly the places a port from this prototype is known to lose copy, they were
found by measurement rather than by review, and a criterion is the only thing
in this build that survives the session that learned them. Six of the nine are
already asserted by AC-162 and AC-171 and by the rendered-halves file, each
inside a criterion about something else; what those cannot do is fail as one
thing when a port drops copy, and what none of them does is read whether the
sentence arrived whole.

**"As one text run" is what this file adds and it is not what getByText
measures.** Playwright's text engine matches the smallest element whose
combined text contains the string, and combined text crosses element
boundaries: a sentence delivered as a dialog title plus a dialog description
sits inside one wrapper whose text is the whole sentence, so that engine finds
it and reports a string no reader ever meets as one sentence. Measured on
2026-08-13 against the prototype: 9.4's abandon confirm and 9.8's
remove-connection confirm are exactly that shape, an AlertDialogTitle and an
AlertDialogDescription inside one AlertDialogHeader. So every assertion below
goes through `expectOneTextRun`, which reads text nodes.

Interpolation is why a text node is the right grain rather than too fine a
one. 9.6's three confirmations are one sentence with a folder or a member in
the middle, and a client that builds the sentence and renders it produces one
text node whatever the value was; a client that renders the value as its own
element has split the sentence, which is the same defect at a smaller scale.

**Two of the nine differ from every other string here in how they arrive.**
9.1's failed-read line is a page state and needs a read to fail, and 9.8's
already-connected refusal is 7.5's own 409 message rendered verbatim, which
9.1's conflict rule requires. Both are produced here rather than asserted
against a page that happens to be showing them.

**The strings are restated in the harness and never imported from
src/client.** That is this leg's standing rule and it has more force here than
anywhere: a criterion that reads the string it asserts out of the code under
test asserts that the code equals itself, which is precisely the check a copy
regression has to survive.

Spec: 9.1 (the inline state copy, the conflict rule, "Continue" and
"Cancel"), 9.3 (the steps cap notice), 9.4 (the abandon confirm), 9.6 (the
leave, remove-member and delete-folder confirms), 9.8 (the already-connected
refusal and the remove-connection confirm), 10.2, 10.3, 7.5.
*/
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  clickControl,
  copy,
  createTask,
  csrfToken,
  expectOneTextRun,
  fillControl,
  regionOf,
  routes,
  seedDate,
  seedIds,
  seedSubs,
  signIn,
  taskRow,
  TEST_TIMEOUT_MS,
  transition,
} from './harness.js'

test.use({ timezoneId: 'UTC', actionTimeout: ACTION_TIMEOUT_MS })
// Raised from Playwright's 30 second default so a red names its assertion
// rather than the clock, for the reason recorded at TEST_TIMEOUT_MS.
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

/** 10.3's cap, which 9.3's notice reports. */
const STEP_CAP = 50
const DOOMED = 'ac-183 folder with counted tasks'
/** Three different numbers, none of them one, per AC-162's reasoning. */
const OPEN = 3
const COMPLETED = 2
const ABANDONED = 4

async function ensureFolder(page: Page, name: string): Promise<string> {
  const token = await csrfToken(page.context())
  const list = await page.request.get('/api/v1/folders')
  const existing = ((await list.json()) as { id: string; name: string }[]).find(
    (folder) => folder.name === name,
  )
  if (existing !== undefined) return existing.id
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

test.describe('AC-183: section 9\'s copy arrives whole', () => {
  test("AC-183: 9.1's failed-read line and 404 line", async ({ page }) => {
    await page.route('**/api/v1/views/tasks**', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'internal', message: 'Something broke.' } }),
      })
    })
    await page.goto(routes.tasks)
    await expectOneTextRun(
      page,
      copy.readFailed,
      "spec 9.1: the inline failed-read line is the page's own words and never the global " +
        "toast's, restated at the RFC 0002 change control because the prototype renders the " +
        'toast string inline. The two answer different questions: the toast reports that a ' +
        'write did not land, and this line reports that a read did not arrive, so a page ' +
        'showing "Nothing was saved" where nothing was being saved tells a person something ' +
        'false about their own data',
    )
    await page.unroute('**/api/v1/views/tasks**')

    // The other seeded user's Inbox exists and this viewer is not a member,
    // so 10.2 answers 404 without anything being broken.
    await page.goto(routes.folder(seedIds.imranInbox))
    await expectOneTextRun(
      page,
      copy.notFound,
      "spec 9.1: the 404 line, absent from the prototype altogether. It states both of 10.2's " +
        'cases in one sentence without telling a reader which of them they met, which is what ' +
        'that chokepoint exists for, so a sentence delivered in halves is a sentence that ' +
        'could tell them',
    )
  })

  test("AC-183: 9.3's steps cap notice", async ({ page }) => {
    const title = 'ac-183 task at the step cap'
    const task = await createTask(page, { title, folder_id: seedIds.groceries })
    // Through 7.7 rather than through fifty keystrokes: the cap is what this
    // case is about, not the editor's typing.
    const token = await csrfToken(page.context())
    for (let i = 0; i < STEP_CAP; i += 1) {
      const response = await page.request.post(`/api/v1/tasks/${task.id}/steps`, {
        data: { title: `ac-183 step ${i}` },
        headers: { 'X-CSRF-Token': token },
      })
      expect(
        response.status(),
        `POST /tasks/:id/steps answered ${response.status()}: ${await response.text()}`,
      ).toBe(201)
    }

    await page.goto(routes.tasks)
    await clickControl(
      page.getByText(title),
      'spec 9.5: a click on any row opens the task, which is how its steps editor is reached',
    )
    await clickControl(
      page.getByRole('button', { name: 'More options' }),
      "spec 9.3: seven of the form's ten fields sit behind one expander, and the section " +
        'names it "More options"',
    )
    await expectOneTextRun(
      page,
      copy.stepCapNotice,
      'spec 9.3: the steps editor\'s cap notice reads "Limit 50 steps", and it is absent from ' +
        'the prototype. Asserted as the string rather than as a number somewhere on the page, ' +
        'which a step titled "50" would also have satisfied',
    )
  })

  test("AC-183: 9.4's abandon confirm", async ({ page }) => {
    const title = 'ac-183 abandon me from my day'
    await createTask(page, {
      title,
      folder_id: seedIds.groceries,
      due_date: seedDate(0),
      assignee_id: seedIds.hassan,
    })
    await page.goto(routes.myDay)
    await clickControl(
      taskRow(page, title).getByRole('button', { name: 'More actions', exact: true }),
      'spec 9.4: a row carries an overflow menu',
    )
    await clickControl(
      page.getByRole('menuitem', { name: /abandon/i }),
      "spec 9.4: the row's overflow menu carries edit, abandon and delete",
    )

    await expectOneTextRun(
      page,
      copy.abandonConfirm,
      'spec 9.4: the abandon confirm is one sentence and the prototype delivers it as a dialog ' +
        'title plus a description. It is the only thing that tells the person the task stays ' +
        'everywhere else, and a reader who meets it in two pieces has been told it by ' +
        'themselves rather than by this section',
    )
    await clickControl(
      page.getByRole('button', { name: 'Cancel', exact: true }),
      'spec 9.1: every confirmation offers Continue and Cancel',
    )
  })

  test("AC-183: 9.6's leave confirm", async ({ browser }) => {
    // The non-owner of the seeded shared folder, because 5.4 gives leave to a
    // member and gives the owner a transfer instead. A context of its own so
    // this case does not disturb the viewer the rest of this file signs in as.
    const context = await browser.newContext()
    const page = await context.newPage()
    await signIn(page, seedSubs.imran)
    await page.goto(routes.folder(seedIds.groceries))
    await clickControl(
      regionOf(page, 'Folder header').getByRole('button', {
        name: 'More actions',
        exact: true,
      }),
      'spec 9.6 and 9.1: the folder header is a named region, and its overflow menu carries ' +
        'Leave for a member who is not the owner',
    )
    await clickControl(
      page.getByRole('menuitem', { name: /leave/i }),
      'spec 9.6: the header overflow carries Leave, non-owner only per the 5.4 matrix',
    )

    await expectOneTextRun(
      page,
      copy.leaveFolder('Groceries'),
      "spec 9.6: the leave confirm states 5.3's R-CLEAN, which is the half of leaving a person " +
        'cannot see. The prototype rewords it, and 9.6\'s own restatement of 2026-08-13 says ' +
        'design may restyle and not reword, a sentence delivered in two pieces being reworded ' +
        'by the reader rather than by the writer',
    )
    await clickControl(
      page.getByRole('button', { name: 'Cancel', exact: true }),
      'spec 9.1: every confirmation offers Continue and Cancel, and this case leaves the ' +
        'seeded membership alone',
    )
    await context.close()
  })

  test("AC-183: 9.6's remove-member confirm", async ({ page }) => {
    await page.goto(routes.folder(seedIds.groceries))
    await clickControl(
      page.getByRole('button', { name: 'Share' }),
      'spec 9.6: the folder header carries a Share button, which opens the sharing panel',
    )
    const panel = regionOf(page, 'Sharing panel')
    const member = panel
      .getByRole('listitem')
      .or(panel.getByRole('row'))
      .filter({ hasText: 'Imran' })
    await clickControl(
      member.getByRole('button', { name: /remove/i }),
      'spec 9.6 and 9.1: the sharing panel is a named region carrying the member list with its ' +
        'remove controls, and the row names the member the control acts on',
    )

    await expectOneTextRun(
      page,
      copy.removeMember('Imran', 'Groceries'),
      'spec 9.6: the remove confirm states R-CLEAN for the person being removed and names them ' +
        'and the folder from the row. The prototype rewords it. A name in the middle of the ' +
        'sentence is what makes the text-node grain the right one: a client building the ' +
        'sentence renders one node whatever the name was',
    )
    await clickControl(
      page.getByRole('button', { name: 'Cancel', exact: true }),
      'spec 9.1: every confirmation offers Continue and Cancel, and this case removes nobody',
    )
  })

  test("AC-183: 9.6's delete-folder confirm", async ({ page }) => {
    const folderId = await ensureFolder(page, DOOMED)
    const existing = await page.request.get(`/api/v1/folders/${folderId}`)
    const counts = ((await existing.json()) as { counts: { pending: number } }).counts
    if (counts.pending === 0) {
      for (let i = 0; i < OPEN; i += 1) {
        await createTask(page, { title: `ac-183 open ${i}`, folder_id: folderId })
      }
      for (let i = 0; i < COMPLETED; i += 1) {
        const task = await createTask(page, {
          title: `ac-183 completed ${i}`,
          folder_id: folderId,
        })
        await transition(page, task.id, 'complete', 'UTC')
      }
      for (let i = 0; i < ABANDONED; i += 1) {
        const task = await createTask(page, {
          title: `ac-183 abandoned ${i}`,
          folder_id: folderId,
        })
        await transition(page, task.id, 'abandon', 'UTC')
      }
    }

    await page.goto(routes.folder(folderId))
    await clickControl(
      regionOf(page, 'Folder header').getByRole('button', {
        name: 'More actions',
        exact: true,
      }),
      'spec 9.6 and 9.1: the folder header is a named region carrying an overflow menu',
    )
    await clickControl(
      page.getByRole('menuitem', { name: /delete/i }),
      'spec 9.6: the header overflow carries Delete, owner only',
    )

    await expectOneTextRun(
      page,
      copy.deleteFolder(DOOMED, OPEN, COMPLETED, ABANDONED),
      'spec 9.6: the delete confirm carries the folder name and three counts, and the ' +
        "prototype renders its first clause as the dialog's title. It is the only place a " +
        'person is told the deletion reaches every member rather than only their own view. The ' +
        'three counts differ here and none is one, so a client rendering the same number three ' +
        'times cannot pass by looking numeric',
    )
    await clickControl(
      page.getByRole('button', { name: 'Cancel', exact: true }),
      'spec 9.1: every confirmation offers Continue and Cancel, and this case deletes nothing',
    )
  })

  test("AC-183: 9.8's already-connected refusal", async ({ page }) => {
    await page.goto(routes.people)
    const email = page.getByLabel(/invite by email/i)
    await fillControl(
      email,
      'imran@example.com',
      'spec 9.8: the People screen carries a bare invite by email beside the roster list, and ' +
        'the seeded viewer is already connected to this address',
    )
    await email.press('Enter')

    await expectOneTextRun(
      page,
      copy.alreadyConnected,
      'spec 9.8: the refusal for an address already on the roster, absent from the prototype. ' +
        "It is 7.5's 409 as the person reads it, which 9.1's conflict rule requires be shown " +
        'verbatim, so a client paraphrasing it has broken two sentences with one change',
    )
  })

  test("AC-183: 9.8's remove-connection confirm", async ({ page }) => {
    await page.goto(routes.people)
    const entry = page
      .getByRole('listitem')
      .or(page.getByRole('row'))
      .filter({ hasText: 'imran@example.com' })
    await clickControl(
      entry.getByRole('button', { name: /remove/i }),
      'spec 9.8: the roster list carries a remove control, and the row names the person it ' +
        'acts on',
    )

    await expectOneTextRun(
      page,
      copy.removeConnection,
      'spec 9.8: the roster removal confirm, which the prototype splits across a dialog title ' +
        'and its description. Its second clause is the whole of what a person needs to decide, ' +
        'that removing a connection does not remove them from the folders already shared, and ' +
        'a title read alone says the opposite',
    )
    await clickControl(
      page.getByRole('button', { name: 'Cancel', exact: true }),
      'spec 9.1: every confirmation offers Continue and Cancel, and this case removes nothing. ' +
        'The seeded connection is read by other specs',
    )
  })
})
