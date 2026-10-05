// Copyable absolute links to Dana objects, built from `routes.ts` paths. Folders are
// addressed by id, never by name.

import { paths } from '../routes.js'

/** A task's address, which Copy link copies. */
export function taskLink(taskId: string): string {
  return absolute(paths.task(taskId))
}

/** Takes the id so a name-keyed call site fails to compile. */
export function folderLink(folderId: string): string {
  return absolute(paths.folder(folderId))
}

/** A shelf is private; an address is still not an invitation. */
export function shelfLink(shelfId: string): string {
  return absolute(paths.shelf(shelfId))
}

// The current origin, via `globalThis.location`: some environments have the global but
// no `window`. The bare path where there is no location.
function absolute(path: string): string {
  const origin = globalThis.location?.origin
  return origin === undefined ? path : new URL(path, origin).toString()
}
