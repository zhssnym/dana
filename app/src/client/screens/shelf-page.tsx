/*
The shelf page, bound through the adapter seam. What is worth knowing:

- **A shelf is keyed by id, never by name** (11.15): the screen takes `id`
  beside `name`, and `shelfKey` is `lib/shelf-acts.ts`'s `shelf:<id>`.
- **The body is the composer** (#221): writing and the native Folder rows are
  `components/page/canvas/ShelfCanvas.tsx`, the Folder canvas's BlockNote
  surface over the Shelf's revisioned document, handed in as `children`.
- **The identity is `lib/page-identity.ts`'s shelf half**, and the picker is
  this client's `IconPicker`: 4.3 and 4.18 store a key and `icon-manifest.ts` is
  the one place a key becomes a glyph, so `folderPageMark` is `markIcon` here.
- **The header is the page head** (round 3): `FolderHeader`, the same mark,
  title, hover "Add cover" and "…" every page wears, so a collection does not
  read as a different kind of screen. No description line, the rule for every
  page since round 2; a stored description stays in the data, undrawn.
- **Rename lives in the title only**: click it, Enter or blur commits,
  Escape puts the name back (AC-203).
*/

import { useState } from "react"
import type { ReactNode } from "react"

import { FolderHeader } from "../components/folder-head.js"
import { markIcon } from "../components/page/icon-manifest.js"
import { PageCover } from "../components/page-cover.js"
import { ObjectMenu } from "../components/object-menu.js"
import { HistorySheet } from "../components/history-sheet.js"
import { IDENTITY_COLOR_FALLBACK } from "../parts/identity-colors.js"
import {
  savePageIdentity as savePrototypeFolderIdentity,
  usePageIdentity as useFolderIdentity,
} from "../lib/page-identity.js"
import { shelfKey } from "../lib/shelf-acts.js"

export function ShelfPage({
  id,
  name,
  children,
  onRename,
  onCopyLink,
  onDuplicate,
  onDelete,
}: {
  /* Seam 2. */
  id: string
  name: string
  /* The composer: writing and the native Folder rows (#221), which
     `components/page/canvas/ShelfCanvas.tsx` owns. */
  children: ReactNode
  onRename?: (next: string) => void
  /* The acts the shell can perform on this shelf. Absent ones simply do not
     draw, which is the contract's own safety property. */
  onCopyLink?: () => void
  onDuplicate?: () => void
  onDelete?: () => void
}) {
  const key = shelfKey(id)
  const identity = useFolderIdentity(key)
  /* Seam 4. */
  const Mark = markIcon(identity.glyph ?? null)

  const [historyOpen, setHistoryOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)

  return (
    <div className="flex min-h-full w-full flex-col space-y-4">
      <PageCover storageName={key} />

      <FolderHeader
        name={name}
        icon={Mark}
        color={identity.color ?? IDENTITY_COLOR_FALLBACK}
        iconKey={identity.glyph ?? null}
        colorKey={identity.color ?? null}
        editable={onRename !== undefined}
        renaming={renaming}
        onRenamingChange={setRenaming}
        onRename={(next) => onRename?.(next)}
        onPickIdentity={(next) =>
          savePrototypeFolderIdentity(key, {
            ...(next.icon === undefined ? {} : { glyph: next.icon }),
            ...(next.color === undefined ? {} : { color: next.color }),
          })
        }
        progress={null}
        coverKey={key}
        actions={
          <ObjectMenu
            kind="shelf"
            name={name}
            width="w-52"
            handlers={{
              history: () => setHistoryOpen(true),
              "copy-link": onCopyLink,
              duplicate: onDuplicate,
              delete: onDelete,
            }}
          />
        }
      />
      <HistorySheet
        kind="shelf"
        subject={id}
        name={name}
        open={historyOpen}
        onOpenChange={setHistoryOpen}
      />

      {/* The page's writing, folder rows among them (#221). */}
      <section>{children}</section>
    </div>
  )
}
