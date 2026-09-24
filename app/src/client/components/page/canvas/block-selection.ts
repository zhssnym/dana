/*
Block selection: the Notion-style "this whole block is picked" state, apart
from ProseMirror's text selection. Clicking a block's ⋮⋮ handle selects it;
the marquee (unit e2) selects the blocks it touches through the same calls.

The tint is drawn by `BlockSelectionStyle` as a generated stylesheet keyed by
the blocks' `data-id`, never as an attribute written into the editor's DOM,
which ProseMirror would observe and redraw away. Its colour is canvas.css's
`--dana-block-selection` (spec: rgba(35,131,226,.14) light / .24 dark), no
border or outline.

API for other units:
  setBlockSelection(editor, ids)   select exactly these block ids
  blockSelection(editor)           the selected ids, in selection order
  clearBlockSelection(editor)
  onBlockSelection(editor, fn)     subscribe; returns the unsubscribe
*/
import { createElement, useEffect, useSyncExternalStore } from 'react'

// Any BlockNote editor: the canvas's and the Task composer's schemas differ.
interface AnyEditor { readonly document: readonly { id: string }[] }

interface Store { ids: readonly string[]; listeners: Set<() => void> }
const stores = new WeakMap<object, Store>()
const EMPTY: readonly string[] = []

function store(editor: object): Store {
  let found = stores.get(editor)
  if (found === undefined) { found = { ids: EMPTY, listeners: new Set() }; stores.set(editor, found) }
  return found
}

export function setBlockSelection(editor: object, ids: readonly string[]): void {
  const own = store(editor)
  const next = [...new Set(ids)]
  if (next.length === own.ids.length && next.every((id, index) => own.ids[index] === id)) return
  own.ids = next.length === 0 ? EMPTY : next
  for (const listener of own.listeners) listener()
}
export function clearBlockSelection(editor: object): void { setBlockSelection(editor, EMPTY) }
export function blockSelection(editor: object): readonly string[] { return store(editor).ids }
export function onBlockSelection(editor: object, listener: () => void): () => void {
  const own = store(editor)
  own.listeners.add(listener)
  return () => { own.listeners.delete(listener) }
}
export function useBlockSelection(editor: object): readonly string[] {
  return useSyncExternalStore((listener) => onBlockSelection(editor, listener), () => blockSelection(editor))
}

/** The tint for the selected blocks, scoped to this editor's own root. */
export function BlockSelectionStyle({ editor, scope }: { readonly editor: object; readonly scope: string }): React.JSX.Element | null {
  const ids = useBlockSelection(editor)
  if (ids.length === 0) return null
  const selectors = ids.map((id) => `.${scope} .bn-block-outer[data-id="${CSS.escape(id)}"] > .bn-block`).join(',\n')
  return createElement('style', null, `${selectors} { background: var(--dana-block-selection); border-radius: var(--radius-sm); }
.${scope} .bn-editor { caret-color: transparent; }`)
}

export interface BlockSelectionActions {
  /** Remove these blocks (the surface's own rule, e.g. a Task stays). */
  readonly remove: (ids: readonly string[]) => void
  readonly duplicate: (ids: readonly string[]) => void
}

function isMod(event: KeyboardEvent): boolean {
  return /Mac|iPhone|iPad/.test(navigator.platform) ? event.metaKey : event.ctrlKey
}

/*
Keys while blocks are selected: Backspace/Delete remove them, Mod+D
duplicates, Esc clears. Mod+D with a text cursor duplicates the cursor's
block. A click anywhere but a menu, or any other key, drops the selection.
*/
export function useBlockSelectionKeys(
  editor: AnyEditor & { domElement?: HTMLElement; getTextCursorPosition: () => { block: { id: string } } },
  actions: BlockSelectionActions,
): void {
  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      const ids = blockSelection(editor)
      const root = editor.domElement
      const inEditor = root !== undefined && document.activeElement !== null && root.contains(document.activeElement)
      if (event.key.toLowerCase() === 'd' && isMod(event) && !event.shiftKey && !event.altKey) {
        if (ids.length > 0) { event.preventDefault(); actions.duplicate(ids); return }
        if (inEditor) { event.preventDefault(); actions.duplicate([editor.getTextCursorPosition().block.id]) }
        return
      }
      if (ids.length === 0) return
      // A key inside an open menu belongs to the menu.
      if (document.activeElement?.closest('[role="menu"]')) return
      if (event.key === 'Escape') { event.preventDefault(); clearBlockSelection(editor); return }
      if (event.key === 'Backspace' || event.key === 'Delete') {
        event.preventDefault()
        clearBlockSelection(editor)
        actions.remove(ids)
        return
      }
      if (['Shift', 'Control', 'Meta', 'Alt'].includes(event.key)) return
      clearBlockSelection(editor)
    }
    function onPointer(event: PointerEvent): void {
      if (blockSelection(editor).length === 0) return
      const target = event.target as Element | null
      if (target?.closest('[role="menu"], .bn-side-menu')) return
      clearBlockSelection(editor)
    }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('pointerdown', onPointer, true)
    return () => { window.removeEventListener('keydown', onKey, true); window.removeEventListener('pointerdown', onPointer, true) }
  }, [editor, actions])
}

/** `#block-<id>` (Copy link to block) scrolls to that block and selects it. */
export function blockLink(id: string): string {
  const { origin, pathname, search } = window.location
  return `${origin}${pathname}${search}#block-${id}`
}
export function useBlockAnchor(editor: AnyEditor & { domElement?: HTMLElement }, ready: boolean): void {
  useEffect(() => {
    if (!ready) return
    function follow(): void {
      const match = /^#block-(.+)$/.exec(window.location.hash)
      if (match === null) return
      const id = decodeURIComponent(match[1]!)
      const element = editor.domElement?.querySelector(`.bn-block-outer[data-id="${CSS.escape(id)}"]`)
      if (!element) return
      element.scrollIntoView({ block: 'center' })
      setBlockSelection(editor, [id])
    }
    const timer = window.setTimeout(follow, 0)
    window.addEventListener('hashchange', follow)
    return () => { window.clearTimeout(timer); window.removeEventListener('hashchange', follow) }
  }, [editor, ready])
}
