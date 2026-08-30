/*
The acts a shelf supports, performed: `prototype-v2`'s `lib/shelf-acts.ts`
over this client's addresses (RFC 0004's S27).

The prototype keys a shelf's page by `shelf:<name>` because its fixtures have
no ids, and its own header says the prefix exists so "a shelf called Personal
and a folder called Personal are different objects and must not share a
cover". 4.18 gives a shelf a stable id, and 11.15's v2 hazard is keying by a
name, so the key here is `shelf:<id>`: the prefix `lib/page-identity.ts`
reads to answer the shelf half of an identity, and the id the rename cannot
move. `moveShelfPage` therefore has no work to do and is not carried: 4.18's
lockstep makes a rename the server's transaction, and the page stays where
it was.

`shelfLink` is `lib/nav-links.ts`'s, 9.1's path on the current origin rather
than the prototype's `?state=shelf&shelf=` parameters, and the note the
prototype points to stands: an address, not an invitation (9.10).
`duplicateShelf` is the page's own act on this side, `POST /shelves` plus the
page's blocks, so no event is dispatched.
*/
import { SHELF_PREFIX } from './page-identity.js'
import { shelfLink } from './nav-links.js'
import { showToast } from '../state/toasts.js'

export function shelfKey(id: string): string {
  return `${SHELF_PREFIX}${id}`
}

export { shelfLink }

export function copyShelfLink(id: string, name: string): void {
  void navigator.clipboard?.writeText(shelfLink(id)).catch(() => {})
  showToast(`Link to ${name} copied`)
}
