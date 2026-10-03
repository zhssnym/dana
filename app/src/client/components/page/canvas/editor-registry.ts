import type { AnyEditor } from './BlockSideMenu.js'

/*
Issue #526: Connected work is rendered after BlockNote but may be placed back
inside the authored facet document. Keep the editor lookup local to the canvas
rather than adding another prop through every surface that hosts CanvasSurface.

The registry is DOM-scoped and cleaned on unmount. It is not application state:
the document and its autosave remain BlockNote's authority.
*/
const editors = new Map<HTMLElement, AnyEditor>()

export function registerCanvasEditor(editor: AnyEditor): () => void {
  const root = editor.domElement
  if (root === undefined || root === null) return () => undefined
  editors.set(root, editor)
  window.dispatchEvent(new CustomEvent('dana:canvas-editor-ready'))
  return () => {
    if (editors.get(root) === editor) editors.delete(root)
  }
}

export function canvasEditorNear(node: Element | null): AnyEditor | null {
  if (node === null) return null
  const canvas = node.closest('.dana-writing-canvas')
  if (canvas === null) return null
  for (const [root, editor] of editors) {
    if (canvas.contains(root)) return editor
  }
  return null
}
