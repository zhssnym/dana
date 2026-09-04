/*
AC-332: given a view saved from a page's filter panel, then it is listed
under "Saved views" in that page's panel and is not filed in the sidebar's
page block; and when the filter is cleared while the view is open, the
`?view=` address leaves with it.

Authored 2026-08-30 at the polish round (pagehead F3): a saved view landed in
the sidebar between All and the Library pretending to be a page, followed a
person to other pages, and stayed highlighted after "Clear all". 9.7's pin
list is where a person chooses to promote one.

**The clear has two halves and until 2026-09-04 this read only the smaller
one (issue #50).** The address assertion below is the half issue #47 called
smaller itself. The half a person feels is that the cleared filter put itself
back about half a second later, and nothing in a real browser looked at it:
delete the address guard in the saved-view seed at `views/usePlace.tsx` and
this case still passed, because `changeFilter` alone takes the id out of the
address and the seed then reapplied the filter with the address already clean.
The component test beside `usePlace.tsx` covers that path and mocks React
Router out by design, so it cannot see a change in React Router's own
behaviour, which is what the lag is.

**What is read is the chip and not the panel's switch.** 9.1 fixes the window
bar as where an active filter is legible — "active state renders as removable
chips in the window bar, never as a count alone" — so the chip is the state a
person sees, where the switch is behind a control that has to be reopened to
be read, and reopening it is an interaction that would settle the very lag
being measured.

**It can only fail when the race is lost, and it is not a deterministic
guard.** The late re-seed needs the location React Router was still holding to
commit after the clear; on a quiet machine that window never opens and this
case passes whether or not either half of #47's fix is present, which is why
the original defect went red in only two CI runs of four. That is worth having
anyway, and the address line beside it is the argument: it caught the defect
twice in four runs, which is how #47 was found at all. A second assertion
doubles what a lost race reports and costs nothing on a won one. Nobody should
record either as proof the filter holds.

**The settle is written the long way on purpose.** Reading the chip straight
after the press proves nothing, the clear emptying the window bar
synchronously: the first frame after it is clear whether or not the filter
comes back. So the read that matters is taken on the far side of the window
the re-seed would land in — the page quiet, and then a fixed grace beyond it,
the re-render needing no request of its own — and it is taken as a series of
samples whose worst one is asserted rather than as one instant. Asserting
*through* a transition is the failure CLAUDE.md's AC-182 bullet records from
the other side, an assertion reading a value the interface was on its way
through; waiting for the chip to go, and then watching that it stays gone,
keeps this read on the far side of both edges.

Spec: 9.1 (the filter and its save-view control, the window bar's chips; the
page block holds only what the pin list has pinned), 9.7.
*/
import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

import {
  caseTitle,
  clickControl,
  createFolder,
  createTask,
  deleteSavedView,
  fillControl,
  routesV2,
  seedSubs,
  sidebar,
  shortName,
  signIn,
  TEST_TIMEOUT_MS,
  waitForApiIdle,
  watchCommit,
} from './harness.js'

test.describe.configure({ timeout: TEST_TIMEOUT_MS })

/*
How long the window bar is watched after the clear, and why it is a number at
all. The seed that used to put the filter back fires when the location React
Router was holding finally commits, which `usePlace.tsx` describes as hundreds
of milliseconds late and issue #47 measured at about half a second. There is
nothing to wait *for* — the re-render issues no request — so the only honest
barrier is a window wide enough to contain that lag, taken after the page has
stopped talking to the API so the grace is spent on the re-render rather than
on a refetch.
*/
const REVERT_WINDOW_MS = 1_500

/*
9.1's window-bar chip for the important axis, addressed by the name its own
remove control carries: `FilterChips` labels each one `Remove <label>`, and
the label is "Important only" rather than "Important" because 9.1's names
table spends "Important" on a row's star. Exact, so that the star of some row
underneath can never answer for the chip.
*/
function importantChip(page: Page): Locator {
  return page.getByRole('button', { name: 'Remove Important only', exact: true })
}

