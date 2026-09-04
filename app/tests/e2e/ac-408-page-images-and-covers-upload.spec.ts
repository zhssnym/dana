/*
AC-408: given Desk and given a folder the person made, when a picture is added
to the page through the Image tool, then it is stored and served — the block
draws it from `/api/v1/files/:id` after a reload and the browser decodes it —
and the cover picker's Upload tab on the same page does the same.

Authored 2026-09-04 for issue #79, "images cannot be uploaded or shown in Desk
and user folders", and it is a **guard rather than a fix**: driven in a browser
on 2026-09-04 the reported fault was already gone, closed on `main` by the
Content-Security-Policy work of issues #13 and #34. Nothing in this repository
was watching that, which is why the criterion exists.

**What the fault was, because the shape of it is what this case has to keep
out.** `lib/page-images.ts` downscales a chosen file before uploading it, and
the downscale decodes the picture by pointing an `Image` at
`URL.createObjectURL(file)` — a `blob:` URL. 10.8's policy sent `img-src 'self'
data:` and no `blob:`, so the decode was refused, `scaleImageFile` resolved
null, and `take` returned **before sending anything at all**. From the outside
that is a person choosing a file and nothing whatever happening: no request, no
error state, no toast, and a console line they never saw. `src/server/index.ts`
carries the refusal quoted from Chromium and the four directives that answer it.

**So the assertion is the whole round trip and not the optimistic draw.** The
block paints a data URL the moment a file is chosen, which is true whether or
not the bytes ever leave, so what is read here is after a reload: the source is
a served file, and `naturalWidth` is non-zero, which is the browser saying it
decoded the bytes this origin sent rather than reserving space for a picture
that never came.

Spec: 9.6 (the page's blocks and its cover), 4.17, 7.15, 10.8; issues #79, #13,
#34.
*/
import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

import {
  caseTitle,
  clickControl,
  createFolder,
  routesV2,
  seedSubs,
  signIn,
  TEST_TIMEOUT_MS,
  waitForApiIdle,
} from './harness.js'

test.describe.configure({ timeout: TEST_TIMEOUT_MS })

/* An 8 by 8 PNG. It has to be a real one twice over: the client decodes it on
   a canvas to downscale it, which is the step the policy used to refuse, and
   the server decodes it again and answers 422 for bytes it cannot read. */
const PICTURE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAHUlEQVR42mNkYPhfz0AEYBxV' +
    'SF+FjKMK6auQcVQhAJKcA/8B4ZlKAAAAAElFTkSuQmCC',
  'base64',
)

/** Hands a picture to whatever file chooser the named control opens. */
async function chooseAPicture(
  page: Page,
  control: Locator,
  why: string,
): Promise<void> {
  const chooser = page.waitForEvent('filechooser')
  await clickControl(control, why)
  await (
    await chooser
  ).setFiles({ name: 'ac-408.png', mimeType: 'image/png', buffer: PICTURE })
}

/** What the browser made of the picture: its source, and whether it decoded. */
async function drawnPicture(page: Page): Promise<{ src: string; width: number }> {
  const image = page.getByRole('img', { name: 'Image on this page', exact: true })
  await expect(image, 'spec 9.6: the block draws the picture it names').toBeVisible()
  return image.evaluate((node) => {
    const drawn = node as unknown as { currentSrc: string; naturalWidth: number }
    return { src: drawn.currentSrc, width: drawn.naturalWidth }
  })
}

async function anImageBlockKeepsItsPicture(page: Page, where: string): Promise<void> {
  await page.mouse.move(4, 4)
  await clickControl(
    page.getByRole('main').getByRole('button', { name: 'Image', exact: true }).last(),
    `spec 9.6: ${where} offers the Image tool at the foot of its page`,
  )
  await chooseAPicture(
    page,
    page.getByRole('button', { name: 'Add an image', exact: true }),
    `issue #79: ${where} lets a person choose a picture`,
  )
  await waitForApiIdle(page, `${where}: the bytes go up and the block names the file`)

  await expect(
    page.getByText('This picture could not be stored, so it will not survive a reload.'),
    `${where}: the block says so when the store refuses, and nothing was refused`,
  ).toHaveCount(0)

  await page.reload()
  const drawn = await drawnPicture(page)
  expect(
    drawn.src,
    `issue #79: after a reload ${where} draws the picture from 7.15's serving path, which ` +
      'is the whole of "and stays there after opening the page again"',
  ).toContain('/api/v1/files/')
  expect(
    drawn.width,
    `10.8 as widened by #13 and #34: the browser decoded the bytes this origin served, so ` +
      `${where} shows a picture rather than a reserved space`,
  ).toBeGreaterThan(0)
}

test('AC-408: Desk stores and shows a picture added to its page', async ({ page }) => {
  await signIn(page, seedSubs.hassan)
  await page.goto(routesV2.desk)
  await anImageBlockKeepsItsPicture(page, 'Desk')
})

test('AC-408: a folder the person made stores and shows one too, on its page and on its cover', async ({
  page,
}) => {
  await signIn(page, seedSubs.hassan)
  const folder = await createFolder(page, caseTitle('AC-408 images'))
  await page.goto(routesV2.folder(folder.id))
  await anImageBlockKeepsItsPicture(page, 'a folder the person made')

  /* The other half of #79's report, which names "the image or cover area": the
     same upload through the cover picker, whose own decode is the same one. */
  await clickControl(
    page.getByRole('button', { name: 'Add cover', exact: true }),
    'spec 9.6: a folder page can be given a cover',
  )
  await clickControl(
    page.getByRole('button', { name: 'Upload', exact: true }),
    "the picker's Upload tab",
  )
  await chooseAPicture(
    page,
    page.getByRole('button', { name: 'Choose an image', exact: true }),
    'issue #79: a cover picture can be chosen',
  )
  await waitForApiIdle(page, 'the cover is stored and the folder points at it')
  await page.keyboard.press('Escape')

  await page.reload()
  await expect(
    page.getByRole('button', { name: 'Change', exact: true }),
    'the folder is wearing a cover on the next read',
  ).toBeVisible()
  const served = await page.evaluate(() => {
    const view = globalThis as unknown as {
      document: { querySelectorAll: (s: string) => Iterable<unknown> }
      getComputedStyle: (el: unknown) => Record<string, string>
    }
    for (const element of view.document.querySelectorAll('*')) {
      const image = String(view.getComputedStyle(element)['backgroundImage'] ?? '')
      const url = /url\("([^"]*\/api\/v1\/files\/[^"]*)"\)/.exec(image)?.[1]
      if (url !== undefined) return url
    }
    return ''
  })
  expect(
    served,
    'issue #79: the band is drawn from a stored file after a reload, not from an object ' +
      'URL that dies with the session',
  ).toContain('/api/v1/files/')
  expect(
    (await page.request.get(served)).status(),
    `spec 7.15 serves the cover from this origin; ${served}`,
  ).toBe(200)
})
