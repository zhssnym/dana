/*
AC-340: given Scheduled in calendar view, when an open task is dragged from
its day to another, then 7.6 hears a PATCH of its due date and the task now
reads that day; and the month opens with today's cell in view.

Authored 2026-08-30 at the polish round (places F6, F7): a calendar that
showed rows and would not let you move them read as broken rather than
read-only.

**Reworked 2026-09-03, after it failed 2 of 10 CI legs that day with "the
task sits on its day: element(s) not found", and the failure was the suite's
own crowding rather than the calendar's.** The case dated its row on
`seedDate(1)`, the one day six earlier cases also date pending rows on
(AC-092's Tomorrow preset twice, AC-219's two fixtures, and the successors
AC-162 and AC-179 leave behind), beside the seed's timed "Call plumber". That
is eight rows against 9.5's month cell, which draws five and puts the rest
behind "+N more"; and which five is decided by Q3C's cell order, all-day rows
by `(status_rank, id)`, where the id is `gen_random_uuid()`. So the row was
hidden whenever its id sorted sixth or seventh of the seven, an expected 2 in
7, and the failure screenshot showed exactly that: a "+3 more" on the day and
the row behind it. The closing assertion had the same fault on the other
cell, measured at 4 of 12 with the case repeated alone, the day after filling
one row per repeat. Nothing in 9.5 requires a new row to be among the drawn
ones, so the case was asserting something the specification does not say,
and this is the criterion's defect rather than the calendar's.

Two things follow, and both are here to stay. The week zoom draws every row
a day holds, the constant height and the "+N more" being the six-week month
grid's (9.5, 11.4), so it is the zoom in which "the task sits on its day" is
observable whatever the other cases did to that day; the case asserts as
much, so a cap that ever reaches the week zoom fails this sentence by name
rather than by lottery. And the two days are chosen inside the week the zoom
shows, the first two that are not today, so both cells are on the grid
whatever today's weekday is; tomorrow and the day after are not, a
Saturday's day-after being next week's Monday. The month's F7 assertion is
untouched: the month still opens with today's cell in view, and only then is
the zoom changed.

**A second fault surfaced only once the first was fixed, because the week
zoom is what lets a crowded day make a cell taller than the window.** The
case dragged with `dragTo`, which scrolls the destination into view between
the press and the move, and the drag then begins on whatever lies under the
pressed point after that scroll. Measured with the case repeated alone, the
target day filling a row per repeat: 6 of 20 red once the cell outgrew the
window, and the trace of one of them shows the PATCH naming a neighbouring
row's id while the pressed row's date stood and the "Moved to" toast fired
for the neighbour; in four of the six no request went out at all, the point
having come to rest over nothing draggable. `harness.ts` records the same
rule over `carryInto` for the sortable engine, "only the grabbed element is
scrolled into view, never the destination", and the gesture below follows
it: the row is scrolled into view, and the drop point is read off the
destination's live box at the grabbed row's own height, which lies inside
the destination because the two cells share one grid row and a grid
stretches every cell to the row's height. Stepped rather than jumped, so
the destination hears the dragover it needs to accept the drop. The
calendar's own handler was never at fault: every run whose press stayed on
its row moved that row.

The read behind the drop crosses `watchCommit` rather than `waitForApiIdle`,
for the reason that helper's header gives: quiet alone is also true before
the write has left the browser, and here it was also true when no write was
ever going to, which the barrier names in as many words instead of reporting
a stale date.

The browser is pinned to UTC, as `harness.ts` asks of every spec that reads
`seedDate()`, so the week computed here is the week the client lays out.

The grid's accessible name read "Planned calendar" here until 2026-09-03
(issue #146). 9.5 fixes no name for the grid, so the one addressed is the
client's, and the client said the v1 page name until issue #19 (PR #69) took
it to the page's 9.1 name, "Scheduled calendar"; this case had pinned the old
string and was one of the three reds that day on `main`'s browser leg, the
other two being AC-099's, which asserted the same rename's tooltip. The
criterion's text already said "Scheduled" and did not move.

**The zoom is put back in `afterEach`, added 2026-09-04 with issue #140, and
nothing about the case itself moved.** 9.5's zoom stopped being component state
that day and became `user_settings.calendar_zoom`, so the Week press below is
now a write to the account rather than to this page. This leg shares one seeded
database in one worker, which makes anything written to that account a change
every later file inherits: measured with a throwaway probe on the day, a spec
sorting after this one opened the Scheduled calendar on a 7-cell week grid
instead of the 42-cell month. `ac-093` needs the month zoom and sorts before
this file, so the leg was green on ordering alone. The restore is the same
discipline AC-261 already keeps for the four Appearance fields, and it is the
harness rule about never leaving a shared row changed, applied to a column the
harness could not previously reach. No assertion here changed.

The mirror `lib/calendar-zoom.ts` keeps in `localStorage` is deliberately not
cleared here: Playwright gives each test its own context and therefore its own
storage, so there is nothing of this case's to leak, and the account is the
only thing two files share.

Spec: 9.5 as amended (the calendar and its persisted zoom), 7.6 (PATCH
due_date), 4.10 and 7.2 as annotated (`calendar_zoom`); issues #140 and #142.
*/
import { expect, test } from '@playwright/test'

