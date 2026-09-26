/*
Retired (M4): a task always opens as its one full page, /app/tasks/:id, so
Settings no longer offers "Open tasks in" and nothing reads the choice.

`user_settings.task_open` stays on the server, untouched. The browser mirror
`dana.taskSurface` is retired: never rename or reuse the key. Sign-out still
removes it, so a shared device keeps nothing of the previous person.
*/

/** Retired, never reuse. */
const KEY = 'dana.taskSurface'

/** A shared device must not keep the previous person's mirror. */
export function clearTaskOpenMirror(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* Nothing stored is nothing to clear. */
  }
}
