/*
 * A subscribable seam between the chrome and the overlays it opens (search, shortcuts sheet), so a control
 * anywhere can open one without sharing a tree.
 */

/* `toggle`: Ctrl+K, which closes search when it is already open. */
type SearchListener = (toggle: boolean) => void

const searchListeners = new Set<SearchListener>()

/* The keyboard shortcuts sheet: `?` or "Keyboard shortcuts" in search opens it. */
type ShortcutsListener = () => void
const shortcutsListeners = new Set<ShortcutsListener>()

export function openShortcuts(): void {
  for (const listener of shortcutsListeners) listener()
}

export function onOpenShortcuts(listener: ShortcutsListener): () => void {
  shortcutsListeners.add(listener)
  return () => {
    shortcutsListeners.delete(listener)
  }
}

/*
 * A request with nobody listening latches and the first subscriber drains it: on a cold load the key can arrive
 * before the overlay mounts. One latch, not a queue.
 */
let searchPending = false

export function openSearch(toggle = false): void {
  if (searchListeners.size === 0) {
    searchPending = true
    return
  }
  /* Strict: a click handler passes its event here. */
  for (const listener of searchListeners) listener(toggle === true)
}

export function onOpenSearch(listener: SearchListener): () => void {
  searchListeners.add(listener)
  if (searchPending) {
    searchPending = false
    listener(false)
  }
  return () => {
    searchListeners.delete(listener)
  }
}

/**
 * Installed from `main.tsx` at module scope so the shortcut works before the page tree mounts. Only on /app
 * paths: the landing page has no overlay, and latching there would open search later.
 */
export function installSearchShortcut(target: Document): () => void {
  function isTyping(node: EventTarget | null): boolean {
    if (!(node instanceof HTMLElement)) return false
    const tag = node.tagName.toLowerCase()
    return tag === 'input' || tag === 'textarea' || node.isContentEditable
  }
  function onKeyDown(event: KeyboardEvent): void {
    if (!globalThis.location.pathname.startsWith('/app')) return
    const ctrlK = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k'
    const slash = event.key === '/' && !isTyping(event.target)
    const help =
      event.key === '?' && !event.ctrlKey && !event.metaKey && !event.altKey && !isTyping(event.target)
    if (help) {
      /* A dialog already open owns the keyboard. */
      if (target.querySelector('[aria-modal="true"], [role="dialog"]') !== null) return
      event.preventDefault()
      openShortcuts()
      return
    }
    if (!ctrlK && !slash) return
    event.preventDefault()
    openSearch(ctrlK)
  }
  target.addEventListener('keydown', onKeyDown)
  return () => {
    target.removeEventListener('keydown', onKeyDown)
  }
}
