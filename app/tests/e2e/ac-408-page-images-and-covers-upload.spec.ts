/*
AC-408: given Desk and given a folder the person made, when a picture is added
to the page through the Image item of its insert control, then it is stored and
served — the block draws it from `/api/v1/files/:id` after a reload and the
browser decodes it — and the cover picker's Upload tab on the same page does
the same.

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

**A shelf arm was added 2026-09-04 for issue #167**, which is the same round
trip on the page kind that could not make it at all. A shelf is not a folder,
so its page's blocks have none either, and `POST /files` required a `folder_id`
for `kind: image`: the client sent an empty one, the server answered 422, and
the person saw the optimistic draw and then nothing. 7.15 now stores a
folder-less image, `screens/shelf-page.tsx` sends no part rather than an empty
one, and this case is what says the two halves meet — the same reload, the same
`naturalWidth`, and for the same reason as the folder arms: the paint before
the round trip is true whether or not the bytes ever left.

**It reaches the block through 7.16 rather than through a tool at the foot of
the page, and that is a fact about the page rather than a shortcut.** Issue
#167 says "a shelf page's composer offers Image"; it does not — that page's
insert line is given a section and a paragraph and no image (measured
2026-09-04, `screens/shelf-page.tsx`) — so the only way a person reaches this
upload today is a picture block that already exists, and the fixture seeds one
the way the page itself would write it. Whether that composer should offer the
tool is a client question and Imran's; the server half is what #167 is.

**The control the two folder arms drive moved with #145 (2026-09-04).** The
Image chip at the foot of the page became one "Insert into page" menu when
#178 shipped the writing-first composer, so those arms reach the block through
`insertBlock` instead. Only the way the empty block is made changed; the round
trip after it — the choose, the reload, the served source and the decoded
width — is untouched, and so is the shelf arm above, which never used the
chip. Issues #145, #178, #181.

**And the barrier that orders the reload was the wrong one, found by the trace
of a red on 2026-09-04 and corrected here (issue #159's class).** Choosing a
picture is not one write and is not immediate: the client decodes it on a
canvas and downscales it before it sends anything, so the page is quiet for
longer than `API_SETTLE_MS` between `setFiles` and `POST /files`, and then
sends a *second* write, the whole-page PUT that puts the stored `file_id` on
the block. `waitForApiIdle` returns inside the first of those gaps, and the
`page.reload()` after it aborted the PUT: the picture was stored and the block
never named it, so the reload found an empty block and the case failed on the
picture it had just watched appear. Worse, an aborted request fires neither
`requestfinished` nor `requestfailed`, so the tracker's in-flight count stays
at one for the rest of the case and the *next* barrier fails too, fifteen
seconds of nothing with one request outstanding — which is how this presented
before the trace was read. The barrier is `watchCommit` taken before the
picture is chosen, which is `waitForApiIdle`'s own documented rule for an act
that writes and a read that depends on the write, and it covers the second
write for the reason `ac-350` gives: quiet cannot return between two writes
30ms apart. **No assertion changed.**

Spec: 9.6 (the page's blocks and its cover), 9.10 (the shelf page), 4.17, 4.18,
7.15 as amended 2026-09-04, 7.16, 10.8; issues #79, #13, #34, #167.
*/
import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

import {
  caseTitle,
  clickControl,
  createFolder,
  createShelf,
  csrfToken,
  insertBlock,
  routesV2,
  seedSubs,
  shortName,
  signIn,
  TEST_TIMEOUT_MS,
  watchCommit,
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
  await insertBlock(page, 'Image', {
    why: `spec 9.6: ${where} offers Image on the insert control at the foot of its page`,
  })
  /* Before the act (2026-09-04, issue #159's class; the header says why). The
     choose is followed by a decode, then the upload, then the whole-page PUT
     that names the stored file on the block, and the reload below has to come
     after all three. */
  const stored = watchCommit(page)
  await chooseAPicture(
    page,
    page.getByRole('button', { name: 'Add an image', exact: true }),
    `issue #79: ${where} lets a person choose a picture`,
  )
  await stored.settled(`${where}: the bytes go up and the block names the file`)

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
  /* Before the act (2026-09-04, issue #159's class), and for the same reason:
     the decode, the upload, and then the PATCH that points the folder at the
     stored file. */
  const covered = watchCommit(page)
  await chooseAPicture(
    page,
    page.getByRole('button', { name: 'Choose an image', exact: true }),
    'issue #79: a cover picture can be chosen',
  )
  await covered.settled('the cover is stored and the folder points at it')
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

/**
 * One empty image block on a shelf's page, written through 7.16's own PUT.
 *
 * The page is PUT whole, and this shelf has nothing else on it, so one block
 * is the whole body. `file_id` is absent: an unfilled block is exactly what
 * the page's own composer inserts before anybody chooses a picture, and it is
 * what gives this case its "Add an image" control to press.
 */
async function seedAnEmptyImageBlock(page: Page, shelfId: string): Promise<void> {
  const token = await csrfToken(page.context())
  const response = await page.request.put(`/api/v1/shelves/${shelfId}/page`, {
    data: { blocks: [{ kind: 'image', position: 0 }] },
    headers: { 'X-CSRF-Token': token },
  })
  expect(
    response.status(),
    `PUT /shelves/${shelfId}/page for the fixture answered ${response.status()}: ` +
      `${await response.text()}`,
  ).toBe(200)
}

test('AC-408: a shelf page stores and shows one too, its picture belonging to the person', async ({
  page,
}) => {
  await signIn(page, seedSubs.hassan)
  const shelf = await createShelf(page, shortName('AC-408 shelf'))
  await seedAnEmptyImageBlock(page, shelf.id)

  await page.goto(routesV2.shelf(shelf.id))
  /* Before the act (2026-09-04, issue #159's class), the third of the three. */
  const shelfStored = watchCommit(page)
  await chooseAPicture(
    page,
    page.getByRole('button', { name: 'Add an image', exact: true }),
    'issue #167: a shelf page lets a person choose a picture for its block',
  )
  await shelfStored.settled(
    'the bytes go up with no folder_id, and the block names the file',
  )
  await expect(
    page.getByText('This picture could not be stored, so it will not survive a reload.'),
    'issue #167: the 422 this used to answer is what that line said, and there is none',
  ).toHaveCount(0)

  await page.reload()
  const drawn = await drawnPicture(page)
  expect(
    drawn.src,
    "issue #167: after a reload the shelf page draws the picture from 7.15's serving path, " +
      'which is the whole of the round trip that could not be made at all',
  ).toContain('/api/v1/files/')
  expect(
    drawn.width,
    'and the browser decoded the bytes this origin served, so the block shows a picture ' +
      'rather than a reserved space',
  ).toBeGreaterThan(0)
})
