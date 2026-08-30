/*
AC-173: given folders in the sidebar whose 4.3 identity colours differ and one
with no colour set, then each row is painted with its own folder's colour and
not with another's, a row for an uncoloured folder still renders its name and
its pending count, and two folders carrying different colours do not render
the same paint.

**Reworked at S17a, and it is the one v1 criterion that package moved.** The
sentence above read "different personal colours" until 2026-08-26 and the
fixture wrote 7.4's my-membership, which was the v1 sidebar's source. 9.6
retires that column from every v2 surface in terms, "4.4's per-member color
column is no longer written by any v2 surface (existing values are simply
unused, the column is frozen and stays)", so a criterion pinning the personal
column pins a surface the contract moved out from under. Every clause keeps
its shape and its reasoning below still holds word for word; what changed is
the column the fixture writes, which is now the shared identity the folder
page's mark commits and every member reads. RFC 0005 change control item 8's
sequencing, applied a third time.

Numbered by the Integration Steward at the P8 merge review on 2026-08-12, so
the sentence above is section 12's own text now; it is transcribed unchanged,
the AC-124 and AC-141 shape, a criterion settled at the ruling with only its
test left to this role.

9.1's folder list sentence names three things every folder row shows, a
colour dot, a name and a pending count, and the built client renders two of
them. AC-155 is the criterion this package wrote for that sentence and it
asserts the pinning, the grouping and the two orderings, stopping short of
the dot; no folder colour appeared anywhere under `app/src/client` when this
was written. So one element of
a section 9 sentence was implemented by nothing and asserted by nothing at
once, which is the class the P4 change control swept for.

**Both coloured cases are red today, and the second is red on purpose rather
than by accident.** Its two assertions are absences, that neither row carries
the other's colour, and while the client paints no dot at all they hold for
the wrong reason: nothing carries any colour. So that case establishes the
presence first, which is the rule this suite already runs on for every case
asserting an absence. Without it the criterion would report one red and one
vacuous green, and the vacuous half would go on passing against the very
implementation it exists to catch.

**The middle clause is what makes this discriminate, so it is the case this
file is built around.** A spec that only asks whether a dot exists passes
against a client painting every folder the same colour, which is the defect
the criterion is for and the easiest one to write by accident: one swatch
from `tokens.css` applied to every row looks finished. So the two coloured
folders are given colours of their own and each row is asserted to carry its
own and not the other's. Either half alone is satisfiable by a mistake; the
pair is not.

**The colour comes from the wire, not from the palette.** `tokens.css`
carries ten folder swatches transcribed from the designer's foundation, and
those are the presets a picker would offer rather than the source of any
given folder's dot: 4.3's colour rides the 7.4 Folder object and is the
folder's own, so every member sees the same paint on it. The fixtures here are
therefore set through PATCH /folders/:id and the expected colour is the hex
this file sent, converted to what a browser reports. Two colours are chosen
that no seed row and no other spec uses, so a row carrying one of them
carries it because this folder was painted with it.

**The dot is asserted as paint rather than as an element.** It is not a
control and not a region, so neither 9.1's addressing sentence nor its
sections rule reaches it, and it is decorative enough that an accessible
implementation may give it no role at all. What can be held to without
specifying the implementer's markup is that this folder's colour was painted
somewhere inside this folder's row, which is what `paintedColors` reads. The
amendment says the same thing from the other side: the criterion asserts the
dot as identification rather than as a colour value.

**The uncoloured folder is given a task on purpose.** 9.1 puts a pending
count on every folder row, and a folder holding nothing would make the count
clause turn on whether a zero renders, which no section states. One pending
task makes the count a number that must appear, so the clause is asserted
rather than argued.

Written before the implementation, this project's standing order. The red
belongs on the dot: the rows, the names and the counts are all rendered
today, so a red on any of those would be a different sentence failing and is
worth reporting rather than repairing.

Spec: 9.1 (the folder list sentence and the sidebar), frozen 7.4 (the Folder
object's 4.3 identity colour and the PATCH that sets it), 9.6 (the retirement
of 4.4's per-member column from every v2 surface), 8.11 (the sidebar badge is the pending number alone), 4.6.
*/
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  caseTitle,
  createTask,
  csrfToken,
  hexToRgb,
  paintedColors,
  routes,
  seedSubs,
  signIn,
  TEST_TIMEOUT_MS,
} from './harness.js'

