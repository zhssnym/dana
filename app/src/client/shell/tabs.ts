/*
The tab strip's state (9.1).

**Session-scoped working state, never stored server-side**, which the section
says in terms. So this is a module store like `undo.ts` beside it and not a
query: nothing here is anybody's data, and a tab that survived to another
device would be this product guessing what somebody meant to leave open.

**Every tab is the same tab.** One anatomy, equal treatment, closable and
reorderable, whether it holds a place page, a folder, a shelf or a task.
There is no pinned first tab and no special home, which is what lets the
strip be a list of paths rather than a union of cases.

**The place the viewer stands on is the active tab**, and that sentence is
load-bearing rather than descriptive. It means the strip is never a second
opinion about where the person is: ordinary navigation *retargets* the active
tab, "as an address bar does", so following a link inside the app changes what
the current tab points at rather than opening another one. Only "Open in a new
tab" appends. The router remains the single source of truth about the current
route, and this store is told about it (`retarget`) rather than driving it.

**Ids are not paths.** Two tabs may point at one path (a person may open
Groceries twice), and a tab keeps its identity while its path changes under a
retarget, which is what makes "close this tab" and "reorder these tabs" mean
anything. The counter is monotonic per session for the same reason `caseTitle`
in the acceptance harness is: an id that can repeat is an id that will.
*/
import { useSyncExternalStore } from 'react'

import { paths } from '../routes.js'

export interface Tab {
  readonly id: string
  /** Where this tab points, which a retarget changes and a close does not. */
  readonly path: string
}

interface TabState {
  readonly tabs: readonly Tab[]
  readonly activeId: string
}

let counter = 0
function nextId(): string {
  counter += 1
  return `tab-${counter}`
}

/* The strip is never empty: 9.1 has closing the last tab land on Desk, which
   is a navigation to a place, and a place is a tab. So the store always holds
   at least one, and the initial one is retargeted to wherever the first
   render actually is. */
const first: Tab = { id: nextId(), path: paths.desk }
let state: TabState = { tabs: [first], activeId: first.id }

const listeners = new Set<() => void>()
function publish(): void {
  for (const notify of listeners) notify()
}

export function useTabs(): TabState {
  return useSyncExternalStore(
    (notify) => {
      listeners.add(notify)
      return () => {
        listeners.delete(notify)
      }
    },
    () => state,
    () => state,
  )
}

/**
 * The router moved; point the active tab at where it landed.
 *
 * Called from the shell's own effect on the location, so every navigation
 * this client can make is covered without any link knowing about tabs: a
 * sidebar entry, a folder row, a redirect and the back button all arrive
 * here. A no-op when the path already matches, so it cannot loop with the
 * navigation the other functions below return.
 */
export function retarget(path: string): void {
  const active = state.tabs.find((tab) => tab.id === state.activeId)
  if (active === undefined || active.path === path) return
  /* polish: tabstrip F2. A page that is already open in another tab is
     that tab: a sidebar click switches to it rather than quietly replacing
     whatever the active tab held. Only a page open nowhere retargets the
     active tab, as an address bar does. */
  const open = state.tabs.find((tab) => tab.path === path)
  if (open !== undefined) {
    state = { ...state, activeId: open.id }
    publish()
    return
  }
  state = {
    ...state,
    tabs: state.tabs.map((tab) => (tab.id === state.activeId ? { ...tab, path } : tab)),
  }
  publish()
}

/**
 * "Open in a new tab" (9.1): append a tab and go to it.
 *
 * Appended *beside* the current one rather than at the end of the row,
 * because the section says beside and because a tab opened from the tab you
 * are on belongs next to it: a row that grows at the far edge makes the
 * relationship between the two invisible the moment there are four.
 */
export function openInNewTab(path: string): string {
  /* polish: tabstrip F4. The plus never opens a second tab for a page that
     already has one; it goes to the one that exists. */
  const open = state.tabs.find((tab) => tab.path === path)
  if (open !== undefined) {
    state = { ...state, activeId: open.id }
    publish()
    return path
  }
  const tab: Tab = { id: nextId(), path }
  const at = state.tabs.findIndex((candidate) => candidate.id === state.activeId)
  const tabs = [...state.tabs]
  tabs.splice(at < 0 ? tabs.length : at + 1, 0, tab)
  state = { tabs, activeId: tab.id }
  publish()
  return path
}

/** Make a tab active. Returns where the router should go. */
export function selectTab(id: string): string {
  const tab = state.tabs.find((candidate) => candidate.id === id)
  if (tab === undefined) return state.tabs[0]?.path ?? paths.desk
  state = { ...state, activeId: id }
  publish()
  return tab.path
}

/**
 * Close a tab. Returns where the router should go, or null to stay put.
 *
 * 9.1 fixes both endings. Closing the active tab lands on "the neighbouring
 * place", which is the tab that takes its position: the one to its right if
 * there is one, otherwise the one to its left, which is what every browser
 * does and what a person expects without being able to say so. Closing the
 * last tab lands on Desk, and since the strip is never empty that is a fresh
 * tab pointing there rather than an empty row.
 *
 * Closing a tab that is not active moves nobody, which is why the return is
 * nullable rather than always a path.
 */
export function closeTab(id: string): string | null {
  const at = state.tabs.findIndex((tab) => tab.id === id)
  if (at < 0) return null

  if (state.tabs.length === 1) {
    const fresh: Tab = { id: nextId(), path: paths.desk }
    state = { tabs: [fresh], activeId: fresh.id }
    publish()
    return paths.desk
  }

  const tabs = state.tabs.filter((tab) => tab.id !== id)
  if (id !== state.activeId) {
    state = { ...state, tabs }
    publish()
    return null
  }

  const neighbour = tabs[at] ?? tabs[at - 1]
  if (neighbour === undefined) return null
  state = { tabs, activeId: neighbour.id }
  publish()
  return neighbour.path
}

/**
 * Move a tab, which is what a drag on the strip commits.
 *
 * Indices rather than ids because a drag is a gesture over positions, and the
 * component doing the dragging is the only thing that knows where a pointer
 * ended up.
 */
export function reorderTabs(from: number, to: number): void {
  if (from === to) return
  const tabs = [...state.tabs]
  const [moved] = tabs.splice(from, 1)
  if (moved === undefined) return
  tabs.splice(to, 0, moved)
  state = { ...state, tabs }
  publish()
}
