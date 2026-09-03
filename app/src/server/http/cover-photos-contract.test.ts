/*
The photo tier's three routes on the wire (routes/cover-photos.ts, polish
round of 2026-08-30): the search proxied with its thumbnails rewritten to
this origin, one thumbnail streamed by uuid, and a chosen photograph landed
through the same createFile as an upload.

The upstream is a stub HTTP server on a loopback port, pointed at through
OPENVERSE_BASE — the seam the router declares for exactly this test. Nothing
here touches the network, so the suite stays offline-honest.
*/
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../../../tests/auth-harness.js'
import type { AuthTestApp } from '../../../tests/auth-harness.js'
import { Cast, createFolder } from '../../../tests/folders-harness.js'
import type { Actor } from '../../../tests/folders-harness.js'
import { rows } from '../../../tests/helpers.js'

let app: AuthTestApp
const cast = new Cast(['picker'], 'coverphoto')

const PHOTO_ID = '3f9d2b1c-6a5e-4d7f-9b8a-1c2d3e4f5a6b'
/* A 1x1 PNG, the smallest decodable image sharp will take. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)

let upstream: ReturnType<typeof createServer>
let base = ''
let upstreamHits: string[] = []

beforeAll(async () => {
  upstream = createServer((req, res) => {
    upstreamHits.push(req.url ?? '')
    if (req.url?.startsWith('/v1/images/?q=')) {
      res.setHeader('Content-Type', 'application/json')
      res.end(
        JSON.stringify({
          results: [
            {
              id: PHOTO_ID,
              title: 'A linen texture',
              creator: 'someone',
              url: `${base}/full.png`,
              thumbnail: 'https://api.openverse.org/should-never-be-proxied/',
            },
            { id: 'not-a-uuid', title: 'dropped', url: 'https://x/y.png' },
          ],
        }),
      )
      return
    }
    if (req.url === `/v1/images/${PHOTO_ID}/thumb/`) {
      res.setHeader('Content-Type', 'image/png')
      res.end(PNG)
      return
    }
    if (req.url === `/v1/images/${PHOTO_ID}/`) {
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ id: PHOTO_ID, title: 'A linen texture', url: `${base}/full.png` }))
      return
    }
    if (req.url === '/full.png') {
      res.setHeader('Content-Type', 'image/png')
      res.end(PNG)
      return
    }
    res.statusCode = 404
    res.end('{}')
  })
  await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${String((upstream.address() as AddressInfo).port)}`
  process.env['OPENVERSE_BASE'] = base
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  delete process.env['OPENVERSE_BASE']
  await new Promise<void>((resolve) => upstream.close(() => resolve()))
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('the photo tier stays on this origin', () => {
  test('search proxies, drops the malformed, and rewrites every thumb to /api/v1', async () => {
    const [picker] = (await cast.of(app)) as [Actor]
    const answer = await picker.browser.json('/covers/photos?q=linen', 'GET')
    expect(answer.status, answer.body).toBe(200)
    const results = (answer.json() as { results: { id: string; thumb: string }[] }).results
    expect(results, 'the non-uuid upstream row is dropped, never proxied').toHaveLength(1)
    expect(
      results[0]?.thumb,
      "10.8's whole point: the grid paints from 'self', so the thumb is this API's own path",
    ).toBe(`/api/v1/covers/photos/${PHOTO_ID}/thumb`)
  })

  test('the thumb streams by uuid and a non-uuid id is 404, never fetched', async () => {
    const [picker] = (await cast.of(app)) as [Actor]
    const thumb = await picker.browser.api(`/covers/photos/${PHOTO_ID}/thumb`, { method: 'GET' })
    expect(thumb.status, thumb.body).toBe(200)
    expect(thumb.contentType).toContain('image/png')

    upstreamHits = []
    const refused = await picker.browser.api('/covers/photos/nonsense/thumb', { method: 'GET' })
    expect(refused.status).toBe(404)
    expect(upstreamHits, 'a refused id never reaches the upstream').toEqual([])
  })

  test('a chosen photograph becomes a cover file through createFile', async () => {
    const [picker] = (await cast.of(app)) as [Actor]
    const folder = await createFolder(picker, 'coverphoto linen wall')
    upstreamHits = []
    const stored = await picker.browser.json(`/folders/${folder}/cover/photo`, 'POST', {
      photo_id: PHOTO_ID,
    })
    expect(stored.status, stored.body).toBe(201)
    const file = stored.json() as { id: string; bytes: number }
    expect(file.bytes, 'the stored cover has real bytes').toBeGreaterThan(0)
    expect(
      upstreamHits[0],
      'the download URL comes from the upstream record the route fetched itself, never from the client',
    ).toBe(`/v1/images/${PHOTO_ID}/`)

    /* The file it made is 7.15's own: served back to its owner. */
    const served = await picker.browser.api(`/files/${file.id}`, { method: 'GET' })
    expect(served.status, served.body).toBe(200)

    const refused = await picker.browser.json(`/folders/${folder}/cover/photo`, 'POST', {
      photo_id: 'not-a-uuid',
    })
    expect(refused.status, 'photo_id is a uuid or nothing').toBe(422)
  })

  /*
  The folder-less arm, added 2026-09-03 for issues #20 and #100: the same act
  for a shelf or a place page, which are not folders and so have no id to put
  in the URL. It shares `storePhoto` with the route above, so what is worth
  asserting here is the one thing that differs — where the picture lands — and
  that the shared half still runs.
  */
  test('the same photograph becomes a folder-less cover for a shelf or a place', async () => {
    const [picker] = (await cast.of(app)) as [Actor]
    upstreamHits = []
    const stored = await picker.browser.json('/covers/photo', 'POST', {
      photo_id: PHOTO_ID,
    })
    expect(stored.status, stored.body).toBe(201)
    const file = stored.json() as { id: string; bytes: number }
    expect(file.bytes, 'the stored cover has real bytes').toBeGreaterThan(0)
    expect(
      upstreamHits[0],
      'the download URL still comes from the upstream record the route fetched itself, never from the client',
    ).toBe(`/v1/images/${PHOTO_ID}/`)

    const row = await rows(
      app.db,
      sql`SELECT folder_id, owner_id, kind FROM files WHERE id = ${file.id}::uuid`,
    )
    const record = row[0] as Record<string, unknown> | undefined
    expect(record?.folder_id, 'it belongs to the person, not to a folder').toBeNull()
    expect(String(record?.owner_id), 'and the person is the caller').toBe(picker.id)
    expect(String(record?.kind), 'stored as 4.16’s cover kind').toBe('cover')

    /* Served back to its owner, which is what makes it usable as a cover. */
    const served = await picker.browser.api(`/files/${file.id}`, { method: 'GET' })
    expect(served.status, served.body).toBe(200)

    const refused = await picker.browser.json('/covers/photo', 'POST', {
      photo_id: 'not-a-uuid',
    })
    expect(refused.status, 'photo_id is a uuid or nothing').toBe(422)
  })
})
