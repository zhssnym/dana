/*
r4-system: the browser's own right-click menu makes Dana look like a web page.
Suppress it everywhere except where it is useful: text entry (inputs,
textareas, the editor's contenteditable text) and a live text selection
(copy). A screen with its own menu calls preventDefault in its handler first.
*/
const FIELD = 'input, textarea'

/* r5: the NEAREST element with an explicit contenteditable decides. A task
   row or divider inside the editor is contenteditable="false" inside the
   editable editor; checking any editable ancestor let the native menu
   through there. */
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