test.use({ timezoneId: 'UTC', actionTimeout: ACTION_TIMEOUT_MS })
// Raised from Playwright's 30 second default so a red names its assertion
// rather than the clock, for the reason recorded at TEST_TIMEOUT_MS.
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

/**
 * Two colours no seed row and no other spec uses, so a row painted with one
 * of them was painted from this folder's own 4.3 colour. The seed's one
 * colour is #33AA55 and AC-155's is #4477CC.
 */
const FIRST = { base: 'ac-173 folder in magenta', color: '#FF00AA' }
const SECOND = { base: 'ac-173 folder in cyan', color: '#00CCFF' }
const UNCOLOURED = { base: 'ac-173 folder with no colour' }

interface Folder {
  id: string
  name: string
  counts: { pending: number }
}

async function makeFolder(page: Page, name: string, color: string | null): Promise<Folder> {
  const token = await csrfToken(page.context())
  const created = await page.request.post('/api/v1/folders', {
    data: { name },
    headers: { 'X-CSRF-Token': token },
  })
  expect(
    [201, 422].includes(created.status()),
    `POST /folders answered ${created.status()}: ${await created.text()}`,
  ).toBe(true)

  let folder: Folder
  if (created.status() === 201) {
    folder = (await created.json()) as Folder
  } else {
    // Already created by an earlier run against this database.
    const all = (await (await page.request.get('/api/v1/folders')).json()) as Folder[]
    const existing = all.find((entry) => entry.name === name)
    if (existing === undefined) throw new Error(`no folder named ${name} after a 422`)
    folder = existing
  }

  if (color !== null) {
    /* 4.3's identity colour, reworked here at S17a. This wrote 7.4's
       my-membership until then, which was the v1 sidebar's source; 9.6
       retires that column from every v2 surface in terms, "4.4's per-member
       color column is no longer written by any v2 surface (existing values
       are simply unused)", so the colour a v2 row draws is the folder's own,
       the one its mark writes and every member reads. */
    const painted = await page.request.patch(`/api/v1/folders/${folder.id}`, {
      data: { color },
      headers: { 'X-CSRF-Token': token },
    })
    expect(
      painted.status(),
      `PATCH /folders/:id answered ${painted.status()}: ${await painted.text()}`,
    ).toBe(200)
  }
  return folder
}

/**
 * Names are per case, the rule this harness states for rows and which holds
 * for folders for the same reason: the runner seeds once and never resets, so
 * two cases creating "the same" folder leave two, and 7.4 refuses no
 * duplicate name. Measured rather than reasoned, on this file's first run,
 * where the second case's row locator resolved to two listitems.
 */

/** The sidebar row for a folder, which is the listitem carrying its link. */
function folderRow(page: Page, name: string) {
  return page
    .getByRole('navigation')
    .first()
    .getByRole('listitem')
    .filter({ hasText: name })
}

test.beforeEach(async ({ page }) => {
  await signIn(page, seedSubs.hassan)
})

