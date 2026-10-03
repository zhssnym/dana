import { describe, expect, test } from 'vitest'

import { googleMapsTarget } from './links.js'

describe('Google Maps link previews', () => {
  test('builds a same-origin map image target from Google coordinates', () => {
    expect(googleMapsTarget('https://www.google.com/maps/place/CN+Tower/@43.6426,-79.3871,17z')).toMatchObject({
      label: 'CN Tower',
      previewSrc: '/api/v1/link-previews/map-image?lat=43.6426&lng=-79.3871',
      needsResolve: false,
    })

    expect(googleMapsTarget('https://www.google.com/maps/place/182+Tall+Grass+Trail/data=!4m6!3m5!1sabc!8m2!3d43.799123!4d-79.584321!16sabc')).toMatchObject({
      label: '182 Tall Grass Trail',
      previewSrc: '/api/v1/link-previews/map-image?lat=43.799123&lng=-79.584321',
      needsResolve: false,
    })

    expect(googleMapsTarget('https://maps.google.com/?q=43.7735,-79.5019')).toMatchObject({
      label: '43.7735,-79.5019',
      previewSrc: '/api/v1/link-previews/map-image?lat=43.7735&lng=-79.5019',
      needsResolve: false,
    })
  })

  test('marks shared links for server resolution and supports country domains', () => {
    expect(googleMapsTarget('https://maps.app.goo.gl/AbCdEf123')).toEqual({
      href: 'https://maps.app.goo.gl/AbCdEf123',
      label: 'Shared location',
      previewSrc: null,
      needsResolve: true,
    })
    expect(googleMapsTarget('https://www.google.ca/maps/place/Toronto/@43.6532,-79.3832,12z')).toMatchObject({
      label: 'Toronto',
      previewSrc: '/api/v1/link-previews/map-image?lat=43.6532&lng=-79.3832',
      needsResolve: false,
    })
  })

  test('falls back when a valid map URL exposes no coordinates', () => {
    expect(googleMapsTarget('https://www.google.com/maps')).toMatchObject({
      label: 'Map location',
      previewSrc: null,
      needsResolve: false,
    })
    expect(googleMapsTarget('https://www.google.com/maps/search/?api=1&query=York%20University')).toMatchObject({
      label: 'York University',
      previewSrc: null,
      needsResolve: false,
    })
  })

  test('does not claim normal Google pages or lookalike hosts', () => {
    expect(googleMapsTarget('https://www.google.com/search?q=maps')).toBeNull()
    expect(googleMapsTarget('https://google.com.example.org/maps/place/Toronto')).toBeNull()
    expect(googleMapsTarget('https://example.com/maps/place/Toronto')).toBeNull()
  })
})
