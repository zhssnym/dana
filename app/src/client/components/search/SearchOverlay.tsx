/*
9.9's search overlay: this file wires `components/search-overlay.tsx` to the
shell and the router, and nothing else.

**The overlay is opened by the chrome through `shell/overlays.ts`**, the seam
that lets the sidebar's search control and the two shortcuts of 9.1 could
raise a surface they do not import, and the latch there is what makes a
shortcut pressed before this mounts survive until it does.

**What opening a result means is this file's.** A task opens on 9.3's
surface, which `openTask` raises; a folder, a shelf or a page is a route, so
the router goes there. The lifted overlay hands back an id and a kind and
`lib/search-items.ts` makes a page's id its path, which is why the last arm
below navigates to the id itself.

**The input gives up focus before the dialog starts closing**, and that is a
correctness fix rather than tidiness:
`shell/overlays.ts` refuses the "/" shortcut while the event's target is an
input, the dialog unmounts on a 200 ms exit transition, and a "/" pressed in
that window would be swallowed by a control on its way out. The lifted
overlay focuses its own input a frame after opening; this blurs whatever is
focused inside the dialog when it closes.

**One control on this surface is named and one deliberately is not.** 9.1
names the global search control "Search" and puts it in the sidebar, which
is the shell's; AC-174 counts exactly one button of that name inside the
navigation landmark, so nothing here may answer to it. The overlay's close
control is "Close search", which collides with nothing.
*/
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'

import { onOpenSearch, openShortcuts } from '../../shell/overlays.js'
import { paths } from '../../routes.js'
import { SHORTCUTS_RESULT, placeItems } from '../../lib/search-items.js'
import { openTask } from '../task-open.js'
import { SearchOverlay as LiftedSearchOverlay } from '../search-overlay.js'

export function SearchOverlay(): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const places = useMemo(() => placeItems(), [])

  useEffect(() => onOpenSearch(() => setOpen(true)), [])

  return (
    <LiftedSearchOverlay
      /* Remounted per opening, so the query and the cursor start empty each
         time, which is what the overlay's `initialQuery` default means and
         what a person pressing Ctrl+K expects. */
      key={open ? 'open' : 'closed'}
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          const active = document.activeElement
          if (active instanceof HTMLElement) active.blur()
        }
        setOpen(next)
      }}
      items={places}
      onOpenResult={(id, kind) => {
        if (id === SHORTCUTS_RESULT) openShortcuts()
        else if (kind === 'task') openTask(id)
        else if (kind === 'folder') void navigate(paths.folder(id))
        else if (kind === 'shelf') void navigate(paths.shelf(id))
        else void navigate(id)
      }}
    />
  )
}
