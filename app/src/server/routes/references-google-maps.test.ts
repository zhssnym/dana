import { describe, expect, test } from 'vitest'

import { resolveGoogleMapsShortLink } from './references.js'

describe('Google Maps short-link resolution', () => {
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
    expect(seen).toEqual(['https://maps.app.goo.gl/AbCdEf123'])
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
      'https://maps.app.goo.gl/first',
      'https://maps.app.goo.gl/second',
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
