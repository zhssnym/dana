import { describe, expect, it } from 'vitest'

import { surfacePreferenceFor } from './task-surface-preference.js'

describe('task-open preference translation', () => {
  it('maps the account spelling to the two rendered surface modes', () => {
    expect(surfacePreferenceFor('dialog')).toBe('dialog')
    expect(surfacePreferenceFor('panel')).toBe('right')
    expect(surfacePreferenceFor('tab')).toBe('dialog')
  })
})
