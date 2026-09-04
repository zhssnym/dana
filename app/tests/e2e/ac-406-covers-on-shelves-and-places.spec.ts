/*
AC-406: given a shelf and given one of 4.20's built-in place pages, when a
picture is uploaded through the cover picker's Upload tab, then the page wears
that picture, it is still worn after a reload; when the place page's picture is
dragged and the position saved, then the crop is stored and the band is drawn
where it was left on the next load; and — on the shelf — a gallery preset
chosen afterwards takes the picture off.

**The reposition arm found a defect rather than confirming one, and it is
worth knowing which.** Pressing "Save position" wrote nothing on any page: the
band captures the pointer for the drag, capture retargets the click that
follows to the capturing element, and both controls are children of the band,
so neither could ever be reached. `page-cover.tsx` carries the measurement and
the fix. Nothing here was watching it because nothing could reach the state on
a place page before this issue — a gradient has no crop to move.

Authored 2026-09-04 for issue #118, whose product ruling is that "shelves and
place pages should use exactly the same Gallery, Upload, and Photos treatment
as folder pages". AC-342 is the folder page's half of the same act and this
case is written in its shape; AC-368 to AC-373 assert the endpoints from the
API side, and nothing in this repository drew a shelf's cover in a browser
before this file.

**Why the assertion is the painted background rather than an element.** A
cover is a band with no role and no accessible name — it is not a control and
not a region, so 9.1's addressing sentence does not reach it — and `Add cover`
disappearing proves only that *some* cover is stored, a gradient included.
What separates a picture from a preset is that a picture is served: the band
carries `background-image: url(…/api/v1/files/<id>)`, so what is measured here
is the paint, the same way AC-173 measures a folder's colour dot. The URL is
then fetched to prove the bytes are really there behind it.

Spec: 9.6 and 9.10 (a page's cover, and the shelf that has one), 4.18, 4.20,
7.15 (the folder-less upload), 7.16 (the shelf's PATCH), 7.19 (a place page's
cover).
*/
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import {
  clickControl,
  createShelf,
  routesV2,
  seedSubs,
  shortName,
  signIn,
  TEST_TIMEOUT_MS,
  waitForApiIdle,
  watchCommit,
  watchWire,
} from './harness.js'

test.describe.configure({ timeout: TEST_TIMEOUT_MS })

/* A real 8 by 8 PNG, because the upload is decoded twice before anything can
   be asserted: once by the client, which draws it on a canvas to downscale it,
   and once by the server, which refuses 422 for bytes it cannot read (7.15). */
const PICTURE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAHUlEQVR42mNkYPhfz0AEYBxV' +
    'SF+FjKMK6auQcVQhAJKcA/8B4ZlKAAAAAElFTkSuQmCC',
  'base64',
)

/**
 * Every served picture the browser painted as a background anywhere on the
 * page, which is what a cover drawn from a file looks like from outside.
 */
async function paintedCovers(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const view = globalThis as unknown as {
      document: { querySelectorAll: (s: string) => Iterable<unknown> }
      getComputedStyle: (el: unknown) => Record<string, string>
    }
    const painted: string[] = []
    for (const element of view.document.querySelectorAll('*')) {
      const image = String(view.getComputedStyle(element)['backgroundImage'] ?? '')
      if (image.includes('/api/v1/files/')) painted.push(image)
    }
    return painted
  })
}

/**
 * Where down the picture the band is drawn, as the browser reports it.
 *
 * 4.20's `focal_y` is a percentage down the cover, and `resolveCover` spends it
 * as `background-position: center <n>%`, so this is that number after a round
 * trip. Read from the element the picture is painted on, for the same reason
 * `paintedCovers` reads the picture: the band has no role and no name.
 */
async function paintedPosition(page: Page): Promise<string> {
  return page.evaluate(() => {
    const view = globalThis as unknown as {
      document: { querySelectorAll: (s: string) => Iterable<unknown> }
      getComputedStyle: (el: unknown) => Record<string, string>
    }
    for (const element of view.document.querySelectorAll('*')) {
      const style = view.getComputedStyle(element)
      if (String(style['backgroundImage'] ?? '').includes('/api/v1/files/')) {
        return String(style['backgroundPosition'] ?? '')
      }
    }
    return ''
  })
}

