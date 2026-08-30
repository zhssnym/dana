/*
The seam between the global chrome and the two overlays this session does not
build.

9.1 puts the search control and the floating add button in the chrome, which
is this role's; 9.3's task form and 9.9's search overlay are the Complex
Interaction engineer's, and that session runs after this one. Without a seam
the chrome would either have to import surfaces that do not exist or the
overlays would have to reach up into the chrome and re-render it.

So the chrome asks and something answers. Nothing in this file knows what an
overlay is: `openTaskForm` carries the entry-point defaults of 9.3, which are
the chrome's to decide because 9.3's table keys them by where the person
clicked, and the form's to honour.

The idiom is `state/toasts.ts` again, and for the same reason: a subscribable
module rather than a context, so a control anywhere in the chrome can raise
one without the two being in the same tree.
*/

/** 9.3's entry-point defaults, as the table keys them. */
export interface TaskFormDefaults {
  readonly due_date?: string | null
  readonly important?: boolean
  readonly folder_id?: string
}

type TaskFormListener = (defaults: TaskFormDefaults) => void
type SearchListener = () => void

const taskFormListeners = new Set<TaskFormListener>()
const searchListeners = new Set<SearchListener>()

/*
The New folder dialog, asked for from a page (S27).

9.10's shelf page offers "New folder..." on its Add folder row, and the folder
it makes lands on that shelf; the dialog that does this is the shell's, mounted
once for the reason its own comment gives (a dialog inside the thing that
opens it is unmounted by the refetch its own write causes). The same idiom as
the two above: the page asks, the shell answers, and neither imports the
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

export function openTaskForm(defaults: TaskFormDefaults): void {
  for (const listener of taskFormListeners) listener(defaults)
}

export function onOpenTaskForm(listener: TaskFormListener): () => void {
  taskFormListeners.add(listener)
  return () => {
    taskFormListeners.delete(listener)
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
 * 9.1's two shortcuts for the search control, attached to the document.
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
    if (!ctrlK && !slash) return
    event.preventDefault()
    openSearch()
  }
  target.addEventListener('keydown', onKeyDown)
  return () => {
    target.removeEventListener('keydown', onKeyDown)
  }
}
