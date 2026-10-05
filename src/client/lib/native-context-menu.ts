// Suppress the browser's context menu except in text entry and over a live text
// selection. A screen with its own menu calls preventDefault first.
const FIELD = 'input, textarea'

// The nearest explicit contenteditable decides: task rows inside the editor are
// contenteditable="false".
function isText(target: Element): boolean {
  const nearest = target.closest(`${FIELD}, [contenteditable]`)
  if (nearest === null) return false
  if (nearest.matches(FIELD)) return true
  return nearest.getAttribute('contenteditable') !== 'false'
}

export function installNativeContextMenuGuard(doc: Document = document): () => void {
  const onContextMenu = (event: MouseEvent): void => {
    if (event.defaultPrevented) return
    const target = event.target
    if (target instanceof Element && isText(target)) return
    const selection = doc.getSelection()
    if (selection && !selection.isCollapsed && selection.toString().trim() !== '') return
    event.preventDefault()
  }
  doc.addEventListener('contextmenu', onContextMenu)
  return () => doc.removeEventListener('contextmenu', onContextMenu)
}