/** The picker's Upload tab, driven by its two named controls. */
async function uploadACover(page: Page, why: string): Promise<void> {
  await clickControl(
    page.getByRole('button', { name: 'Add cover', exact: true }),
    `${why}: the way in is the same control the folder page draws`,
  )
  /* Three tabs and not four. Link is the one option that cannot be switched on
     from here — 10.8's `img-src` admits no external host, so a pasted URL
     draws as the flat fallback — and a tier a surface cannot honestly supply
     is one it does not draw rather than one it disables (DES-144, #115). */
  await expect(
    page.getByRole('button', { name: 'Link', exact: true }),
    `${why}: issue #115 keeps the Link tab off every page until the server can fetch`,
  ).toHaveCount(0)
  await clickControl(
    page.getByRole('button', { name: 'Upload', exact: true }),
    `${why}: issue #118 puts the Upload tab on this page`,
  )
  const chooser = page.waitForEvent('filechooser')
  await clickControl(
    page.getByRole('button', { name: 'Choose an image', exact: true }),
    `${why}: the tab's own control opens the file chooser`,
  )
  /* The barrier is positive rather than negative, for the reason `watchCommit`
     states at length: quiet alone is true in the window between the gesture
     and the request the gesture causes, so it would pass through and leave the
     read below asking the server about a write nobody had made yet. */
  const commit = watchCommit(page)
  await (
    await chooser
  ).setFiles({ name: 'ac-406.png', mimeType: 'image/png', buffer: PICTURE })
  await commit.settled(`${why}: the picture is stored and the page points at it`)
  await page.keyboard.press('Escape')
}

test('AC-406: a shelf wears an uploaded picture, keeps it across a reload, and a preset takes it off', async ({
  page,
}) => {
  await signIn(page, seedSubs.hassan)
  const shelf = await createShelf(page, shortName('AC-406'))
  await page.goto(routesV2.shelf(shelf.id))
  const wire = watchWire(page)

  await uploadACover(page, 'spec 9.10: a shelf is a page with a cover of its own')

  const painted = await paintedCovers(page)
  expect(
    painted.length,
    'issue #118: the shelf draws the picture that was just uploaded, so a served file ' +
      'stands behind its band rather than a gradient',
  ).toBeGreaterThan(0)
  await expect(
    page.getByRole('button', { name: 'Change', exact: true }),
    'spec 9.6: a page wearing a cover offers Change on the band',
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Add cover', exact: true }),
    'and the way in is gone, there being a cover now',
  ).toHaveCount(0)

  const sent = wire.mutations().map((call) => `${call.method} ${new URL(call.url).pathname}`)
  expect(
    sent,
    'spec 7.15: the bytes go up as a file, which 7.16 then names on the shelf',
  ).toContain('POST /api/v1/files')
  expect(
    sent,
    `spec 7.16: the shelf's own PATCH is what stores the cover (issue #100)`,
  ).toContain(`PATCH /api/v1/shelves/${shelf.id}`)

  const served = /url\("([^"]*\/api\/v1\/files\/[^"]*)"\)/.exec(painted[0] ?? '')?.[1] ?? ''
  const bytes = await page.request.get(served)
  expect(
    bytes.status(),
    `spec 7.15 serves the stored cover from this origin; ${served} answered ${bytes.status()}`,
  ).toBe(200)

  await page.reload()
  await expect(
    page.getByRole('button', { name: 'Change', exact: true }),
    'the cover is stored rather than held for the session',
  ).toBeVisible()
  /* Polled rather than read once: a reload draws the page before the cover
     query has answered, so a single read here measures how fast this machine
     is rather than whether the cover was stored. */
  await expect
    .poll(
      () => paintedCovers(page),
      {
        message:
          'issue #118: the same picture is drawn after a reload, which is what "stored" ' +
          "means and what the prototype's session-only upload never was",
      },
    )
    .toContain(painted[0])

  await clickControl(
    page.getByRole('button', { name: 'Change', exact: true }),
    'spec 9.6: the cover can be changed from the band',
  )
  await clickControl(
    page.getByRole('option', { name: 'Cobalt', exact: true }),
    'one press on a gallery swatch',
  )
  await waitForApiIdle(page, 'the preset is written')
  await page.keyboard.press('Escape')
  expect(
    await paintedCovers(page),
    'spec 4.18: a cover is a file or a preset and never both, so choosing a preset takes ' +
      'the picture off rather than leaving it behind the gradient',
  ).toHaveLength(0)
  await expect(
    page.getByRole('button', { name: 'Change', exact: true }),
    'and the shelf is still wearing a cover, the gradient it was just given',
  ).toBeVisible()

  await page.reload()
  await expect(
    page.getByRole('button', { name: 'Change', exact: true }),
    'the shelf still wears the gradient on the next read',
  ).toBeVisible()
  expect(
    await paintedCovers(page),
    'and the picture is still off after a reload, the write having reached 7.16',
  ).toHaveLength(0)
})

