/*
Which views are pinned to the sidebar, as `settings-screen.tsx` reads and
writes them: `prototype-v2`'s `lib/page-pins.ts` rewritten over 4.19's
`pinned_views` (RFC 0004's S27).

The prototype keeps a map of name to boolean in `localStorage` and says in its
own header that this is "the shape the eventual column takes". The column
exists, `pinned_views` on the 4.19 bundle, and it is a list of 9.1 keys rather
than a map, so this module reads the bundle out of the query cache, answers
the prototype's three questions from it, and writes the whole list back
through `PATCH /settings`, rebuilt in `navPages`' order so it comes back in
9.1's order rather than the order things were pressed.

**The three exported names are the prototype's**, `usePagePins`,
`isPagePinned` and `setPagePinned`, so the lifted screen's imports do not
move. `PagePins` is the bundle's own list here rather than the prototype's
map, and `isPagePinned` is the one function that knows the difference.

**A locked page is written as pinned as well as drawn that way**, which
`pages/SettingsPage.tsx` argued before this file existed and the argument
crosses with it: the sidebar keeps Desk either way, `pinnable: false` being
its rule too, but a stored list that disagrees with the switch a person is
looking at is the kind of difference nobody notices until something reads
the list and not the rule.

**The read falls back to 9.1's defaults rather than to nothing**, which is
`pinnedNavPages`'s own rule generalised: a settings page that shows every
view unpinned while a read is in flight is a page that invites a person to
fix something that was never broken.

This is a plain-function writer rather than a `useMutation` so the lifted
screen can call it from a handler as the prototype does; it invalidates by
hand for the reason `lib/page-identity.ts` gives, the mutation cache's own
`onSuccess` never seeing a write that did not go through it.
*/
import { useBundle } from '../api/queries.js'
import { mutateApi } from '../api/http.js'
import { queryClient, writeFailureMessage } from '../api/queryClient.js'
import { queryKeys } from '../api/keys.js'
import { getSettingsResponse } from '../../shared/bundle.js'
import type { GetSettingsResponse } from '../../shared/bundle.js'
import { showToast } from '../state/toasts.js'
import { DEFAULT_PINNED_KEYS, navPages } from '../routes.js'
import { navPageNamed } from './nav-model.js'
import type { NavPageName } from './nav-model.js'

/** The stored list of 9.1 keys, or the defaults while the bundle is in flight. */
export type PagePins = readonly string[]

export function usePagePins(): PagePins {
  const bundle = useBundle()
  return bundle.data?.pinned_views ?? DEFAULT_PINNED_KEYS
}

/*
Whether a page shows in the sidebar right now.

A page that cannot be hidden is always shown, whatever is in the store: the
prototype's own reasoning, "the store could carry a stale `false` from before
that rule existed, and a rule that only holds for new data is not a rule".
*/
export function isPagePinned(name: NavPageName, pins: PagePins): boolean {
  const page = navPageNamed(name)
  if (!page) return false
  if (!page.hideable) return true
  return pins.includes(page.key)
}

export function setPagePinned(name: NavPageName, pinned: boolean): void {
  const page = navPageNamed(name)
  if (!page) return
  const client = queryClient()
  const held = client?.getQueryData<GetSettingsResponse>(queryKeys.bundle())
  const current = new Set<string>(held?.pinned_views ?? DEFAULT_PINNED_KEYS)
  const keys = navPages
    .filter((candidate) =>
      candidate.key === page.key
        ? pinned
        : !candidate.pinnable || current.has(candidate.key),
    )
    .map((candidate) => candidate.key)
  void mutateApi(getSettingsResponse, {
    method: 'PATCH',
    path: '/settings',
    body: { pinned_views: keys },
  })
    .then((next) => {
      client?.setQueryData(queryKeys.bundle(), next)
      void client?.invalidateQueries()
    })
    .catch((error: unknown) => showToast(writeFailureMessage(error)))
}
