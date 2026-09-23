/*
Where a Dana object lives, and how a component gets there.

Nothing here is a second route table: `routes.ts` is 9.1's and stays the only
one. This module answers "what is this object's address" for the components that
need to copy or open one.

**Addresses are paths, never query parameters.** 9.1 fixes a route table and
10.6 fixes an installed app's start_url inside it, and AC-215 states that a
retired path redirects rather than aliases. So every address below is built from
`paths`, and a parameter never reaches the address bar.

**A folder is addressed by id, never by name.** `folderLink` takes an id and
deliberately has no resolver behind it: a resolver here would let a call site
keep passing a name and keep working, which is exactly how a name-keyed habit
survives.

**Why the links are absolute and the navigation is not.** A link is copied and
sent, so it carries an origin; navigation inside the application is the router's
and takes a path, because a client that assigns `window.location` reloads the
whole shell and throws away the query cache 8.3 depends on. Both halves are here
so that a surface performing "copy link" and a surface performing "open it"
cannot disagree about where the object is.
*/

import { paths } from '../routes.js'

/**
 * A task's own address, which is what Copy link copies: 9.1's `/app/tasks/:id`
 * on the current origin.
 */
export function taskLink(taskId: string): string {
  return absolute(paths.task(taskId))
}

/**
 * A folder's own address.
 *
 * Takes the id, for the reason the header gives: 7.4's folders are addressed by
 * id and a name-keyed call site should stop compiling rather than keep working.
 */
export function folderLink(folderId: string): string {
  return absolute(paths.folder(folderId))
}

/** A shelf's address. Private by construction (9.10); an address is still not an invitation. */
export function shelfLink(shelfId: string): string {
  return absolute(paths.shelf(shelfId))
}

/*
The origin the links are built on.

The current origin rather than a configured base, because Dana is one
deployable serving one origin (11.1) and a second source for "where am I" is
a second thing to get wrong in a preview deployment.

`globalThis.location` and not `window.location`, which is this client's own
convention and what the folder call sites already spell. AC-265's fix records
why it matters: an environment can carry the global without carrying
`window`, and the two spellings are not interchangeable there. Guarded
anyway, because the path alone is the honest answer where there is no
location at all.
*/
function absolute(path: string): string {
  const origin = globalThis.location?.origin
  return origin === undefined ? path : new URL(path, origin).toString()
}

/**
 * Legacy parameter navigation, read.
 *
 * A copied link or a bookmark may carry `?task=` or `?folder=`. Answering it
 * with the application's own path costs one redirect and keeps those addresses
 * alive.
 *
 * A folder parameter answers **null** rather than a path: its value is a name
 * and this module refuses to resolve a name into an id. A caller that wants
 * those folder links honoured has the folder table in hand and can look the
 * name up itself, at which point the lookup is visible where it happens.
 */
export function parameterTarget(search: string): string | null {
  const params = new URLSearchParams(search)
  const task = params.get('task')
  return task === null || task === '' ? null : paths.task(task)
}
