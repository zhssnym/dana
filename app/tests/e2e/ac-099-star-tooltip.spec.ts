/*
AC-099: given star hover on Important, then the tooltip names the task's home
page with its date or folder; on any other page it confirms importance.

Q4 is where the rule comes from and it gives the reason with it: every row on
Important is important by definition, so a star that said "important" there
would be telling the reader what the page they are on already told them. So
the tooltip points outward instead, "Also in Planned, due 2026-07-28" for a
dated row and "Also in Tasks, in Work" for an undated one, which is the same
information Q4's own sort uses to put the dated block first.

**Both arms are asserted, because the criterion is a contrast.** A tooltip
that always points outward and a tooltip that never does each satisfy one
half. The second arm is asserted on Planned, on a row that is important, so
the difference is the page and not the task.

**The outward copy is asserted by shape rather than character for
character, and this is a deliberate weakening with a reason.** Q4's two
strings are examples inside a query specification, not normative copy in
section 9: the words "Also in Planned" and "Also in Tasks" are fixed by
them, but nothing states how the date after "due" is spelled, and asserting
2026-07-28's format would pin a rendering decision the specification has not
made. So the page name and the outward direction are asserted exactly, and
the date is asserted as present rather than as formatted. The dated fixture
is a month out precisely so a client rendering "today" or "tomorrow" instead
of a date is not mistaken for a client rendering nothing.

**The inward copy was a silence when this file was written and is a string
now.** "Confirms importance" named nothing in section 9, so the second arm
could assert only that the tooltip did not point outward and was about
importance at all, and the gap was escalated rather than filled with an
invented word. The P8 change control closed it on 2026-08-11: off Important
the star's name is its own state, "Important" when filled and "Mark as
important" when not, and 9.5 makes that both the tooltip and the accessible
name. Two strings rather than one because the star is an icon-only toggle,
so each state owes a screen reader something true. The criterion's text does
not move; the second arm asserts the string instead of the shape of one, and
the star is addressed by that name rather than by a regex over two words.

Spec: 6 Q4 (the outward tooltip and its two forms), 9.5 (Important's star
and its outward tooltip), 9.1's addressing sentence, 7.10.
*/
import { expect, test } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  createTask,
  routes,
  seedDate,
  seedIds,
  seedSubs,
  signIn,
  taskRow,
  TEST_TIMEOUT_MS,
  tooltipText,
} from './harness.js'

test.use({ timezoneId: 'UTC', actionTimeout: ACTION_TIMEOUT_MS })
// Raised from Playwright's 30 second default so a red names its assertion
// rather than the clock, for the reason recorded at TEST_TIMEOUT_MS.
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

const DATED = 'ac-099 important and dated'
const UNDATED = 'ac-099 important and undated'
const DUE = seedDate(30)

test.beforeEach(async ({ page }) => {
  await signIn(page, seedSubs.hassan)
})

test.describe('AC-099: the star tooltip points outward on Important', () => {
  test('AC-099: a dated row names Planned and its date', async ({ page }) => {
    await createTask(page, {
      title: DATED,
      folder_id: seedIds.groceries,
      due_date: DUE,
      important: true,
    })

    await page.goto(routes.important)
    // Named rather than matched: 9.5 makes "Important" the star's accessible
    // name in the filled state, which is the state every fixture here is in.
    const star = taskRow(page, DATED).getByRole('button', { name: 'Important', exact: true })
    const tip = await tooltipText(
      star,
      'spec 9.4 and 6 Q4: every row carries a star, which is the control the tooltip belongs to',
    )

    expect(
      tip,
      'spec 6 Q4: the star tooltip on Important points outward, naming the page the row also ' +
        `lives on. It read ${JSON.stringify(tip)}`,
    ).toContain('Also in Planned')
    expect(
      tip,
      'spec 6 Q4: a dated row shows its due date beside the page it points at. The fixture is ' +
        'a month out so a relative wording would still carry the day',
    ).toContain(DUE.slice(8).replace(/^0/, ''))
  })

  test('AC-099: an undated row names Tasks and its folder', async ({ page }) => {
    await createTask(page, {
      title: UNDATED,
      folder_id: seedIds.groceries,
      important: true,
    })

    await page.goto(routes.important)
    const star = taskRow(page, UNDATED).getByRole('button', { name: 'Important', exact: true })
    const tip = await tooltipText(
      star,
      'spec 9.4 and 6 Q4: every row carries a star, which is the control the tooltip belongs to',
    )

    expect(
      tip,
      'spec 6 Q4: an undated important row lives in Tasks, so that is where the tooltip ' +
        `points. It read ${JSON.stringify(tip)}`,
    ).toContain('Also in Tasks')
    expect(
      tip,
      'spec 6 Q4: an undated row shows its folder where a dated row shows its date, which is ' +
        'the same split Q4 sorts the page by',
    ).toContain('Groceries')
  })

  test('AC-099: the same row on another page confirms importance instead', async ({
    page,
  }) => {
    await createTask(page, {
      title: DATED,
      folder_id: seedIds.groceries,
      due_date: DUE,
      important: true,
    })

    await page.goto(routes.planned)
    // Named rather than matched: 9.5 makes "Important" the star's accessible
    // name in the filled state, which is the state every fixture here is in.
    const star = taskRow(page, DATED).getByRole('button', { name: 'Important', exact: true })
    const tip = await tooltipText(
      star,
      'spec 9.4 and 6 Q4: every row carries a star, which is the control the tooltip belongs to',
    )

    expect(
      tip,
      'spec 6 Q4 gives the outward tooltip to Important, where every row is important by ' +
        'definition and saying so would repeat the page. On Planned the row sits among ' +
        `unimportant ones, so pointing outward is the wrong thing to say. It read ${JSON.stringify(tip)}`,
    ).not.toContain('Also in')
    expect(
      tip,
      "spec 9.5: off Important the star's name is its own state, \"Important\" when filled, " +
        'and that name is its tooltip. Asserted as the string since 2026-08-11; before that ' +
        'this case could ask only that the tooltip was about importance at all',
    ).toContain('Important')
    expect(
      tip,
      'spec 9.5: "Important" is the filled state, and this row is starred. A star showing ' +
        '"Mark as important" over a task that already is one tells the person their star did ' +
        'not take',
    ).not.toContain('Mark as important')
  })
})
