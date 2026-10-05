import { describe, expect, test } from 'vitest'

import { resolveGoogleMapsShortLink } from './references.js'

describe('Google Maps short-link resolution', () => {
  test('uses the desktop redirect path and browser headers for shared links', async () => {
    const seen: Array<{ readonly input: string; readonly headers: Readonly<Record<string, string>> }> = []
    const resolved = await resolveGoogleMapsShortLink(
      'https://maps.app.goo.gl/V44HGo5M7RrJpwgE9?g_st=ac',
      async (input, init) => {
        seen.push({ input, headers: init.headers })
        return new Response(null, {
          status: 302,
          headers: { location: 'https://www.google.com/maps/place/182+Tall+Grass+Trail/@43.799123,-79.584321,17z/data=!4m6!3m5!1sabc!8m2!3d43.799123!4d-79.584321!16sabc' },
        })
      },
    )

    expect(resolved).toContain('https://www.google.com/maps/place/182+Tall+Grass+Trail/')
    expect(seen).toHaveLength(1)
    const requested = new URL(seen[0]!.input)
    expect(requested.searchParams.get('g_st')).toBe('ac')
    expect(requested.searchParams.get('_imcp')).toBe('1')
    expect(seen[0]!.headers['User-Agent']).toContain('Mozilla/5.0')
  })

  test('stops as soon as the shortener exposes a normal Maps URL', async () => {
    const seen: string[] = []
    const resolved = await resolveGoogleMapsShortLink(
      'https://maps.app.goo.gl/AbCdEf123',
      async (input) => {
        seen.push(input)
        return new Response(null, {
          status: 302,
          headers: { location: 'https://www.google.com/maps/place/CN+Tower/@43.6426,-79.3871,17z' },
        })
      },
    )

    expect(resolved).toBe('https://www.google.com/maps/place/CN+Tower/@43.6426,-79.3871,17z')
    expect(seen).toEqual(['https://maps.app.goo.gl/AbCdEf123?_imcp=1'])
  })

  test('permits another maps.app.goo.gl hop but never follows a foreign host', async () => {
    const seen: string[] = []
    const resolved = await resolveGoogleMapsShortLink(
      'https://maps.app.goo.gl/first',
      async (input) => {
        seen.push(input)
        if (seen.length === 1) {
          return new Response(null, {
            status: 302,
            headers: { location: 'https://maps.app.goo.gl/second' },
          })
        }
        return new Response(null, {
          status: 302,
          headers: { location: 'https://example.com/private' },
        })
      },
    )

    expect(resolved).toBeNull()
    expect(seen).toEqual([
      'https://maps.app.goo.gl/first?_imcp=1',
      'https://maps.app.goo.gl/second?_imcp=1',
    ])
  })

  test('rejects non-shortener input before making a request', async () => {
    let called = false
    const resolved = await resolveGoogleMapsShortLink(
      'https://maps.app.goo.gl.example.com/not-google',
      async () => {
        called = true
        return new Response(null, { status: 302 })
      },
    )

    expect(resolved).toBeNull()
    expect(called).toBe(false)
  })
})
