/*
Issue #108: a picture on a page reserves the shape 4.16 measured for it,
before the bytes arrive.

**Not a numbered criterion, and named for what it is.** Section 12 has none
for this, and this file does not invent one: `session-path.spec.ts` is the
precedent for a browser case that is worth running and is nobody's AC. If a
criterion is ever numbered for the reservation, this file takes the number and
this paragraph goes.

**Why it is a browser case rather than a unit test.** The unit half is in
`src/client/lib/page-images.test.ts`, where the fallback and the guards are
cheap to state and there is nothing to render. What that cannot say is the
thing the issue is actually about: that the shape 7.15 measured at upload,
stored on 4.16, and reported on the 7.16 block read reaches a CSS reservation
on the element a person looks at. Four contracts and a component sit between
the two ends of that sentence, and this leg is the only place they are all
running at once. The client half went wrong exactly there for a year:
`BlocksEditor` built its image model with a literal `16 / 9`, so the ratio the
component measured off the chosen file was thrown away on the next render and
no reader ever got a reservation, while the file headers said one was made.

**The picture is 300 by 100 on purpose.** A ratio of 3 is not 16 by 9, and a
square would not tell a width from a height, which is the same reason
`tests/uploads-harness.ts` grew `imagePng` beside its one-pixel constant. The
bytes come from sharp, the encoder the server decodes with, generated rather
than embedded and imported dynamically so that nothing loads the native module
for a spec that never asks for a picture.

**The assertion reads the reservation and not the box.** By the time an
assertion runs the picture has loaded, and a loaded image is its own shape
whether anything reserved space for it or not, so measuring the element would
pass on the defect. What discriminates is the computed `aspect-ratio`, which
is the reservation itself: a client that reserved nothing computes `auto`, and
one that fell back computes 16 by 9 against a file the wire measured.

Spec: 7.15 (the upload and what it answers), 4.16 (`width`/`height`), 7.16
(`file_width`/`file_height` on the block read), 4.17 (the image block), 9.6.
*/
import { expect, test } from '@playwright/test'

import {
  caseTitle,
  computedStyle,
  createFolder,
  csrfToken,
  routesV2,
  seedSubs,
  signIn,
  TEST_TIMEOUT_MS,
} from './harness.js'

test.describe.configure({ timeout: TEST_TIMEOUT_MS })

/** Neither square nor 16 by 9, so the assertion can fail two ways. */
const WIDTH = 300
const HEIGHT = 100

test('issue #108: a page image reserves the shape the wire reports', async ({ page }) => {
  await signIn(page, seedSubs.hassan)
  const folder = await createFolder(page, caseTitle('108 image'))
  const token = await csrfToken(page.context())

  /* sharp is the application's dependency and not the suite's, so the import
     is dynamic and inside the case, the reasoning `uploads-harness.ts` records
     for its own copy of this. A flat colour compresses to almost nothing. */
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

  const upload = await page.request.post('/api/v1/files', {
    multipart: {
      kind: 'image',
      folder_id: folder.id,
      file: { name: 'issue-108.png', mimeType: 'image/png', buffer: bytes },
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

  const put = await page.request.put(`/api/v1/folders/${folder.id}/page`, {
    data: { blocks: [{ kind: 'image', position: 0, file_id: stored.id }] },
    headers: { 'X-CSRF-Token': token },
  })
  expect(
    put.status(),
    `PUT /folders/:id/page answered ${put.status()}: ${await put.text()}`,
  ).toBe(200)

  await page.goto(routesV2.folder(folder.id))
  /* 4.17's image block with no caption, which `components/page-image.tsx`
     names for what it is rather than leaving unnamed. */
  const picture = page
    .getByRole('main')
    .getByRole('img', { name: 'Image on this page', exact: true })
  await expect(
    picture,
    'spec 4.17 and 9.6: the page draws the image block the PUT above put on it',
  ).toBeVisible()

  /* Through the harness's own reader, so this file does not carry a second
     spelling of "ask the browser what it computed". */
  const value = (await computedStyle(picture, ['aspectRatio'])).aspectRatio ?? ''
  /* A browser may serialise the property either way, `3` or `300 / 100`, and
     which one is not the subject of this case. */
  const [left, right] = value.split('/')
  const ratio = right === undefined ? Number(left) : Number(left) / Number(right)
  expect(
    ratio,
    'issue #108: the block reserves the shape 4.16 measured and 7.16 reported, so a reader ' +
      'who did not choose the picture gets the space it will take rather than the page ' +
      `jumping when it lands. The element computes ${value}; a client that reserves ` +
      'nothing computes "auto" and one still falling back computes 16 by 9, which is 1.78 ' +
      'against the 3 this picture is',
  ).toBeCloseTo(WIDTH / HEIGHT, 3)
})
