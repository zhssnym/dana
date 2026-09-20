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
    /*
    **The refusal has to be true of a Task nobody can see.** This hook reads
    the document, not the screen, and a finished Task keeps its block and its
    `page_position` while drawing no row at all (`CanvasTask.tsx`). So a
    drag-select across what looks like two adjacent paragraphs can span one,
    and the whole transaction is vetoed with nothing visible to point at.

    What stood here — "Use its Dana menu to delete it" — named a control that
    was not there twice over. There is no menu called "Dana menu": a Task's
    actions are on its row, under "More actions", measured on the running page.
    And a finished Task draws no row in the body to hang one off, which is the
    state this message is most often read in. So the first clause now says why
    the selection can contain something invisible, and the second names where
    the Task actually is.

    Changed with the collapse in `CanvasTask.tsx` and not before it: until the
    block occupied nothing, a person could at least see the 6px it left behind.
    */
    const failure = removesCanvasTask(before, after)
      ? 'This selection contains a Task, and a finished Task keeps its place here without a row. ' +
        'Select only the writing, or delete the Task from its row in the list or in Done.'
      : validateCanvasOutline(after)
    if (failure === null) return
    explain(failure)
    return false
  })
}
