import { describe, expect, test } from 'vitest'

import { googleMapsTarget } from './links.js'

describe('Google Maps link previews', () => {
  test('recognizes long place and search URLs', () => {
    expect(googleMapsTarget('https://www.google.com/maps/place/CN+Tower/@43.6426,-79.3871,17z')).toMatchObject({
      label: 'CN Tower',
    })
    expect(googleMapsTarget('https://www.google.com/maps/search/?api=1&query=York%20University')).toMatchObject({
      label: 'York University',
    })
    expect(googleMapsTarget('https://maps.google.com/?q=Toronto')).toMatchObject({
      label: 'Toronto',
    })
  })

  test('recognizes shared and country-domain map links without resolving them', () => {
    expect(googleMapsTarget('https://maps.app.goo.gl/AbCdEf123')).toEqual({
      href: 'https://maps.app.goo.gl/AbCdEf123',
      label: 'Shared location',
    })
    expect(googleMapsTarget('https://www.google.ca/maps/place/Toronto')).toMatchObject({
      label: 'Toronto',
    })
  })

  test('does not claim normal Google pages or lookalike hosts', () => {
    expect(googleMapsTarget('https://www.google.com/search?q=maps')).toBeNull()
    expect(googleMapsTarget('https://google.com.example.org/maps/place/Toronto')).toBeNull()
    expect(googleMapsTarget('https://example.com/maps/place/Toronto')).toBeNull()
  })
})
