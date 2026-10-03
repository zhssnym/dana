import { defaultBlockSpecs } from '@blocknote/core'
import { describe, expect, test } from 'vitest'

import { sharedCanvasParagraph } from './CanvasParagraph.js'
import { taskSchema } from './TaskComposer.js'

describe('Task writing link previews', () => {
  test('takes its paragraph treatment from the shared page preview spec', () => {
    expect(defaultBlockSpecs.paragraph).toBe(sharedCanvasParagraph)
    // BlockNote normalizes a block spec while building a schema, so the
    // function identity changes even when the same renderer is the source.
    expect(taskSchema.blockSpecs.paragraph.implementation.render.toString())
      .toBe(sharedCanvasParagraph.implementation.render.toString())
  })
})
