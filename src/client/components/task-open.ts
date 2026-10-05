// A small bus for opening a task, used by rows, the calendar and search, which share
// no ancestor below the layout.

export interface OpenTaskOptions {
  /** The ghost path: the opened row is not the date that was clicked, so show the banner. */
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