test.describe('AC-173: the sidebar colour dot', () => {
  test('AC-173: each folder row carries its own colour', async ({ page }) => {
    const firstName = caseTitle(FIRST.base)
    const secondName = caseTitle(SECOND.base)
    const first = await makeFolder(page, firstName, FIRST.color)
    const second = await makeFolder(page, secondName, SECOND.color)

    await page.goto(routes.myDay)

    // The rows themselves, asserted before the paint, so a red below is about
    // the dot and not about the sidebar.
    await expect(
      folderRow(page, firstName),
      'spec 9.1: every accessible folder is in the sidebar, which is what the dot is drawn on',
    ).toHaveCount(1)
    await expect(
      folderRow(page, secondName),
      'spec 9.1: and the second one too',
    ).toHaveCount(1)

    const firstPaint = await paintedColors(folderRow(page, firstName))
    expect(
      firstPaint,
      `spec 9.1: each folder shows a colour dot, and frozen 7.4 carries the colour it shows on ` +
        `4.3 colour. This folder's is ${FIRST.color}, and nothing inside its row was painted ` +
        `with it. The row rendered these: ${JSON.stringify(firstPaint)}`,
    ).toContain(hexToRgb(FIRST.color))

    const secondPaint = await paintedColors(folderRow(page, secondName))
    expect(
      secondPaint,
      `spec 9.1: the second folder's dot carries its own colour, ${SECOND.color}. The row ` +
        `rendered these: ${JSON.stringify(secondPaint)}`,
    ).toContain(hexToRgb(SECOND.color))

    expect(
      first.id === second.id,
      'the two fixtures are two folders, which is what makes the comparison below meaningful',
    ).toBe(false)
  })

  test('AC-173: two folders with different colours do not render the same dot', async ({
    page,
  }) => {
    // The clause the criterion turns on. A client painting every row from one
    // swatch of tokens.css satisfies "a dot is present" everywhere and fails
    // only here, and it is the easiest version to write by accident, since a
    // single token applied to every row looks finished.
    const firstName = caseTitle(FIRST.base)
    const secondName = caseTitle(SECOND.base)
    await makeFolder(page, firstName, FIRST.color)
    await makeFolder(page, secondName, SECOND.color)

    await page.goto(routes.myDay)

    await expect(
      folderRow(page, firstName),
      'spec 9.1: one row per accessible folder, so each fixture is one row to read a colour ' +
        'from. A count other than one here is this file having left two folders behind rather ' +
        'than the client having drawn them wrongly',
    ).toHaveCount(1)
    await expect(folderRow(page, secondName), 'and one row for the second').toHaveCount(1)

    const firstPaint = await paintedColors(folderRow(page, firstName))
    const secondPaint = await paintedColors(folderRow(page, secondName))

    // The positive control, and this case is worth nothing without it. Both
    // assertions below are absences, and while no dot is drawn at all they
    // hold for the wrong reason: neither row carries the other's colour
    // because neither row carries any colour. So each row is asserted to
    // carry its own first, which is the rule this suite already runs on, that
    // a case asserting an absence establishes the presence it is an absence
    // of.
    expect(
      firstPaint,
      `spec 9.1: the first row carries its own colour ${FIRST.color}, without which the two ` +
        'assertions below are true of a sidebar that paints nothing',
    ).toContain(hexToRgb(FIRST.color))
    expect(
      secondPaint,
      `spec 9.1: and the second carries ${SECOND.color}`,
    ).toContain(hexToRgb(SECOND.color))

    expect(
      firstPaint,
      `spec 9.1: the dot carries that folder's own colour, so the row of the folder coloured ` +
        `${FIRST.color} does not carry ${SECOND.color}. A client painting one colour on every ` +
        'row shows a dot beside every folder and tells the person nothing they did not already ' +
        'know from the name',
    ).not.toContain(hexToRgb(SECOND.color))
    expect(
      secondPaint,
      `spec 9.1: and the row of the folder coloured ${SECOND.color} does not carry ` +
        `${FIRST.color}`,
    ).not.toContain(hexToRgb(FIRST.color))
  })

  test('AC-173: a folder with no colour still renders its name and pending count', async ({
    page,
  }) => {
    const name = caseTitle(UNCOLOURED.base)
    const folder = await makeFolder(page, name, null)
    // One pending task, so the count is a number that has to appear rather
    // than a zero whose rendering no section states.
    await createTask(page, {
      title: 'ac-173 the row that gives the uncoloured folder its count',
      folder_id: folder.id,
    })

    await page.goto(routes.myDay)

    const row = folderRow(page, name)
    await expect(
      row,
      'spec 9.1: a folder with no colour set is still a folder in the sidebar. 4.3 makes ' +
        'the identity colour nullable, so this is the ordinary case rather than an edge, and a client ' +
        'keying the row off the colour renders a gap where a folder should be',
    ).toHaveCount(1)
    await expect(
      row,
      'spec 9.1: the row shows the folder name',
    ).toContainText(name)

    const fresh = (await (await page.request.get('/api/v1/folders')).json()) as Folder[]
    const counted = fresh.find((entry) => entry.id === folder.id)
    expect(counted?.counts.pending, 'the fixture has one pending task').toBe(1)
    await expect(
      row,
      'spec 9.1 and 8.11: the row shows a pending count, and the sidebar badge is the pending ' +
        'number alone. Compared against what 7.4 reports at this moment rather than against a ' +
        'constant, so a badge showing the completed count or the total cannot pass by being a ' +
        'plausible integer',
    ).toContainText(String(counted?.counts.pending))
  })
})
