/*
9.1's offline banner: global, persistent while offline, copy normative.

One instance, in the shell, above the outlet. It is global rather than per
page because 10.6's fallback opens every /app path from the cached shell, and
a banner rendered by a page would be missing on exactly the pages a person
reaches while the connection is down.

The banner itself is the designer's, ported as
`components/state-patterns.tsx`, and what stays here is the one thing that
component cannot know: whether Dana is offline. That answer is
`state/connectivity.ts` and never `navigator.onLine`, for the reason the
client's README records at length: a document served from the service
worker's cache with no connection reports the flag as true, because it is set
from the network stack at document creation and a cache hit never asks it.

The copy is the ported component's, which is 9.1's sentence character for
character, and it is not restated here: a string held in two files is two
things to keep in step with one specification.
*/
import { OfflineBanner as OfflineBannerCard } from '../components/index.js'
import { useOnline } from '../state/useOnline.js'

export function OfflineBanner(): React.JSX.Element | null {
  const online = useOnline()
  if (online) return null
  return <OfflineBannerCard className="rounded-none border-x-0 border-t-0" />
}
