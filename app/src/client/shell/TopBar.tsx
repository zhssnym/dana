/*
9.1's top bar: app name linking to My Day, the global search control, and the
avatar menu carrying Settings and Sign out.

Deliberately not a `nav`. AC-155 reads the sidebar as the first navigation
landmark on the page, which is what the sidebar is; a second landmark above it
would silently become the one that answers.

The search control is named "Search", assigned by the 9.1 control table at the
P8 change control. The overlay it opens is 9.9's and belongs to the Complex
Interaction engineer, so this raises `openSearch()` and stops there; the
shortcut of 9.1, Ctrl+K or /, is bound in AppLayout beside it because a
shortcut belongs to the document rather than to a button.

**This bar keeps all three controls, and that is a ruling rather than a
preference.** The designer's prototype has no top bar at all: `app-sidebar.tsx`
puts the Dana Mark, the wordmark and the global search control in the sidebar's
header and the profile menu in its footer. Ruled at the P8D change control on
2026-08-12 to be a relocation of three named controls rather than a skin of
them, so section 9 wins per 11.13: the top bar carries the app name, the search
control and the avatar menu, and the sidebar receives none of the three. What
ports is the mark itself, rendered here beside the app name that 9.1 already
puts in this bar. It is the easy mistake to read as appearance, the mark being
art, and the controls travelling with it are what make it structure.

The mark is locked: `dana-mark.svg` is DES-030's file unmodified, and it is not
redrawn, outlined, ringed, shadowed or put in a decorative container. Its `alt`
is empty on purpose, so the link's accessible name stays the word "Dana" rather
than becoming the mark's description repeated beside it.

Two accessible names are load-bearing and neither is visible text any more.
"Search" is asserted exactly, so the icon-only control carries it as a label;
and the avatar trigger keeps announcing the person's display name, which is why
the initials beside it are `aria-hidden` rather than a second thing to read.
*/
import { useState } from 'react'
import { Link } from 'react-router'
import { Search } from 'lucide-react'

import { initialsOf } from '../components/ui/index.js'
import { paths } from '../routes.js'
import { openSearch } from './overlays.js'

export function TopBar({
  displayName,
  onSignOut,
}: {
  readonly displayName: string | null
  readonly onSignOut: () => void
}): React.JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false)
  return (
    <header className="shell-topbar">
      <Link className="shell-brand" to={paths.myDay}>
        <img src="/dana-mark.svg" alt="" width="28" height="28" />
        Dana
      </Link>
      <button
        type="button"
        className="icon-control ml-auto"
        aria-label="Search"
        title="Search"
        onClick={() => {
          openSearch()
        }}
      >
        <Search aria-hidden="true" />
      </button>
      <span className="relative inline-flex">
        <button
          type="button"
          className="button-base button-quiet"
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          <span className="avatar" aria-hidden="true">
            {initialsOf(displayName)}
          </span>
          {displayName ?? 'Account'}
        </button>
        {/* Rendered only while open, so the Settings link 9.1 also puts in the
            sidebar is one link at a time rather than two answering to one name. */}
        {menuOpen ? (
          /*
          Still the list P8 shipped, restyled and not re-roled. The trigger
          declares `aria-haspopup="menu"` while this opens a list, which is a
          mismatch worth someone's attention and is deliberately not fixed
          here: giving these two `role="menuitem"` would change what a screen
          reader announces, and this package changes appearance and not
          behaviour. Raised in the session's final block instead.
          */
          <ul className="menu-panel top-full right-0">
            <li>
              <Link className="menu-item" to={paths.settings}>
                Settings
              </Link>
            </li>
            <li>
              <button type="button" className="menu-item" onClick={onSignOut}>
                Sign out
              </button>
            </li>
          </ul>
        ) : null}
      </span>
    </header>
  )
}
