import { describe, expect, it } from 'vitest'

import { defaultFolderDescription } from './folder-description.js'

describe('defaultFolderDescription', () => {
  it('gives a new folder editable page copy based on its name', () => {
    expect(defaultFolderDescription('Website launch')).toBe(
      'Tasks, notes, and plans for Website launch.',
    )
  })
})
