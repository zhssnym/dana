import type { AnyEditor } from './BlockSideMenu.js'

// Lets Connected work find the canvas editor it renders after, without a prop through
// every surface. DOM-scoped and cleaned on unmount; not application state.
const editors = new Map<HTMLElement, AnyEditor>()

export function registerCanvasEditor(editor: AnyEditor): () => void {
  let root: HTMLElement | null = null
  let frame = 0
  let stopped = false

  const attach = (): void => {
    frame = 0
    if (stopped) return
    const next = editor.domElement
    if (next === undefined || next === null) {
      frame = window.requestAnimationFrame(attach)
      return
    }
    if (root === next && editors.get(next) === editor) return
    if (root !== null && editors.get(root) === editor) editors.delete(root)
    root = next
    editors.set(root, editor)
    window.dispatchEvent(new CustomEvent('dana:canvas-editor-ready'))
  }

  attach()
  return () => {
    stopped = true
    if (frame !== 0) window.cancelAnimationFrame(frame)
    if (root !== null && editors.get(root) === editor) editors.delete(root)
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
