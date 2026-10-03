import { defaultBlockSpecs } from '@blocknote/core'
import { describe, expect, test } from 'vitest'

import { sharedCanvasParagraph } from './CanvasParagraph.js'
import { taskSchema } from './TaskComposer.js'

describe('Task writing link previews', () => {
  test('uses the same paragraph preview renderer as page writing', () => {
    expect(defaultBlockSpecs.paragraph).toBe(sharedCanvasParagraph)
    expect(taskSchema.blockSpecs.paragraph.implementation.render)
      .toBe(sharedCanvasParagraph.implementation.render)
  })
})