test('AC-332: a saved view stays in the filter panel and leaves the address on Clear all', async ({
  page,
}) => {
  await signIn(page, seedSubs.hassan)
  const folder = await createFolder(page, caseTitle('AC-332 views'))
  await createTask(page, { title: caseTitle('ac-332 starred'), folder_id: folder.id, important: true })
  await page.goto(routesV2.folder(folder.id))
  const viewName = shortName('Big rocks')

  await clickControl(page.getByRole('button', { name: 'Filter', exact: true }), 'spec 9.1: the filter')
  await clickControl(
    page.getByRole('switch', { name: /Important only/ }),
    'spec 9.1: narrow to important',
  )
  /* An answer commits and closes the panel (9.1, and FilterControl's own
     seam note), so saving the view is a second visit to it. */
  await clickControl(page.getByRole('button', { name: 'Filter', exact: true }), 'reopen the panel')
  await clickControl(page.getByRole('button', { name: 'Save as view', exact: true }), 'spec 9.1: the save-view control')
  await fillControl(page.getByLabel('Name this view'), viewName, 'spec 9.1: a view is a name over a filter')
  /* Before the act (2026-09-04, issue #159). `waitForApiIdle` returns as
     soon as nothing is in flight, and that is also true in the window
     between the press and the request the press causes, so a read taken
     there lands before the write and reports the state the page was in
     before it -- which is the shape of the defect being asserted against
     rather than of a barrier. `watchCommit` waits for the page to have
     sent something before it waits for quiet. */
  const saved = watchCommit(page)
  await page.keyboard.press('Enter')
  await saved.settled('the view reaches the server before the panel is asked to list it')

  await expect(
    sidebar(page).getByRole('link', { name: viewName, exact: true }),
    'pagehead F3: a saved view is not a page and is not filed among them; 9.7\'s pin list promotes one',
  ).toHaveCount(0)

  await clickControl(page.getByRole('button', { name: 'Filter', exact: true }), 'reopen the panel')
  await expect(page.getByText('Saved views', { exact: true }), 'the panel lists this page\'s views').toBeVisible()
  await clickControl(
    page.getByRole('button', { name: viewName, exact: true }),
    'spec 9.1: opening a saved view is a navigation carrying its id',
  )
  await expect(page).toHaveURL(/\?view=/)
  /* The witness for the two reads below, and it is not decoration: a chip
     locator that matches nothing satisfies `toHaveCount(0)` on any page in
     the application, so the clear would be guarded by an assertion that
     cannot fail. This is the same locator finding the chip while the filter
     is on, which is also 9.1's own sentence about the window bar. */
  await expect(
    importantChip(page),
    'spec 9.1: an open view puts its filter on, and an active axis renders as a removable ' +
      'chip in the window bar',
  ).toBeVisible()

  await clickControl(page.getByRole('button', { name: 'Filter', exact: true }), 'reopen the panel')
  await clickControl(page.getByRole('button', { name: 'Clear all', exact: true }), 'spec 9.1: clear every axis')
  await expect(
    page,
    'pagehead F3: a hand-cleared filter is no longer the saved view, so its id leaves the address',
  ).not.toHaveURL(/view=/)

  /* The settle, not the assertion. A retrying matcher is exactly right for
     the filter's own re-render: the panel closes and the window bar redraws,
     and this waits that out without caring which frame it caught. */
  await expect(
    importantChip(page),
    'spec 9.1: "Clear all" clears every axis, so the important chip leaves the window bar with it',
  ).toHaveCount(0)
  /* Quiet and not `watchCommit` (issue #159): what is read below is the
     window bar, a client-side value, and the claim is that nothing puts the
     filter back. This is a lower bound on the settle rather than the barrier
     itself -- the re-seed issues no request of its own, so the grace after it
     is what actually covers the lag. */
  await waitForApiIdle(page, 'the cleared filter has finished refetching this page')

  /* The assertion. Sampled across the window the late re-seed would land in
     and asserted on the worst sample, so a filter that comes back for any
     part of it fails here rather than being decided by which instant one
     read happened to catch. */
  const chipSeen: number[] = []
  const watchUntil = Date.now() + REVERT_WINDOW_MS
  do {
    chipSeen.push(await importantChip(page).count())
    await page.waitForTimeout(50)
  } while (Date.now() < watchUntil)
  expect(
    Math.max(...chipSeen),
    'issue #47: a filter cleared by hand stays cleared. The saved view seeded its own ' +
      'definition back over the edit when the location it was read from committed late, ' +
      'and the address assertion above cannot see that: `changeFilter` takes the id out ' +
      'of the address synchronously, so the filter reappeared with the address already ' +
      'clean. A count above zero here is the chip back in the window bar during the ' +
      `${REVERT_WINDOW_MS}ms after the clear`,
  ).toBe(0)

  const listed = await page.request.get('/api/v1/views')
  const views = (await listed.json()) as { views?: { id: string; name: string }[] } | { id: string; name: string }[]
  const rows = Array.isArray(views) ? views : (views.views ?? [])
  for (const view of rows.filter((entry) => entry.name === viewName)) await deleteSavedView(page, view.id)
})
