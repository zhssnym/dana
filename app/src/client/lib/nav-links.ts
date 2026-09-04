/*
Where a Dana object lives, and how a lifted component gets there.

The navigation half of RFC 0004's S22 row, lifted against
`docs/design/prototype-v2/` at `7d2064c`; that prototype is deleted
(`a7886df`, 2026-09-01) and is in git history before that commit. Nothing
here is a second route table: `routes.ts` is 9.1's and stays the only one.
This module exists so that the components arriving at S23 and S24 can ask the
question they already know how to ask.

**The seam, and it is two seams wearing one coat.**

The *scheme* is the visible one. `prototype-v2` navigates by query parameter
on whatever URL it is standing on: a task is `?task=<id>`
(`src/lib/folder-duplicate.ts:345`), a folder is `?state=folder&folder=<name>`
(`src/lib/folder-acts.ts:104`), and the shell reads both back out of
`window.location.search` to decide what to draw (`src/components/app-shell.tsx:89`).
That is what a prototype served from one HTML file can do. Dana addresses the
same objects by path, because 9.1 fixes a route table and 10.6 fixes an
installed app's start_url inside it, and because AC-215 asserts that a
retired path redirects rather than aliases. So every address below is built
from `paths`, and a parameter never reaches the address bar.

The *key* is the second seam and is the one that would have been missed. The
prototype addresses a folder by its **name**, because its store is name-keyed
and a name is what it has. Dana addresses a folder by its id, and RFC 0004's
close forbids the name-keyed store crossing at all. So `folderLink` takes an
id where the prototype's takes a name, which is the one signature change in
this file and is deliberately not hidden behind a lookup: a resolver here
would let a lifted call site keep passing a name and keep working, which is
exactly how a name-keyed habit survives a port.

**Why the links are absolute and the navigation is not.** A link is copied
and sent, so it carries an origin; navigation inside the application is the
router's and takes a path, because a client that assigns `window.location`
reloads the whole shell and throws away the query cache 8.3 depends on. Both
halves are here so that a surface performing "copy link" and a surface
performing "open it" cannot disagree about where the object is.
*/

import { paths } from '../routes.js'

/**
 * A task's own address (DES-201), which is what Copy link copies.
 *
 * The prototype's `taskLink` builds `?task=<id>` on the current URL; this
 * builds 9.1's `/app/tasks/:id` on the current origin. Same act, same
 * signature, the section's scheme.
 */
export function taskLink(taskId: string): string {
  return absolute(paths.task(taskId))
}

/**
 * A folder's own address.
 *
 * Takes the id where the prototype's takes the name, for the reason the
 * header gives: 7.4's folders are addressed by id and a name-keyed call site
 * should stop compiling rather than keep working.
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
 * The prototype's parameter navigation, read.
 *
 * This is the compatibility half and it has one job: a link somebody copied
 * out of the prototype, or a bookmark taken from the shared build, carries
 * `?task=` or `?folder=`. Answering it with the application's own path costs
 * one redirect and keeps those addresses alive.
 *
 * A folder parameter answers **null** rather than a path, and that is the
 * seam speaking rather than an omission: the prototype's value is a name and
 * this module refuses to resolve a name into an id. A caller that wants the
 * old folder links honoured has the folder table in hand and can look the
 * name up itself, at which point the lookup is visible where it happens.
 */
export function parameterTarget(search: string): string | null {
  const params = new URLSearchParams(search)
  const task = params.get('task')
  return task === null || task === '' ? null : paths.task(task)
}
