/*
The edit arm of the overlay seam.

`shell/overlays.ts` carries `openTaskForm(defaults)`, which is a creation with
9.3's entry-point defaults and no task identity, and `src/client/README.md`
marks the question of what the seam grows into as this role's call. This is
the answer: a second, narrower bus in this directory rather than a widened one
in the chrome's, so the shell keeps the file it wrote and the surface that
consumes both keeps them in one place.

Two callers exist and neither is chrome. A task row opens the task it draws
(9.5: "click on any row opens the task", and 9.4's overflow "edit"), and both
the calendar and the search overlay open a row they drew. The third caller,
9.5's ghost, is why `upcoming` is here: a ghost opens the series' current
occurrence, which shows a date the person did not click, and 9.5 puts a banner
on that path and on no other.

The idiom is `state/toasts.ts` and `shell/overlays.ts` again, a subscribable
module rather than a context, because the things that raise it are spread
across three trees that never share an ancestor below the layout.
*/

export interface OpenTaskOptions {
  /** 9.5's ghost path: the opened row is not the date that was clicked. */
  readonly upcoming?: boolean
}

type Listener = (taskId: string, options: OpenTaskOptions) => void

const listeners = new Set<Listener>()

export function openTask(taskId: string, options: OpenTaskOptions = {}): void {
  for (const listener of listeners) listener(taskId, options)
}

export function onOpenTask(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
