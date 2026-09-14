import { fragmentToBlocks } from '@blocknote/core'

import { removesCanvasTask, validateCanvasOutline } from './outline.js'
import type { canvasSchema, CanvasEditor } from './schema.js'

/** One supported transaction hook refuses the whole gesture, before onChange/save. */
export function installCanvasGuard(editor: CanvasEditor, explain: (message: string) => void): () => void {
  return editor.onBeforeChange(({ tr }) => {
    if (!tr.docChanged) return
    const after = fragmentToBlocks<
      typeof canvasSchema.blockSchema,
      typeof canvasSchema.inlineContentSchema,
      typeof canvasSchema.styleSchema
    >(tr.doc.content)
    const before = fragmentToBlocks<
      typeof canvasSchema.blockSchema,
      typeof canvasSchema.inlineContentSchema,
      typeof canvasSchema.styleSchema
    >(tr.before.content)
    const failure = removesCanvasTask(before, after)
      ? 'This selection contains a Task. Use its Dana menu to delete it, or select only the writing.'
      : validateCanvasOutline(after)
    if (failure === null) return
    explain(failure)
    return false
  })
}
