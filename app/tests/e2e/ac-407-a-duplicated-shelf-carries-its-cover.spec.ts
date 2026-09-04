/*
AC-407: given a shelf wearing an uploaded picture, when it is duplicated, then
the copy is named "<name> (copy)" and wears the same picture as a file of its
own; and when the copy's cover is removed, then the original is still wearing
its picture.

Authored 2026-09-04 for issue #117, on Imran's ruling there: "a duplicated
shelf should keep the same-looking cover, but the two covers must be
independent. Changing or removing the cover on either shelf must not change
the other." AC-387 and AC-388 assert the endpoint's own halves; this is the
act as a person performs it, through the shelf's More actions menu, which is
the only place the two sentences of that ruling can be seen to hold at once.

**"The same picture" and "a file of its own" are asserted as two different
things, because they are.** The copy's band names a different file id — one
`cover_file_id` on two shelves would not be independence, the foreign key's ON
DELETE SET NULL blanking both the moment that file went — and the bytes behind
the two ids are compared and are equal. Neither assertion alone is the ruling:
the same id would look identical and share a fate, and two different pictures
would be independent and wrong.

Spec: 9.10 (Duplicate, the page and no folders), 7.16 as amended 2026-09-04
(the copy's name, its fields, and its own cover file), 7.19 (the copy rule the
duplicate spends), 4.18.
*/
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import {
  clickControl,
  createShelf,
  routesV2,
  seedSubs,
  signIn,
  TEST_TIMEOUT_MS,
  waitForApiIdle,
  watchWire,
} from './harness.js'

test.describe.configure({ timeout: TEST_TIMEOUT_MS })

/* An 8 by 8 PNG: the client decodes it on a canvas to downscale it and the
   server decodes it again, refusing 422 for bytes it cannot read (7.15). */
const PICTURE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAHUlEQVR42mNkYPhfz0AEYBxV' +
    'SF+FjKMK6auQcVQhAJKcA/8B4ZlKAAAAAElFTkSuQmCC',
  'base64',
)

/**
 * The served picture this page's cover is drawn from, or the empty string
 * where the page is wearing no picture.
 *
 * A cover band is not a control and not a region, so 9.1's addressing sentence
 * does not reach it and there is nothing to name; what separates a picture
 * from a gradient is that a picture is served, so the paint is what is read.
 */
async function paintedCover(page: Page): Promise<string> {
  return page.evaluate(() => {
    const view = globalThis as unknown as {
      document: { querySelectorAll: (s: string) => Iterable<unknown> }
      getComputedStyle: (el: unknown) => Record<string, string>
    }
    for (const element of view.document.querySelectorAll('*')) {
      const image = String(view.getComputedStyle(element)['backgroundImage'] ?? '')
      const served = /url\("([^"]*\/api\/v1\/files\/[^"]*)"\)/.exec(image)?.[1]
      if (served !== undefined) return served
    }
    return ''
  })
}

