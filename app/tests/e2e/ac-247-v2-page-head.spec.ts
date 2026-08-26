/*
AC-247: given each of Today, Scheduled, Assignments, Important, All and
Anytime, then the page's mark is drawn above its title rather than inline
beside it, the page's fact where it has one sits on the title's own line, and
the mark is not a control; and given a folder page, then its mark is a control
opening the icon and colour picker, which is the one difference between the two
heads and is the one the F3 rework kept.

**This is the second of the audit's five gaps that most change what a person
sees on first open**, and it is the one a person meets by clicking twice. The
six place pages still wear the v1 header, a 24px glyph inline with the title
and a subtitle stacked under it, while the folder page one click away wears a
cover, a mark at identity scale and a window bar. Two compositions, one
product. DES-149's F3 rework extracted the folder page's head so that every
place wears it, and the extraction never reached the build.

**Geometry is what a criterion can hold here, and it is the whole
difference.** The v1 header and the v2 head carry the same three things, a
glyph, a title and a line of prose; what changed is where the glyph is. So the
assertion is the relation between two boxes rather than a class or a pixel
count: the mark's box ends at or above the title's box begins, which is true of
a mark standing over a title and false of one sitting beside it. A restyle that
moves the mark's size or colour leaves this criterion alone, which is what
9.1's "design may restyle" requires of anything asserted about appearance.

**The fact is asserted on the title's line for the same reason.** DES-149: "the
fact rides the title's line; prose sits under it." A page with a completion
puts it on the baseline and its prose below, and the two are told apart by
whether their boxes overlap vertically with the title's. Today is the one place
page with a fact, so it is the one page that arm runs on.

**The mark is not a control on a system page, and that is asserted as an
absence.** The header's own note: "My Day's sun is Dana's, and offering a
picker on it would promise a choice that does not exist." A port that reached
for the folder page's head wholesale would hand every place a picker, which is
a promise Dana cannot keep, so the criterion fails that port as well as the
unported one. The folder arm is the positive control: the same geometry, and
there a mark **is** a button, so an implementation that made every mark inert
fails too.

**Every page is driven rather than one**, because the fault this closes is six
pages each drawing their own header. A criterion that checked one would pass a
client that fixed one.

Spec: 9.4 (Today's "shared page head", the page's mark, title, description and
the fact "N of M done"), 9.6 (the folder page's mark is the identity control),
9.1 (the routes table), DES-149's F3 rework, and the parity audit's
"page-head, six place pages" row.
*/
import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  caseTitle,
  createTask,
  csrfToken,
  deleteTask,
  routesV2,
  seedIds,
  seedSubs,
  signIn,
  TEST_TIMEOUT_MS,
} from './harness.js'

test.use({ timezoneId: 'UTC', actionTimeout: ACTION_TIMEOUT_MS })
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

/** 9.1's routes table, the six places whose head the F3 rework moved. */
const PLACES = [
  { name: 'Today', path: routesV2.today },
  { name: 'Scheduled', path: routesV2.scheduled },
  { name: 'Assignments', path: routesV2.assignments },
  { name: 'Important', path: routesV2.important },
  { name: 'All', path: routesV2.all },
  { name: 'Anytime', path: routesV2.anytime },
] as const

/**
 * The page's own title, which every one of these pages renders as its `h1`.
 *
 * Scoped to `main` because the sidebar carries the same six words as links and
 * the tab strip carries them as tabs; the heading role is what separates the
 * page's name from its two navigations.
 */
function pageTitle(page: Page, name: string): Locator {
  return page.getByRole('main').getByRole('heading', { level: 1, name, exact: true })
}

/**
 * The mark, read as the head's own drawing rather than by a name it does not
 * have: an `svg` inside the header, above or beside the title.
 *
 * A glyph is `aria-hidden` everywhere in this client, deliberately, so there
 * is nothing to address it by and the element itself is what a criterion can
 * reach. The first `svg` in the head is the mark on both compositions, which
 * is why this locator tells them apart by geometry and not by count.
 */
function headMark(page: Page): Locator {
  return page.getByRole('main').locator('header svg, header img').first()
}

interface Box {
  x: number
  y: number
  width: number
  height: number
}

