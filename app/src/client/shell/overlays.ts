/*
The seam between the global chrome and the overlays it opens (search, the
keyboard shortcuts sheet, New folder). Without a seam the chrome would either
have to import those surfaces or they would have to reach up into the chrome
and re-render it.

So the chrome asks and something answers. Nothing in this file knows what an
overlay is. (There is no task form any more: a task is made in the list's own
"New task" row.)

The idiom is `state/toasts.ts` again, and for the same reason: a subscribable
module rather than a context, so a control anywhere in the chrome can raise
one without the two being in the same tree.
*/

type SearchListener = () => void

const searchListeners = new Set<SearchListener>()

/*
The New folder dialog, asked for from a page.

9.10's shelf page offers "New folder..." on its Add folder row, and the folder
it makes lands on that shelf; the dialog that does this is the shell's, mounted
once for the reason its own comment gives (a dialog inside the thing that
opens it is unmounted by the refetch its own write causes). The same idiom as
search below: the page asks, the shell answers, and neither imports the
other. `label` is the shelf the new folder is filed under, or null for one
made from nowhere in particular.
*/
type NewFolderListener = (label: string | null) => void
const newFolderListeners = new Set<NewFolderListener>()

export function openNewFolder(label: string | null): void {
  for (const listener of newFolderListeners) listener(label)
}

export function onOpenNewFolder(listener: NewFolderListener): () => void {
  newFolderListeners.add(listener)
  return () => {
    newFolderListeners.delete(listener)
  }
}

/*
The keyboard shortcuts sheet: `?` opens it, and so does "Keyboard shortcuts"
in search. The shell mounts it once, before any key can be pressed at a page.
*/
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
An open asked for before the overlay existed is remembered, not dropped.

9.1 gives the search control a shortcut, and a shortcut is pressed against
the window rather than against a React tree: on a cold load the key can
arrive before the overlay has mounted and subscribed, and an event delivered
to an empty listener set is gone for good. The person then presses a
documented shortcut and nothing happens, which is indistinguishable from the
shortcut not existing. So a request with nobody listening latches, and the
first subscriber drains it.

One request is latched rather than a queue: opening a surface twice is
opening it once, and a stale request from minutes ago is not something a
person is still waiting for once the surface is finally there.
*/
let searchPending = false

export function openSearch(): void {
  if (searchListeners.size === 0) {
    searchPending = true
    return
  }
  for (const listener of searchListeners) listener()
}

export function onOpenSearch(listener: SearchListener): () => void {
  searchListeners.add(listener)
  if (searchPending) {
    searchPending = false
    listener()
  }
  return () => {
    searchListeners.delete(listener)
  }
}

/**
 * 9.1's two shortcuts for the search control, and `?` for the shortcuts
 * sheet, attached to the document.
 *
 * Installed from `main.tsx` at module scope rather than from a component
 * effect, so the window is listening from the moment the bundle runs instead
 * of from whenever the page tree finishes mounting. That ordering is the
 * whole point: the heavier the page under the chrome, the longer a
 * component-effect listener leaves the shortcut dead, and a shortcut that
 * works only after the app settles is a shortcut a fast typist will find
 * broken.
 *
 * Scoped to the application's own paths: the landing page of 9.2 carries no
 * overlay, and latching there would open search on a later navigation that
 * nobody asked for.
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
    openSearch()
  }
  target.addEventListener('keydown', onKeyDown)
  return () => {
    target.removeEventListener('keydown', onKeyDown)
  }
}
