/*
9.1's offline banner: global, persistent while offline, copy normative.

One instance, in the layout, above the outlet. It is global rather than
per page because 10.6's fallback opens every /app path from the cached shell,
and a banner rendered by a page would be missing on exactly the pages a person
reaches while the connection is down.
*/
import { WifiOff } from 'lucide-react'

import { useOnline } from '../state/useOnline.js'

/** 9.1, verbatim. Design may restyle, not reword. */
export const OFFLINE_BANNER =
  "You're offline. Dana needs a connection; changes can't be saved right now."

export function OfflineBanner(): React.JSX.Element | null {
  const online = useOnline()
  if (online) return null
  return (
    <div className="banner banner-offline" role="status" aria-live="polite">
      {/* The glyph is never the cue: the sentence beside it is the whole of
          what 9.1 specifies and the only thing announced. */}
      <WifiOff aria-hidden="true" />
      <p>{OFFLINE_BANNER}</p>
    </div>
  )
}
