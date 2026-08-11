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

export function openTaskForm(defaults: TaskFormDefaults): void {
  for (const listener of taskFormListeners) listener(defaults)
}

export function onOpenTaskForm(listener: TaskFormListener): () => void {
  taskFormListeners.add(listener)
  return () => {
    taskFormListeners.delete(listener)
  }
}

export function openSearch(): void {
  for (const listener of searchListeners) listener()
}

export function onOpenSearch(listener: SearchListener): () => void {
  searchListeners.add(listener)
  return () => {
    searchListeners.delete(listener)
  }
}
