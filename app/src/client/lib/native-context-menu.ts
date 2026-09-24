/*
r4-system: the browser's own right-click menu makes Dana look like a web page.
Suppress it everywhere except where it is useful: text entry (inputs,
textareas, the editor's contenteditable text) and a live text selection
(copy). A screen with its own menu calls preventDefault in its handler first.
*/
const TEXT = 'input, textarea, [contenteditable]:not([contenteditable="false"])'

export function installNativeContextMenuGuard(doc: Document = document): () => void {
  const onContextMenu = (event: MouseEvent): void => {
    if (event.defaultPrevented) return
    const target = event.target
    if (target instanceof Element && target.closest(TEXT)) return
    const selection = doc.getSelection()
    if (selection && !selection.isCollapsed && selection.toString().trim() !== '') return
    event.preventDefault()
  }
  doc.addEventListener('contextmenu', onContextMenu)
  return () => doc.removeEventListener('contextmenu', onContextMenu)
}