async function boxOf(locator: Locator, what: string): Promise<Box> {
  const box = await locator.boundingBox()
  expect(box, `${what} has no box on the page, so nothing about its position can be read`).not.toBeNull()
  return box as Box
}

test.describe('AC-247: the v2 page head', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, seedSubs.hassan)
  })

  for (const place of PLACES) {
    test(`AC-247: ${place.name} draws its mark above the title`, async ({ page }) => {
      await page.goto(place.path)

      const title = pageTitle(page, place.name)
      await expect(title).toBeVisible()

      const mark = headMark(page)
      await expect(
        mark,
        'DES-149: the composition is cover, mark, Add cover, title with its fact, ' +
          'description, so the head draws a mark',
      ).toBeVisible()

      const markBox = await boxOf(mark, `${place.name}'s mark`)
      const titleBox = await boxOf(title, `${place.name}'s title`)

      expect(
        markBox.y + markBox.height,
        `DES-149's F3 rework: ${place.name} "still wore the v1 header, a 24px glyph inline ` +
          'with the title, a subtitle stacked under it", while the folder page one click ' +
          'away had moved to a mark at identity scale standing over the name. A mark beside ' +
          'the title overlaps its line; a mark above it ends before the line begins',
      ).toBeLessThanOrEqual(titleBox.y + 1)

      expect(
        await mark.evaluate((node) => {
          const el = node as unknown as { closest: (s: string) => unknown }
          return el.closest('button') !== null || el.closest('a') !== null
        }),
        'the head\'s own distinction, which survives the port: "a system page\'s mark is not ' +
          'pickable, and a folder\'s is". Offering a picker on Today\'s sun would promise a ' +
          'choice that does not exist',
      ).toBe(false)
    })
  }

  test('AC-247: Today\'s fact rides the title\'s line', async ({ page }) => {
    /* 9.4 draws the fact only where there is something to count, so this case
       is given a task of its own rather than asked to inherit the seed's. */
    const made = await createTask(page, {
      title: caseTitle('ac-247 something to count'),
      folder_id: seedIds.groceries,
    })
    const token = await csrfToken(page.context())
    await page.request.post(`/api/v1/tasks/${made.id}/my-day?tz=UTC`, {
      headers: { 'X-CSRF-Token': token },
    })

    await page.goto(routesV2.today)

    const title = pageTitle(page, 'Today')
    const titleBox = await boxOf(title, "Today's title")

    /* 9.4 fixes the fact as "N of M done"; the count is the account's and the
       shape is what is asserted. */
    const fact = page.getByRole('main').getByText(/\d+ of \d+ done/).first()
    await expect(
      fact,
      'spec 9.4: the shared page head carries "the fact \\"N of M done\\"", and Today is one ' +
        'of the two places in the product that has a completion to count',
    ).toBeVisible()

    const factBox = await boxOf(fact, "Today's fact")
    expect(
      factBox.y < titleBox.y + titleBox.height && titleBox.y < factBox.y + factBox.height,
      'DES-149: "the fact rides the title\'s line; prose sits under it". A figure stacked ' +
        'under the name is the prose slot, which is where the description goes',
    ).toBe(true)

    await deleteTask(page, made.id)
  })

  test('AC-247: a folder\'s mark is a control and the geometry is the same', async ({ page }) => {
    await page.goto(routesV2.folder(seedIds.groceries))

    const title = page
      .getByRole('main')
      .getByRole('heading', { level: 1, name: 'Groceries', exact: true })
    await expect(title).toBeVisible()

    const mark = page
      .getByRole('main')
      .getByRole('button', { name: 'Icon and colour for Groceries', exact: true })
    await expect(
      mark,
      'spec 9.6: the folder page\'s mark is the identity control, "pressing it opens the ' +
        'icon-and-colour picker". This arm is the positive control for the absence asserted ' +
        'on the six: a client that made every mark inert would pass those and fail this',
    ).toBeVisible()

    const markBox = await boxOf(mark, "the folder's mark")
    const titleBox = await boxOf(title, "the folder's title")
    expect(
      markBox.y + markBox.height,
      'DES-149: the head is the folder page\'s composition extracted, so the two read as one ' +
        'family and the mark stands over the name on both',
    ).toBeLessThanOrEqual(titleBox.y + 1)
  })
})
