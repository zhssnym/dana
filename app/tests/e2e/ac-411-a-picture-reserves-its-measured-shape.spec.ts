/*
AC-411: given a folder page and a shelf page each carrying an image block
whose file 4.16 measured, then each reserves that picture's own shape before
the bytes arrive, rather than the 16 by 9 both drew for every picture.

Numbered from the tail on 2026-09-04 (issue #108), on the rule
`docs/spec/12-acceptance-criteria/README.md` states for a criterion authored on
a branch. It is 12.9's, beside **AC-363**, which is the server half of the same
sentence: that criterion pins that a member who did not upload the picture
*reads* its width and height on the block, and this one pins that the client
does something with them. The two were written a week apart, and the gap
between them is where the defect lived.

**Why it is a browser case rather than a unit test.** The unit half is in
`app/src/client/lib/page-images.test.ts`, where the fallback and the guards are
cheap to state and there is nothing to render; the unmeasured arm is asserted
there, this leg having no way to store a picture the server declines to
measure. What a unit test cannot say is the thing the issue is about: that the
shape 7.15 measured at upload, stored on 4.16 and reported on the 7.16 block
read reaches a CSS reservation on the element a person looks at. Four contracts
and a component sit between the two ends of that sentence, and this leg is the
only place they are all running at once. The client went wrong at exactly that
seam for a year, in two places: `components/page/BlocksEditor.tsx` and
`lib/shelf-layout.ts` each built their image model with a literal `16 / 9`, so
the ratio the component measured off the chosen file was thrown away on the
next render and no reader ever got a reservation, while the file headers said
one was made.

**Both surfaces, because there were two literals and one component.** A folder
page and a shelf page reach the same `components/page-image.tsx` through two
different translations of 4.17's blocks, so a case measuring one of them would
have passed while the other went on reserving nothing. That is not
hypothetical: the shelf half was still wrong when the folder half was fixed,
and this arm is the reason it did not ship that way.

**One uploaded file serves both arms.** A folder page's block admits files of
that folder; a shelf page's admits any file the viewer can read, which is
`fileScopeCondition` in `server/domain/pages.ts` as issue #107 left it. The
owner of a folder can read their own folder's picture, so one id is admitted on
both pages, and using one upload is what makes the two computed ratios
comparable to one number rather than to two.

**The picture is 300 by 100 on purpose.** A ratio of 3 is not 16 by 9, and a
square would not tell a width from a height, which is the same reason
`tests/uploads-harness.ts` grew `imagePng` beside its one-pixel constant. The
bytes come from sharp, the encoder the server decodes with, generated rather
than embedded and imported dynamically so that nothing loads the native module
for a spec that never asks for a picture.

**The assertion reads the reservation and not the box.** By the time an
assertion runs the picture has loaded, and a loaded image is its own shape
whether anything reserved space for it or not, so measuring the element would
pass on the defect. What discriminates is the computed `aspect-ratio`, which is
the reservation itself: a client that reserved nothing computes `auto`, and one
still falling back computes 16 by 9 against a file the wire measured.

Spec: 7.15 (the upload and what it answers), 4.16 (`width`/`height` as
migration 0009 added them), 7.16 (`file_width`/`file_height` on the block read,
and the file gate each kind of page applies), 4.17 (the image block), 9.6,
9.10; issues #27, #107, #108.
*/
import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

import {
  caseTitle,
  computedStyle,
  createFolder,
  createShelf,
  csrfToken,
  routesV2,
  seedSubs,
  shortName,
  signIn,
  TEST_TIMEOUT_MS,
} from './harness.js'

test.describe.configure({ timeout: TEST_TIMEOUT_MS })

/** Neither square nor 16 by 9, so the assertion can fail two ways. */
const WIDTH = 300
const HEIGHT = 100

