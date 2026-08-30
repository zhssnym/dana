/*
AC-263: given Important and given Scheduled, then each closes with a collapsed
Completed section in the grammar the folder page's already uses; and given a
completed task the viewer has starred, then Important's section lists it while
a completed task with no star is absent from it, the foot being the page's own
work finished rather than every finished thing.

**The ruling is the owner's of 2026-08-22 and the prototype carries it in its
own comments**, which is where a session should read it rather than from a
brief: `prototype-v2/src/screens/important-screen.tsx` says "every page that
lists tasks ends the same way (Imran, 2026-08-22): finished work, collapsed,
in the grammar a folder's Completed section and My Day's recap already use",
and `planned-screen.tsx` says the same and then answers the objection: "Spec
Q3 keeps completed rows out of the *list*, and this is a section under it
rather than rows in it, so the ordering rule is untouched." Neither
`pages/ImportantPage.tsx` nor `pages/ScheduledPage.tsx` contains the string
today; `pages/FolderPage.tsx` already draws one.

**9.5 is silent here rather than contradictory, and the difference matters.**
That section gives the collapsed completed foot to All in terms and does not
mention one on Important or Scheduled. It also does not forbid one, and it
enumerates neither page exhaustively enough to make the omission a rule. So
this is a numbered section that is quiet where an owner's ruling and the
prototype agree, which is the case RFC 0005 change control item 20 leaves to
the package rather than to an escalation, and it is recorded here in words so
a later reader can dispute it in one place.

**The starred discriminator is the whole of the second half.** There is one
completed read in this client, `/views/done`, and it answers everything the
viewer has finished. A page that mounted it unfiltered would close Important
with a list of completed work that was never starred, which is a different
promise and a worse one: the foot is meant to be this page's own work
finished. So a completed unstarred task is planted and asserted absent, and a
client that took the easy mount passes the first case and fails this one.

**Collapsed rather than merely present**, which is the grammar half. 9.5's own
sentence for All is "carried in a collapsed section at the foot", and AC-245
made every section with a heading a control carrying its name whose expanded
state says whether it is open. So the section is asserted closed on arrival
and asserted to open, which is the same shape the folder page's already has
and the reason this is "one implementation, reused" rather than a third.

Spec: 9.5 (All's collapsed completed section, and the two pages' own bullets),
9.6 (the folder page's Completed section at the foot, the grammar being
borrowed from there), 6 Q4 and Q3 (the two spines, which the foot sits under
rather than inside), the owner's ruling of 2026-08-22, and the parity audit's
Important and Scheduled rows.
*/
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  caseTitle,
  clickControl,
  createFolder,
  createTask,
  deleteFolder,
  routesV2,
  seedSubs,
  signIn,
  TEST_TIMEOUT_MS,
  transition,
} from './harness.js'

test.use({ timezoneId: 'UTC', actionTimeout: ACTION_TIMEOUT_MS })
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

interface Fixture {
  folderId: string
  /** Starred and completed: Important's foot lists it. */
  starredTitle: string
  /** Completed and never starred: Important's foot must not. */
  plainTitle: string
  /** Dated and completed: Scheduled's foot lists it. */
  datedTitle: string
}

async function build(page: Page): Promise<Fixture> {
  const folder = await createFolder(page, caseTitle('ac-257 folder'))

  const starredTitle = caseTitle('ac-257 starred')
  const starred = await createTask(page, {
    title: starredTitle,
    folder_id: folder.id,
    important: true,
  })
  await transition(page, starred.id, 'complete')

  const plainTitle = caseTitle('ac-257 plain')
  const plain = await createTask(page, { title: plainTitle, folder_id: folder.id })
  await transition(page, plain.id, 'complete')

  const datedTitle = caseTitle('ac-257 dated')
  const dated = await createTask(page, {
    title: datedTitle,
    folder_id: folder.id,
    due_date: '2026-11-02',
  })
  await transition(page, dated.id, 'complete')

  return { folderId: folder.id, starredTitle, plainTitle, datedTitle }
}

/** The foot, as AC-245 made every headed section: a control carrying its name. */
function completedControl(page: Page) {
  return page.getByRole('button', { name: /^Done/ }).first()
}

test.describe('AC-263: a completed foot closes Important and Scheduled', () => {
  let fixture: Fixture

  test.beforeEach(async ({ page }) => {
    await signIn(page, seedSubs.hassan)
    await page.goto(routesV2.desk)
    fixture = await build(page)
  })

  test.afterEach(async ({ page }) => {
    await deleteFolder(page, fixture.folderId)
  })

  for (const [name, path] of [
    ['Important', routesV2.important],
    ['Scheduled', routesV2.scheduled],
  ] as const) {
    test(`AC-263: ${name} closes with a collapsed Completed section`, async ({ page }) => {
      await page.goto(path)

      const control = completedControl(page)
      await expect(
        control,
        `the owner, 2026-08-22, and prototype-v2's own comment: "every page that lists tasks ` +
          `ends the same way: finished work, collapsed, in the grammar a folder's Completed ` +
          `section and My Day's recap already use". Neither pages/ImportantPage.tsx nor ` +
          `pages/ScheduledPage.tsx contains the string today`,
      ).toBeVisible()

      await expect(
        control,
        'spec 9.5: "carried in a collapsed section at the foot", and AC-245 makes the ' +
          'control\'s expanded state what open and collapsed mean. A section that arrived ' +
          'open would be a list of finished work above the work',
      ).toHaveAttribute('aria-expanded', 'false')

      await clickControl(control, 'the foot opens where it stands')
      await expect(control).toHaveAttribute('aria-expanded', 'true')
    })
  }

  test('AC-263: Important\'s foot is its own work finished, not every finished thing', async ({
    page,
  }) => {
    await page.goto(routesV2.important)
    await clickControl(completedControl(page), 'the foot is opened so its rows can be read')

    await expect(
      page.getByText(fixture.starredTitle, { exact: false }).first(),
      'a completed task the viewer starred belongs to Important\'s own spine, Q4 being the ' +
        'starred work, so the page\'s foot is where it finished',
    ).toBeVisible()

    await expect(
      page.getByText(fixture.plainTitle, { exact: false }),
      'there is one completed read in this client, /views/done, and it answers everything the ' +
        'viewer has finished. A page that mounted it unfiltered would close Important with ' +
        'work that was never starred, which passes the case above and is a different promise',
    ).toHaveCount(0)
  })

  test('AC-263: Scheduled\'s foot carries dated work and Q3\'s list is untouched', async ({
    page,
  }) => {
    await page.goto(routesV2.scheduled)

    await expect(
      page.getByText(fixture.datedTitle, { exact: false }),
      'prototype-v2\'s planned-screen: "Spec Q3 keeps completed rows out of the *list*, and ' +
        'this is a section under it rather than rows in it, so the ordering rule is ' +
        'untouched". So the completed row is not among the ladder\'s rungs while the foot ' +
        'is closed',
    ).toHaveCount(0)

    await clickControl(completedControl(page), 'the foot is opened so its rows can be read')
    await expect(
      page.getByText(fixture.datedTitle, { exact: false }).first(),
      'and it is in the foot, which is where finished dated work goes',
    ).toBeVisible()
  })
})
