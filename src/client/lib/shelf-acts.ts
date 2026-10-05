// Shelf acts. A shelf's page key is `shelf:<id>`, so a rename cannot move it.
import { SHELF_PREFIX } from './page-identity.js'
import { shelfLink } from './nav-links.js'

export function shelfKey(id: string): string {
  return `${SHELF_PREFIX}${id}`
}

export { shelfLink }

/** Copy a shelf's address silently. */
export function copyShelfLink(id: string): void {
  void navigator.clipboard?.writeText(shelfLink(id)).catch(() => {})
}
