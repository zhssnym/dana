import { defaultBlockSpecs } from '@blocknote/core'
import { describe, expect, test } from 'vitest'

import { sharedCanvasParagraph } from './CanvasParagraph.js'
import { taskSchema } from './TaskComposer.js'

describe('Task writing link previews', () => {
  test('installs the shared preview paragraph before the Task schema is built', () => {
    // Importing TaskComposer above constructs its schema after CanvasParagraph
    // installs the shared paragraph treatment in BlockNote's paragraph slot.
    expect(taskSchema.blockSpecs.paragraph).toBeDefined()
    expect(defaultBlockSpecs.paragraph).toBe(sharedCanvasParagraph)
  })
})