/** One measured picture in a folder, answering the id a block then names. */
async function storedPicture(page: Page, folderId: string): Promise<string> {
  /* sharp is the application's dependency and not the suite's, so the import
     is dynamic and inside the helper, the reasoning `uploads-harness.ts`
     records for its own copy of this. A flat colour compresses to almost
     nothing. */
  const { default: sharp } = await import('sharp')
  const bytes = await sharp({
    create: {
      width: WIDTH,
      height: HEIGHT,
      channels: 3,
      background: { r: 32, g: 64, b: 128 },
    },
  })
    .png()
    .toBuffer()

  const token = await csrfToken(page.context())
  const upload = await page.request.post('/api/v1/files', {
    multipart: {
      kind: 'image',
      folder_id: folderId,
      file: { name: 'ac-411.png', mimeType: 'image/png', buffer: bytes },
    },
    headers: { 'X-CSRF-Token': token },
  })
  expect(
    upload.status(),
    `POST /files answered ${upload.status()}: ${await upload.text()}`,
  ).toBe(201)
  const stored = (await upload.json()) as {
    id: string
    width: number | null
    height: number | null
  }
  expect(
    [stored.width, stored.height],
    'spec 7.15 and 4.16: the 201 reports the shape of the object that was stored, which is ' +
      'the reading everything below depends on. If this fails, nothing about the client has ' +
      'been measured',
  ).toEqual([WIDTH, HEIGHT])
  return stored.id
}

/** 7.16's PUT, one image block and nothing else on the page. */
async function putImageBlock(page: Page, path: string, fileId: string): Promise<void> {
  const token = await csrfToken(page.context())
  const put = await page.request.put(path, {
    data: { blocks: [{ kind: 'image', position: 0, file_id: fileId }] },
    headers: { 'X-CSRF-Token': token },
  })
  expect(put.status(), `PUT ${path} answered ${put.status()}: ${await put.text()}`).toBe(200)
}

/**
 * 4.17's image block with no caption, which `components/page-image.tsx` names
 * for what it is rather than leaving unnamed.
 */
function pageImage(page: Page): Locator {
  return page.getByRole('main').getByRole('img', { name: 'Image on this page', exact: true })
}

/** What the browser computed for the reservation, as one number. */
async function reservedRatioOf(picture: Locator): Promise<{ value: string; ratio: number }> {
  /* Through the harness's own reader, so this file does not carry a second
     spelling of "ask the browser what it computed". */
  const value = (await computedStyle(picture, ['aspectRatio'])).aspectRatio ?? ''
  /* A browser may serialise the property either way, `3` or `300 / 100`, and
     which one is not the subject of this case. */
  const [left, right] = value.split('/')
  return { value, ratio: right === undefined ? Number(left) : Number(left) / Number(right) }
}

function why(surface: string, value: string): string {
  return (
    `AC-411: ${surface} reserves the shape 4.16 measured and 7.16 reported, so a reader who ` +
    'did not choose the picture gets the space it will take rather than the page jumping ' +
    `when it lands. The element computes ${value}; a client that reserves nothing computes ` +
    '"auto" and one still falling back computes 16 by 9, which is 1.78 against the 3 this ' +
    'picture is'
  )
}

test.describe('AC-411: a picture reserves its measured shape', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, seedSubs.hassan)
  })

  test('AC-411: a folder page reserves the shape the wire reports', async ({ page }) => {
    const folder = await createFolder(page, caseTitle('AC-411 folder'))
    const fileId = await storedPicture(page, folder.id)
    await putImageBlock(page, `/api/v1/folders/${folder.id}/page`, fileId)

    await page.goto(routesV2.folder(folder.id))
    const picture = pageImage(page)
    await expect(
      picture,
      'spec 4.17 and 9.6: the page draws the image block the PUT above put on it',
    ).toBeVisible()

    const reserved = await reservedRatioOf(picture)
    expect(reserved.ratio, why('a folder page', reserved.value)).toBeCloseTo(WIDTH / HEIGHT, 3)
  })

  test('AC-411: a shelf page reserves it too, through its own translation of the blocks', async ({
    page,
  }) => {
    /* The folder is only somewhere to keep the picture; the shelf's own block
       admits it because that gate is readability rather than folder scope. */
    const folder = await createFolder(page, caseTitle('AC-411 shelf source'))
    const shelf = await createShelf(page, shortName('AC-411 shelf'))
    const fileId = await storedPicture(page, folder.id)
    await putImageBlock(page, `/api/v1/shelves/${shelf.id}/page`, fileId)

    await page.goto(routesV2.shelf(shelf.id))
    const picture = pageImage(page)
    await expect(
      picture,
      'spec 9.10 and 4.17: a shelf page is a page, so it draws the block the PUT put on it',
    ).toBeVisible()

    const reserved = await reservedRatioOf(picture)
    expect(reserved.ratio, why('a shelf page', reserved.value)).toBeCloseTo(WIDTH / HEIGHT, 3)
  })
})