test('AC-406: a built-in place page wears an uploaded picture and keeps it across a reload', async ({
  page,
}) => {
  await signIn(page, seedSubs.hassan)
  await page.goto(routesV2.today)
  const wire = watchWire(page)

  await uploadACover(page, 'spec 4.20: Today is a place a person can dress')

  const painted = await paintedCovers(page)
  expect(
    painted.length,
    'issue #118: a place page holds a picture now, where the client used to drop every ' +
      'key that was not a preset without a word',
  ).toBeGreaterThan(0)

  const sent = wire.mutations().map((call) => `${call.method} ${new URL(call.url).pathname}`)
  expect(
    sent,
    'spec 7.15: the upload carries no folder_id, a place page having no folder',
  ).toContain('POST /api/v1/files')
  expect(
    sent,
    "spec 7.19: the caller's own cover for this place is written by its PUT",
  ).toContain('PUT /api/v1/place-covers/today')

  await page.reload()
  await expect
    .poll(
      () => paintedCovers(page),
      {
        message:
          'spec 7.19: the entry is stored per viewer, so it is there on the next read',
      },
    )
    .toContain(painted[0])

  /*
  The reposition, which is the same write with only a position in it and the
  arm issue #118 fixed second. 7.19's PUT is idempotent over the whole entry
  rather than a partial update, so a drag has to re-send the cover it is
  moving; that re-send was spelled as a preset, which a picture's key can never
  be, so the drag was dropped and the band snapped back on the next read.
  */
  await page.getByRole('button', { name: 'Change', exact: true }).hover({ force: true })
  await clickControl(
    page.getByRole('button', { name: 'Reposition', exact: true }),
    'spec 9.6: a photographic cover can be moved, and 4.20 has somewhere to keep where',
  )
  const hint = page.getByText('Drag to reposition', { exact: true })
  await expect(hint, 'the band says what it is waiting for').toBeVisible()
  const grip = await hint.boundingBox()
  expect(grip, 'the band has to be on screen to be dragged').not.toBeNull()
  const x = (grip?.x ?? 0) + (grip?.width ?? 0) / 2
  const top = grip?.y ?? 0
  await page.mouse.move(x, top + 44)
  await page.mouse.down()
  /* Upward, which walks the crop down the picture. */
  await page.mouse.move(x, top + 8, { steps: 8 })
  const dragged = await paintedPosition(page)
  await page.mouse.up()
  expect(
    dragged,
    'spec 9.6: the band follows the pointer while it is being dragged, so what is saved is ' +
      'what was seen',
  ).not.toBe('50% 50%')
  const kept = watchCommit(page)
  await clickControl(
    page.getByRole('button', { name: 'Save position', exact: true }),
    'the drag is kept on purpose rather than on release',
  )
  await kept.settled('spec 4.20: the crop the drag left is written')
  expect(
    wire
      .mutations()
      .filter((call) => new URL(call.url).pathname === '/api/v1/place-covers/today').length,
    'spec 7.19: the drag is a write of its own, the endpoint being an idempotent PUT of the ' +
      'whole entry rather than a partial update — the cover is re-sent with the new crop',
  ).toBe(2)

  /*
  **The expected value comes from the server and never from a second reading of
  the screen.** A drag and the paint that follows it are one animation frame
  apart, so a case that compares what it measured before a reload with what it
  measures after is comparing two numbers it took itself, which is the shape
  CLAUDE.md records as failing more often on a quiet machine than a busy one.
  What 4.20 stored is a fact with no frame in it.
  */
  const entries = await page.request.get('/api/v1/place-covers')
  expect(entries.status(), 'spec 7.19 answers the caller their own covers').toBe(200)
  const stored = ((await entries.json()) as {
    covers: { place: string; file_id: string | null; focal_y: number }[]
  }).covers.find((entry) => entry.place === 'today')
  expect(
    stored?.file_id,
    'issue #118: the reposition re-sent the picture as 7.19 file_id, so the entry is still ' +
      'a picture; spelled as a preset it would have been dropped and this would be the ' +
      'upload’s own row untouched',
  ).toEqual(expect.any(String))
  expect(
    stored?.focal_y,
    'and the crop moved off 4.20’s default, which is what the drag was for',
  ).not.toBe(50)

  await page.reload()
  await expect
    .poll(() => paintedPosition(page), {
      message:
        'spec 4.20: the crop is read back on the next load and the band is drawn where it ' +
        'was left, rather than snapping to the middle',
    })
    .toBe(`50% ${String(stored?.focal_y)}%`)
})
