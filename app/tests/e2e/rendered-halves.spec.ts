/*
The clauses earlier packages recorded as P8's half, closed here.

Not new criteria and not a renumbering. Each criterion below stays in the
package that owns it, with its server half green where it already is; what
this file adds is the sentence each one states about what the viewer sees,
which the file that owns the number wrote down as arriving with this package
rather than skipping in silence. The work list is the grep those records
were left for, `grep -rn "P8" app/tests/`, and the RFC 0001 P8 row names
four of them to start it off.

What the grep found, and where each is closed:

- **AC-039**, "appears faded in its home". Its file says the rendering
  arrives here. Closed in `ac-097-abandoned-row-and-restore.spec.ts`, whose
  first case is a dated abandoned row faded and struck on Planned, which is
  its home.
- **AC-047**, the assignee chip on a pulled row. Below.
- **AC-048**, the unassigned chip in Planned. Below.
- **AC-053**, fading in Tasks and All. Closed in the same AC-097 file's
  third case, on the seeded undated abandoned row, which is the fixture that
  criterion is written on.
- **AC-058**, the collapsed Completed section. Below.
- **AC-138**, history rendering as "Deleted user". No longer this package's
  to close, and the paragraph below says why, because the reason is not the
  one a reader will assume.
- **AC-141**, the People screen's refusal copy. Below.

**AC-138's clause left this list on 2026-08-11, and the specification it
comes from was not corrected.** This file escalated it: section 9 names no
surface that displays `created_by`, `completed_by` or `accepted_by`, so
8.10's sentence had nowhere to be asserted, and the recommendation from here
was to lift the sentence. The P8 change control ruled the other way and the
distinction is the whole point. 4.1 carries the same clause at the
`display_name` column and 8.10 carries it in prose, and both are correct:
what section 9 lacks is not an omission but a consequence of 8.10's own
ordering, which empties every path a page renders a display name through.
Step 4 clears the deleted account's assignments and drops its memberships,
so no assignee chip and no member avatar stack can hold it, and 7.3 excludes
soft-deleted users from the roster, so the People screen cannot either. The
three columns that survive are read by no page in v1. The clause is
therefore correct and dormant: it states what must happen the first time a
surface shows an author, a completer or an acceptor, and this version ships
none.

So the obligation lifts from this package as section 13 item 27, recorded as
a reading of frozen 4.1 rather than as a change to it, and AC-138 pins its
server half unchanged. Written out here rather than deleted quietly because
the next reader of this file will otherwise assume the specification was
found wrong and fixed, and it was found right and left alone. Item 27 names
the revisit trigger: any surface that displays a task's author or completer,
or an invite's acceptor, at which point the rendering is a criterion that
package owes.

Each case pairs its assertion with the neighbouring row that must not carry
the same adornment, because every one of these is a chip or a state that an
implementation can draw on everything as easily as on the right thing, and a
chip drawn on every row satisfies a test that only looks for one.

**Reworked onto the v2 surfaces on 2026-08-24 (RFC 0005).** None of the four
clauses moves; two of the pages they are read on do. Q1's rows are drawn by
Today at /app/today now that Desk holds /app, and Q3's by Scheduled at
/app/scheduled now that /app/planned redirects. Section 6 keeps the v1 name
in each heading's parentheses for exactly this reason, so the bullet list
above still reads true where it says Planned and My Day.

Spec: 9.4, 9.5, 9.6, 9.8, 9.1 (the v2 routes table), 6 Q1, Q3, Q7, 7.5, 8.7.
*/
import { expect, test } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  copy,
  createTask,
  csrfToken,
  patchTask,
  routesV2,
  seedDate,
  seedIds,
  seedSubs,
  signIn,
  taskRow,
  TEST_TIMEOUT_MS,
} from './harness.js'

test.use({ timezoneId: 'UTC', actionTimeout: ACTION_TIMEOUT_MS })
// Raised from Playwright's 30 second default so a red names its assertion
// rather than the clock, for the reason recorded at TEST_TIMEOUT_MS.
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

test.beforeEach(async ({ page }) => {
  await signIn(page, seedSubs.hassan)
})

