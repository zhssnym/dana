/*
A saved view's address (4.19, 9.1, 9.7).

**9.1's routes table has no row for a saved view, and that is not an
oversight to be filled with a new path.** DES-153 says what a view is: "one
object with four parts, a name; a spine, the one axis it locks; defaults for
every other axis; and a mode", and "every native page of DES-152 is an
instance of it, and so is a view somebody saves for themselves. Nothing is
special-cased." A saved view made on Scheduled is Scheduled with a filter, so
its address is Scheduled's, carrying the filter's id.

`?view=<id>` therefore, which `usePlace` reads and seeds the page's filter
from, exactly as `?mode=` seeds the view and `?state=important` seeds Today's
narrowing. A path of its own would have made a view a seventeenth kind of
surface rather than the page it is a view of.

Recorded as change control in RFC 0005, because a route not in 9.1's table is
a deviation whoever reads that table next is owed an explanation of.
*/
import type { SavedView } from '../../shared/bundle.js'
import { PLACES } from './place-pages.js'
import type { PlaceKey } from './place-pages.js'
import { definitionPage } from './filter.js'

/**
 * Where a saved view opens: the place-page it was made on, carrying its id.
 *
 * A definition naming no page, or naming one this client no longer has, falls
 * back to All, which is the page that locks nothing and can therefore honestly
 * draw any filter (9.5).
 */
export function savedViewPath(view: SavedView): string {
  const named = definitionPage(view.definition)
  const place = named !== null && named in PLACES ? PLACES[named as PlaceKey] : PLACES.all
  return `${place.path}?view=${view.id}`
}
