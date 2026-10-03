import { describe, expect, test } from 'vitest'

import { renderOpenStreetMapPreview } from './references.js'

describe('map preview rendering', () => {
  test('reads only fixed OpenStreetMap tiles and embeds attribution', async () => {
    const seen: string[] = []
    const image = await renderOpenStreetMapPreview(
      43.799123,
      -79.584321,
      async (input) => {
        seen.push(input)
        return new Response(Uint8Array.from([1, 2, 3]), {
          status: 200,
          headers: { 'content-type': 'image/png' },
        })
      },
    )

    expect(seen).toHaveLength(9)
    expect(seen.every((url) => url.startsWith('https://tile.openstreetmap.org/16/'))).toBe(true)
    expect(image).toContain('data:image/png;base64,AQID')
    expect(image).toContain('OpenStreetMap contributors')
    expect(image).toContain('<circle')
  })

  test('refuses a non-image upstream answer', async () => {
    await expect(renderOpenStreetMapPreview(
      43.799123,
      -79.584321,
      async () => new Response('no', { status: 200, headers: { 'content-type': 'text/html' } }),
    )).rejects.toThrow('OpenStreetMap tile request failed.')
  })
})
