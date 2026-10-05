import { fragmentToBlocks } from '@blocknote/core'

import { removedCanvasPages, removedCanvasTasks, validateCanvasOutline } from './outline.js'
import type { canvasSchema, CanvasEditor } from './schema.js'

// A sub-page leaves the document only by "Move page to Trash", which runs inside
// `removingPages`; every other gesture that would drop one is refused.
let removable: ReadonlySet<string> = new Set()
export function removingPages(folderIds: readonly string[], run: () => void): void {
  removable = new Set(folderIds)
  try { run() } finally { removable = new Set() }
}

/** Transaction meta: the page already holds this change, so no gesture is judged. */
export const RECONCILED = 'danaReconciled'

/** Refuses the whole gesture in one transaction hook, before onChange and save. */
export function installCanvasGuard(editor: CanvasEditor, explain: (message: string) => void): () => void {
  return editor.onBeforeChange(({ tr }) => {
    if (!tr.docChanged || tr.getMeta(RECONCILED) === true) return
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
    // Outline each task block the refused gesture would have removed.
    const removed = removedCanvasTasks(before, after)
    const pages = removedCanvasPages(before, after).filter((id) => !removable.has(id))
    const failure = removed.length > 0
      ? 'This selection contains a Task (outlined). Select only the writing, or delete the Task from its ⋮⋮ menu.'
      : pages.length > 0
        ? 'This selection contains a page. Move it to Trash from its ⋮⋮ menu.'
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
