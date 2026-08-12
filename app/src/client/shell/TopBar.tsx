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
*/
import { useState } from 'react'
import { Link } from 'react-router'

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
    <header>
      <Link to={paths.myDay}>Dana</Link>
      <button
        type="button"
        onClick={() => {
          openSearch()
        }}
      >
        Search
      </button>
      <button
        type="button"
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        onClick={() => setMenuOpen(!menuOpen)}
      >
        {displayName ?? 'Account'}
      </button>
      {/* Rendered only while open, so the Settings link 9.1 also puts in the
          sidebar is one link at a time rather than two answering to one name. */}
      {menuOpen ? (
        <ul>
          <li>
            <Link to={paths.settings}>Settings</Link>
          </li>
          <li>
            <button type="button" onClick={onSignOut}>
              Sign out
            </button>
          </li>
        </ul>
      ) : null}
    </header>
  )
}