test('AC-407: a duplicated shelf wears the same picture as a file of its own, and the two are independent', async ({
  page,
}) => {
  await signIn(page, seedSubs.hassan)
  /* Short enough that 7.16's "(copy)" suffix fits inside 10.3's 40 characters
     without the endpoint cutting the base to make room, which is what this
     case wants to read back. */
  const name = `AC-407 ${test.info().testId.slice(-12)}`
  const shelf = await createShelf(page, name)
  await page.goto(routesV2.shelf(shelf.id))

  await clickControl(
    page.getByRole('button', { name: 'Add cover', exact: true }),
    'spec 9.10: a shelf wears a cover of its own',
  )
  await clickControl(
    page.getByRole('button', { name: 'Upload', exact: true }),
    'issue #118 put the Upload tab on this page',
  )
  const chooser = page.waitForEvent('filechooser')
  await clickControl(
    page.getByRole('button', { name: 'Choose an image', exact: true }),
    "the tab's own control opens the file chooser",
  )
  await (
    await chooser
  ).setFiles({ name: 'ac-407.png', mimeType: 'image/png', buffer: PICTURE })
  await waitForApiIdle(page, 'the picture is stored and the shelf points at it')
  await page.keyboard.press('Escape')

  const original = await paintedCover(page)
  expect(
    original,
    'the fixture this case needs is a shelf actually wearing a picture (AC-406)',
  ).toContain('/api/v1/files/')

  const wire = watchWire(page)
  /* 9.1 names every overflow menu "More actions" and separates them by the
     region each is reached inside, which is this page's own; the sidebar's
     rows carry the same name and live outside it. AC-246 addresses the folder
     page's window-bar menu the same way. */
  const shelfMenu = page
    .getByRole('main')
    .getByRole('button', { name: 'More actions', exact: true })
  await expect(
    shelfMenu,
    "spec 9.1: one overflow menu on the page itself, the shelf's own",
  ).toHaveCount(1)
  await clickControl(shelfMenu, "spec 9.10: the shelf's overflow carries its contract")
  await clickControl(
    page.getByRole('menuitem', { name: 'Duplicate', exact: true }),
    'spec 9.10: Duplicate is one of the acts a shelf declares',
  )
  await waitForApiIdle(page, 'the copy is made and this page follows it')
  await expect(
    page,
    'spec 7.16: the act answers the new shelf, which the client opens',
  ).toHaveURL(new RegExp(`/app/shelves/(?!${shelf.id}$)[0-9a-f-]+$`))

  /* What the act itself sent, which is where #128's "no half-duplicated shelf"
     is visible. The list is filtered to the shelf-making calls rather than
     compared whole: opening a shelf page writes its arrangement once through
     7.16's PUT, which is that page's own behaviour and not the duplicate's,
     and a criterion about the copy should not fail when it changes. */
  const made = wire
    .mutations()
    .map((call) => `${call.method} ${new URL(call.url).pathname}`)
    .filter((call) => !call.endsWith('/page'))
  expect(
    made,
    'spec 7.16 as amended: the duplicate is one call rather than a create followed by a ' +
      'patch, because a failure in the gap between two is the half-duplicated shelf #128 ' +
      'forbids, and `POST /shelves` refuses a cover outright so two calls could not carry one',
  ).toEqual([`POST /api/v1/shelves/${shelf.id}/duplicate`])

  await expect(
    page.getByLabel('Shelf name'),
    'spec 7.16 as amended: the copy is marked "(copy)", the parenthesis included, ' +
      "4.18's UNIQUE (user_id, name) admitting no second one",
  ).toHaveValue(`${name} (copy)`)

  const copy = await paintedCover(page)
  expect(
    copy,
    'issue #117: the copy wears a cover, which is the whole of what it used to lose — ' +
      '`POST /shelves` refuses a cover out loud, so the two-call duplicate could not carry one',
  ).toContain('/api/v1/files/')
  expect(
    copy,
    "Imran on #117: the two covers are independent, so the copy names a file of its own; " +
      "one id on two shelves is blanked for both the moment that file goes",
  ).not.toBe(original)

  const [copyBytes, originalBytes] = await Promise.all([
    page.request.get(copy),
    page.request.get(original),
  ])
  expect(copyBytes.status(), `the copy's own file serves; ${copy}`).toBe(200)
  expect(originalBytes.status(), `and so does the original's; ${original}`).toBe(200)
  expect(
    (await copyBytes.body()).equals(await originalBytes.body()),
    'Imran on #117: the duplicated shelf keeps a same-looking cover, so the two files are ' +
      'the same picture and only the rows differ',
  ).toBe(true)

  const copyUrl = page.url()
  /* Hovered rather than opened, exactly as AC-342 reads the folder page's
     band: pressing Change opens the picker, which carries a Remove of its own,
     and the one this criterion means is the band's, beside Change. */
  await page
    .getByRole('button', { name: 'Change', exact: true })
    .hover({ force: true })
  await clickControl(
    page.getByRole('button', { name: 'Remove', exact: true }),
    'pagehead F7: Remove sits beside Change and takes the cover off in one act',
  )
  await waitForApiIdle(page, "the copy's cover is cleared")
  await expect(
    page.getByRole('button', { name: 'Add cover', exact: true }),
    'the copy is bare, the way back in drawn again',
  ).toBeVisible()

  await page.goto(routesV2.shelf(shelf.id))
  await expect
    .poll(() => paintedCover(page), {
      message:
        'Imran on #117: removing the cover on one shelf must not change the other, and ' +
        'the original is still wearing its picture',
    })
    .toBe(original)
  expect(
    (await page.request.get(original)).status(),
    "and the original's file is still served, the copy's removal having taken only its own",
  ).toBe(200)

  await page.goto(copyUrl)
  await expect(
    page.getByRole('button', { name: 'Add cover', exact: true }),
    'while the copy is still bare on its own next read',
  ).toBeVisible()
})
