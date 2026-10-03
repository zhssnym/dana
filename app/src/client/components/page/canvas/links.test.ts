import { describe, expect, test } from 'vitest'

import { googleMapsTarget } from './links.js'

describe('Google Maps link previews', () => {
  test('builds a key-free OpenStreetMap frame from Google coordinates', () => {
    expect(googleMapsTarget('https://www.google.com/maps/place/CN+Tower/@43.6426,-79.3871,17z')).toMatchObject({
      label: 'CN Tower',
      embedSrc: 'https://www.openstreetmap.org/export/embed.html?bbox=-79.3951%2C43.6366%2C-79.3791%2C43.6486&layer=mapnik&marker=43.6426%2C-79.3871',
      needsResolve: false,
    })

    expect(googleMapsTarget('https://www.google.com/maps/place/182+Tall+Grass+Trail/data=!4m6!3m5!1sabc!8m2!3d43.799123!4d-79.584321!16sabc')).toMatchObject({
      label: '182 Tall Grass Trail',
      embedSrc: expect.stringContaining('https://www.openstreetmap.org/export/embed.html?'),
      needsResolve: false,
    })

    expect(googleMapsTarget('https://maps.google.com/?q=43.7735,-79.5019')).toMatchObject({
      label: '43.7735,-79.5019',
      embedSrc: expect.stringContaining('marker=43.7735%2C-79.5019'),
      needsResolve: false,
    })
  })

  test('marks shared links for server resolution and supports country domains', () => {
    expect(googleMapsTarget('https://maps.app.goo.gl/AbCdEf123')).toEqual({
      href: 'https://maps.app.goo.gl/AbCdEf123',
      label: 'Shared location',
      embedSrc: null,
      needsResolve: true,
    })
    expect(googleMapsTarget('https://www.google.ca/maps/place/Toronto/@43.6532,-79.3832,12z')).toMatchObject({
      label: 'Toronto',
      embedSrc: expect.stringContaining('www.openstreetmap.org/export/embed.html'),
      needsResolve: false,
    })
  })

  test('falls back when a valid map URL exposes no coordinates', () => {
    expect(googleMapsTarget('https://www.google.com/maps')).toMatchObject({
      label: 'Map location',
      embedSrc: null,
      needsResolve: false,
    })
    expect(googleMapsTarget('https://www.google.com/maps/search/?api=1&query=York%20University')).toMatchObject({
      label: 'York University',
      embedSrc: null,
      needsResolve: false,
    })
  })

  test('does not claim normal Google pages or lookalike hosts', () => {
    expect(googleMapsTarget('https://www.google.com/search?q=maps')).toBeNull()
    expect(googleMapsTarget('https://google.com.example.org/maps/place/Toronto')).toBeNull()
    expect(googleMapsTarget('https://example.com/maps/place/Toronto')).toBeNull()
  })
})
