import { fragmentToBlocks } from '@blocknote/core'

import { removedCanvasTasks, validateCanvasOutline } from './outline.js'
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
    /*
    The guard reads the document, not the screen, so the refusal also points
    at what it refused for: each Task block the gesture would have removed is
    outlined for a moment (#314). A finished Task draws a slim "Completed Task"
    line (`CanvasTask.tsx`), so the outline always has something to land on.
    */
    const removed = removedCanvasTasks(before, after)
    const failure = removed.length > 0
      ? 'This selection contains a Task (outlined). Select only the writing, or delete the Task from its own menu.'
      : validateCanvasOutline(after)
    if (removed.length > 0) flagRefused(editor.domElement, removed)
    if (failure === null) return
    explain(failure)
    return false
  })
}

function flagRefused(root: HTMLElement | undefined, ids: readonly string[]): void {
  if (root === undefined) return
  const marked = ids.flatMap((id) => [...root.querySelectorAll<HTMLElement>(`[data-canvas-task-id="${CSS.escape(id)}"]`)])
  for (const element of marked) element.setAttribute('data-canvas-task-refused', '')
  window.setTimeout(() => { for (const element of marked) element.removeAttribute('data-canvas-task-refused') }, 2000)
}