import {
  caseTitle,
  chooseView,
  clickControl,
  createFolder,
  createTask,
  patchBundle,
  routesV2,
  seedDate,
  seedSubs,
  signIn,
  TEST_TIMEOUT_MS,
  watchCommit,
} from './harness.js'

test.use({ timezoneId: 'UTC' })
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

/* The week zoom this case chooses is the account's since issue #140, so it is
   handed back at 9.5's default rather than left for the next file. Through the
   API rather than by pressing Month again: a restore that depends on the
   control under test is a restore that stops running the day that control
   breaks, and this one runs even when the case has already failed.

   Guarded on the session, because that is the failure it would otherwise make
   worse: a case that dies before `signIn` has no cookie, `patchBundle` then
   reads no CSRF token and fails its own assertion, and the report names the
   cleanup instead of the thing that broke. There is nothing to restore in that
   state anyway, the zoom never having been touched. */
test.afterEach(async ({ page }) => {
  const signedIn = (await page.context().cookies()).length > 0
  if (!signedIn) return
  await patchBundle(page, { calendar_zoom: 'month' })
})

/**
 * The seven days 9.5's week zoom lays out around today, Monday first,
 * computed the way `seedDate` computes a day so the two cannot disagree.
 */
function weekOfToday(): string[] {
  const sundayFirst = new Date(`${seedDate(0)}T00:00:00Z`).getUTCDay()
  const monday = -((sundayFirst + 6) % 7)
  return Array.from({ length: 7 }, (_, index) => seedDate(monday + index))
}

test('AC-340: a row dragged to another day takes that date', async ({ page }) => {
  await signIn(page, seedSubs.hassan)
  const folder = await createFolder(page, caseTitle('AC-340 plants'))
  const title = caseTitle('Water the plants')
  const today = seedDate(0)
  const [from, to] = weekOfToday().filter((day) => day !== today)
  if (from === undefined || to === undefined) {
    throw new Error('unreachable: a week has six days that are not today')
  }
  const task = await createTask(page, { title, folder_id: folder.id, due_date: from })

  await page.goto(routesV2.scheduled)
  await chooseView(page, 'Calendar', 'spec 9.5: Scheduled offers the calendar')
  const grid = page.getByRole('grid', { name: 'Scheduled calendar' })
  await expect(grid).toBeVisible()
  await expect(
    grid.locator('[role="gridcell"][data-today="true"]'),
    'places F7: today is on the grid and in view on arrival',
  ).toBeInViewport()

  await clickControl(
    page
      .getByRole('group', { name: 'Calendar zoom' })
      .getByRole('button', { name: 'Week', exact: true }),
    'spec 9.5: the calendar offers a week zoom',
  )
  await expect(
    grid.getByRole('gridcell'),
    'spec 9.5: the week zoom lays out the seven days of the week, Monday first',
  ).toHaveCount(7)

  const source = grid.locator(`[role="gridcell"][data-date="${from}"]`)
  await expect(
    source.getByRole('button', { name: /^\+\d+ more$/ }),
    'spec 9.5: "+N more" belongs to the month grid\'s constant height, so the week zoom ' +
      'draws every row the day holds and nothing here is behind a reveal',
  ).toHaveCount(0)
  const row = source.getByRole('button', { name: title, exact: true })
  await expect(row, 'the task sits on its day').toBeVisible()
  const target = grid.locator(`[role="gridcell"][data-date="${to}"]`)
  await expect(target, 'the other day is on the same grid').toBeVisible()

  // The grab is scrolled into view and the destination never is: see the
  // header, and `carryInto` in the harness for the same rule.
  await row.scrollIntoViewIfNeeded()
  const grab = await row.boundingBox()
  const drop = await target.boundingBox()
  if (grab === null || drop === null) throw new Error('unreachable: both asserted visible above')
  const grabY = grab.y + grab.height / 2
  const commit = watchCommit(page)
  await page.mouse.move(grab.x + grab.width / 2, grabY)
  await page.mouse.down()
  await page.mouse.move(drop.x + drop.width / 2, grabY, { steps: 10 })
  await page.mouse.up()
  await commit.settled('places F6: the drop is 7.6\'s PATCH of the due date')

  const read = await page.request.get(`/api/v1/tasks/${task.id}`)
  expect(
    ((await read.json()) as { due_date: string | null }).due_date,
    'places F6: the drop is 7.6\'s PATCH of the due date',
  ).toBe(to)
  await expect(
    target.getByRole('button', { name: title, exact: true }),
    'and the row now stands on that day',
  ).toBeVisible()
})
