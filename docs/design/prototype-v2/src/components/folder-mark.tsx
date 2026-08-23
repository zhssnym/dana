/*
A folder's mark, wherever a folder is named.

Imran, 2026-08-22: the sidebar shows the glyph a person picked for a folder —
a house for Home, a car for Travel — and everywhere else the same folder was
still drawing the generic one. "This thing needs consistency not only in
Assignments page, in all task rows wherever they might be."

He is right, and the cause is worth naming because it will recur: DES-130 put
a folder's identity in the presentation store, but only the two surfaces
written *after* that ruling — the sidebar row and the folder page — ever read
it. Every older surface kept the literal `Folder` glyph it was written with,
so identity stopped at the sidebar's edge. An identity that only some surfaces
honour is not an identity; it is a decoration on one screen.

So there is one resolver and every surface asks it. A folder with no chosen
glyph still answers the plain folder, which is why this can replace the
literal safely: the default is the thing it is replacing.

`useFolderMark` rather than a component, because the call sites need the two
values separately — the row's chip takes `icon` and `color` as props, the card
takes them somewhere else — and a component that could only be rendered whole
would have forced each of them to be rewritten around it.
*/

import { folderGlyph } from "@/components/folder-icon-picker"
import {
  readPrototypeFolderPresentation,
  useFolderIdentity,
} from "@/lib/folder-presentation"
import type { IconProps, LucideIcon } from "@/lib/icons"

/*
**A task with no folder is in Desk**, and that fact is resolved here rather
than at each call site.

It was not, and the seam showed: the card's folder chip read its *label* as
`task.folder?.name ?? "Desk"` and its *icon* as `folderMarkFor(task.folder
?.name)`, so an unfiled task said "Desk" beside a generic folder mark. One
fallback written twice, once correctly. Every call site that asks either
question now gets the same answer, because there is only one place the
question is answered.

The name is the default folder's, which spec 9.3's entry-default table gives
as the destination of every capture and 9.1 pins first in the sidebar.
*/
export const DEFAULT_FOLDER_NAME = "Desk"

export function folderNameOf(name: string | undefined) {
  return name?.trim() ? name : DEFAULT_FOLDER_NAME
}

export function useFolderMark(
  name: string | undefined,
  /* What the row already believed the colour was. A folder the person has
     never dressed keeps it, so nothing changes colour just because this
     started being asked. */
  fallbackColor?: string,
): { Icon: LucideIcon; color: string | undefined } {
  const resolved = folderNameOf(name)
  const identity = useFolderIdentity(resolved)
  return {
    Icon: folderGlyph(identity.glyph, resolved),
    color: identity.color ?? fallbackColor,
  }
}

/*
The same answer without a hook, for the call sites that cannot have one — an
icon passed as a prop, or a mark resolved inside a `.map`. It reads the store
directly, so it does not re-render when the identity changes; every current
caller is inside a menu that is mounted fresh each time it opens, which is why
that is acceptable here and would not be on a row.
*/
/*
A folder-backed *page*'s mark, resolved as it renders.

Desk is the case, and it was broken in a way only a change could reveal:
`nav-model.ts` built its icon once, at module load, as
`folderGlyph(undefined, "Desk")` — with the chosen glyph hardcoded to
`undefined` — and the sidebar read that frozen value. So Desk could be dressed
like any other folder and the sidebar went on showing the tray, for the whole
session (Imran, 2026-08-22: "If a user change Desk icon so the updated icon
should be appear on the sidebar too").

The component is built once per name and cached, because a component identity
created during render is a component that remounts on every render — which
would restart the glyph's animation each time anything in the sidebar moved.
*/
const pageMarks = new Map<string, LucideIcon>()

export function folderPageMark(name: string): LucideIcon {
  const cached = pageMarks.get(name)
  if (cached) return cached
  function ResolvedFolderPageMark(props: IconProps) {
    const { Icon } = useFolderMark(name)
    return <Icon {...props} />
  }
  pageMarks.set(name, ResolvedFolderPageMark)
  return ResolvedFolderPageMark
}

export function folderMarkFor(name: string | undefined): LucideIcon {
  const resolved = folderNameOf(name)
  const identity = readPrototypeFolderPresentation().identity[resolved]
  return folderGlyph(identity?.glyph, resolved)
}

/* The whole mark, for the call sites that just want to draw it. */
export function FolderMark({
  name,
  color,
  className = "size-4",
  strokeWidth = 1.75,
}: {
  name: string | undefined
  color?: string
  className?: string
  strokeWidth?: number
}) {
  const mark = useFolderMark(name, color)
  return (
    <mark.Icon
      className={className}
      style={mark.color ? { color: mark.color } : undefined}
      strokeWidth={strokeWidth}
      aria-hidden="true"
    />
  )
}
