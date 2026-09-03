/*
AC-361: given an image upload, then the files row and the 201 answer carry
the width and height of the object that was stored, taken from the re-encode
that already happens; and given an image longer than 7.15's 2048px edge, then
what is recorded is the downscaled shape rather than the shape that arrived.

**The second half is the one worth having.** Recording the dimensions of the
bytes the browser sent would be an easy and wrong thing to do: 7.15 downscales
anything over 2048px on its longest edge, so a 3000 by 1500 upload is served
at 2048 by 1024, and a reader who reserved 3000 by 1500 would reserve a box of
the right proportion for the wrong picture only by luck of the arithmetic and
the wrong box outright the day the ratio stopped surviving the resize. The
columns exist so a page does not jump; they have to describe the object that
is served.

**Height and width are asserted separately against a picture that is not
square**, because a 1 by 1 image cannot tell a stored width from a stored
height and would pass a transposed insert.

Spec: 4.16 as amended by migration 0009, 7.15. Issue #27.
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast, createFolder, expectStatus } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import { rows } from './helpers.js'
import { imagePng, upload } from './uploads-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner'], 'i27')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

async function storedShape(
  app: AuthTestApp,
  fileId: string,
): Promise<{ width: unknown; height: unknown }> {
  const found = await rows(
    app.db,
    sql`SELECT width, height FROM files WHERE id = ${fileId}::uuid`,
  )
  return {
    width: found[0]?.width ?? null,
    height: found[0]?.height ?? null,
  }
}

describe('AC-361 an uploaded image records the shape it was stored at', () => {
  test('a non-square image records its width and its height, and the answer carries them', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const folder = await createFolder(owner, 'i27 ac361 folder')

    const stored = await upload(
      owner,
      '/files',
      { kind: 'image', folder_id: folder },
      {
        name: 'wide.png',
        type: 'image/png',
        bytes: await imagePng(40, 24),
      },
    )
    expectStatus(stored, 201, 'a decodable raster stores (spec 7.15)')
    const answer = stored.json() as { id?: unknown; width?: unknown; height?: unknown }
    expect(
      answer.width,
      'the 201 answer carries the width, so a caller that did not choose the bytes — the cover photo import fetches them server-side — learns what was stored (spec 7.15, issue #27)',
    ).toBe(40)
    expect(answer.height, 'and the height').toBe(24)

    const row = await storedShape(app, String(answer.id))
    expect(
      Number(row.width),
      'the files row carries the width; a page that cannot read this jumps by the height of the picture for every reader who did not upload it (4.16, issue #27)',
    ).toBe(40)
    expect(
      Number(row.height),
      'and the height, asserted separately because a square picture cannot catch a transposed insert',
    ).toBe(24)
  })

  test('an image past the 2048px edge records the downscaled shape, not the one that arrived', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const folder = await createFolder(owner, 'i27 ac361 downscale')

    const stored = await upload(
      owner,
      '/files',
      { kind: 'image', folder_id: folder },
      {
        name: 'huge.png',
        type: 'image/png',
        bytes: await imagePng(3000, 1500),
      },
    )
    expectStatus(stored, 201, 'the oversized raster stores, downscaled (spec 7.15)')
    const answer = stored.json() as { id?: unknown; width?: unknown; height?: unknown }

    expect(
      answer.width,
      '7.15 bounds the longest edge at 2048, and the recorded width must describe the object the store holds rather than the payload that arrived (issue #27)',
    ).toBe(2048)
    expect(
      answer.height,
      'the resize is fit: inside, so the shorter edge follows the ratio',
    ).toBe(1024)

    const row = await storedShape(app, String(answer.id))
    expect(Number(row.width), 'the row agrees with the answer').toBe(2048)
    expect(Number(row.height), 'the row agrees with the answer').toBe(1024)
  })
})