test.describe("P8's half of the criteria earlier packages split", () => {
  test('AC-047 (P8 half): a pulled row assigned to someone else carries their chip', async ({
    page,
  }) => {
    // AC-047's own file: "The chip is section 9's rendering and arrives with
    // P8; the assignee object 7.0 gives TaskCard is what the chip is drawn
    // from, and it is this package's half." So this is the other half.
    // The title carries no member's name. getByText matches a substring
    // case-insensitively, so a title holding "imran" resolves to the title
    // and the assignee chip together, and the case fails on strict mode
    // against a page drawing the chip exactly as 9.4 requires.
    const title = 'ac-047 pulled from another member of the folder'
    const created = await createTask(page, {
      title,
      folder_id: seedIds.groceries,
      assignee_id: seedIds.imran,
    })
    const token = await csrfToken(page.context())
    const pulled = await page.request.post(
      `/api/v1/tasks/${created.id}/my-day?tz=UTC`,
      { headers: { 'X-CSRF-Token': token } },
    )
    expect(
      pulled.status(),
      `POST /tasks/:id/my-day answered ${pulled.status()}: ${await pulled.text()}`,
    ).toBe(200)

    await page.goto(routesV2.today)
    await expect(
      taskRow(page, title).getByText('Imran'),
      'spec 9.4 row elements: an assignee chip when the assignee is not the viewer. 8.2 lets ' +
        "the viewer pull anyone's task into their own My Day, and the chip is what says whose " +
        'task it is',
    ).toBeVisible()

    // The other half of the same sentence: no chip when the assignee is the
    // viewer. The seeded pulled row is assigned to the viewer, so a client
    // drawing a chip on every row fails here while passing above.
    await expect(
      taskRow(page, 'Buy milk').getByText('Hassan'),
      'spec 9.4: the assignee chip appears when the assignee is not the viewer, so the ' +
        "viewer's own task carries none",
    ).toHaveCount(0)
  })

  test('AC-048 (P8 half): an unassigned row in a shared folder carries the unassigned chip', async ({
    page,
  }) => {
    // AC-048's own file: "The chip is section 9's and arrives with P8." Its
    // server half is the null assignee this row is given here through 7.6.
    const title = 'ac-048 unassigned and due'
    const created = await createTask(page, {
      title,
      folder_id: seedIds.groceries,
      due_date: seedDate(2),
      assignee_id: seedIds.hassan,
    })
    // Unassigned by PATCH rather than at create: 7.6 forces the assignee in
    // a single-member folder and this folder has two, so the null is the
    // case Q3's chip is about.
    await patchTask(page, created.id, { assignee_id: null })

    await page.goto(routesV2.scheduled)
    await expect(
      taskRow(page, title).getByText(/^unassigned$/i),
      'spec 6 Q3 row adornments: an "unassigned" chip when assignee_id is null and the folder ' +
        'has more than one member. The chip is section 9\'s rendering, which AC-048\'s file ' +
        'recorded as arriving with this package',
    ).toBeVisible()

    await expect(
      taskRow(page, 'Call plumber').getByText(/^unassigned$/i),
      'spec 6 Q3: the chip is conditional on a null assignee, so the seeded assigned row in ' +
        'the same folder on the same page does not carry it',
    ).toHaveCount(0)
  })

  test('AC-058 (P8 half): the folder page opens with Completed collapsed', async ({
    page,
  }) => {
    // AC-058's own file: '"Collapsed" is section 9's rendering and arrives
    // with P8'; what P4 owes is that the completed section is a separate,
    // paginated request, which is what makes collapsing possible.
    await page.goto(routesV2.folder(seedIds.groceries))

    await expect(
      page.getByText('Buy milk'),
      'spec 6 Q7: the Scheduled section is open, so its rows are on the page',
    ).toBeVisible()
    await expect(
      page.getByText('Old idea'),
      'spec 6 Q7: the Unscheduled section is open too',
    ).toBeVisible()

    const completed = page.getByRole('button', { name: /completed/i })
    await expect(
      completed,
      'spec 9.6: the folder body carries a Completed section, and a section that collapses is ' +
        'a control rather than a heading',
    ).toBeVisible()
    await expect(
      completed,
      'spec 9.6 and 6 Q7: the Completed section is rendered collapsed, which a screen reader ' +
        'learns from the control\'s expanded state',
    ).toHaveAttribute('aria-expanded', 'false')
    await expect(
      page.getByText('Pay rent'),
      'spec 6 Q7: the completed row is behind the collapsed section, so it is not on the page ' +
        'until the section is opened',
    ).toHaveCount(0)

    await completed.click()
    await expect(
      page.getByText('Pay rent'),
      'spec 6 Q7: opening the section reveals its rows, which is what makes it collapsed ' +
        'rather than absent. A section that never opens hides the history it is a record of',
    ).toBeVisible()
  })

  test('AC-141 (P8 half): the People screen refuses an address already on the roster', async ({
    page,
  }) => {
    // AC-141's own file: 9.8 carries the People screen copy, "P8's to
    // render". The owner ruled the 409 on 2026-08-09 and 7.5, 8.7 and 9.8
    // carry it; what is left is that a person sees why.
    await page.goto(routesV2.people)

    const email = page.getByLabel(/invite by email/i)
    await expect(
      email,
      'spec 9.8: the People screen carries a bare invite by email beside the roster list',
    ).toBeVisible()

    // The control paired with the refusal: a fresh address is accepted on the
    // same field, so the refusal below is the address and not the form.
    await email.fill('rendered-halves-fresh@example.com')
    await email.press('Enter')
    await expect(
      page.getByText(copy.alreadyConnected),
      'spec 9.8: the refusal belongs to an address already on the roster, and this one is not ' +
        'on it. Asserted first so the refusal below discriminates',
    ).toHaveCount(0)

    await email.fill('imran@example.com')
    await email.press('Enter')
    await expect(
      page.getByText(copy.alreadyConnected),
      'spec 9.8: an address already connected is refused with this copy, which is the 409 of ' +
        '7.5 as the person reads it. Copy in section 9 is normative',
    ).toBeVisible()
  })
})
